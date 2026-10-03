import { describe, expect, it } from 'vitest';
import { indexById } from './collections';
import { MAX_CENTS } from './model';
import {
  makeAccount,
  makeBudget,
  makeCategory,
  makeExpense,
  makeRecurring,
  makeTransfer,
} from './testing/factories';
import {
  canModifyTransaction,
  validateAccountName,
  validateAmount,
  validateBudget,
  validateCategoryName,
  validateDescription,
  validateRecurring,
  validateTransaction,
  type TransactionDraft,
} from './validation';

// Un escenario chico con cuentas y categorías en todos los estados posibles.
const cash = makeAccount({ name: 'Efectivo' });
const bank = makeAccount({ name: 'Banco' });
const usd = makeAccount({ name: 'Caja USD', currency: 'USD' });
const archived = makeAccount({ name: 'Vieja', archivedAt: 1 });
const deleted = makeAccount({ name: 'Borrada', deletedAt: 1 });
const food = makeCategory({ name: 'Comida', type: 'expense' });
const salary = makeCategory({ name: 'Salario', type: 'income' });
const oldCategory = makeCategory({ name: 'Viejos gastos', type: 'expense', archivedAt: 1 });

const ctx = {
  accounts: indexById([cash, bank, usd, archived, deleted]),
  categories: indexById([food, salary, oldCategory]),
};

const expense: TransactionDraft = {
  type: 'expense',
  amount: 500_00,
  date: '2026-10-03',
  description: '  Súper  ',
  accountId: cash.id,
  categoryId: food.id,
};

describe('validateTransaction: gasto e ingreso', () => {
  // Un gasto válido devuelve los campos limpios: descripción sin espacios y sin campos de más.
  it('acepta un gasto válido y limpia los campos', () => {
    const result = validateTransaction({ ...expense, toAccountId: bank.id }, ctx);
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'expense',
        amount: 500_00,
        date: '2026-10-03',
        description: 'Súper',
        accountId: cash.id,
        categoryId: food.id,
      },
    });
  });

  // Se juntan todos los errores a la vez, uno por campo, para mostrarlos en el formulario.
  it('reporta un error por campo', () => {
    const result = validateTransaction(
      {
        ...expense,
        amount: 0,
        date: '2026-02-30',
        description: 'x'.repeat(201),
        accountId: '',
        categoryId: '',
      },
      ctx,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        amount: { code: 'amount.notPositive' },
        date: { code: 'date.invalid' },
        description: { code: 'description.tooLong', max: 200 },
        accountId: { code: 'account.required' },
        categoryId: { code: 'category.required' },
      },
    });
  });

  it.each([
    ['archivada', archived.id, { code: 'account.archived', name: 'Vieja' }],
    ['eliminada', deleted.id, { code: 'account.missing' }],
    ['inexistente', 'nada', { code: 'account.missing' }],
  ])('rechaza una cuenta %s', (_label, accountId, error) => {
    const result = validateTransaction({ ...expense, accountId }, ctx);
    expect(!result.ok && result.error.accountId).toEqual(error);
  });

  // La categoría tiene que ser del mismo tipo que el movimiento.
  it('rechaza una categoría de otro tipo', () => {
    const result = validateTransaction({ ...expense, categoryId: salary.id }, ctx);
    expect(!result.ok && result.error.categoryId).toEqual({ code: 'category.typeMismatch' });
  });

  // SRS 5.3: una categoría archivada no se puede elegir, salvo que ya estuviera asignada.
  it('categoría archivada: solo si ya la tenía el movimiento que se edita', () => {
    const draft = { ...expense, categoryId: oldCategory.id };
    expect(validateTransaction(draft, ctx).ok).toBe(false);
    const original = makeExpense({ accountId: cash.id, categoryId: oldCategory.id });
    expect(validateTransaction(draft, ctx, original).ok).toBe(true);
  });

  // Los centavos ya convertidos también se controlan (por ejemplo, si vienen de la voz).
  it('validateAmount', () => {
    expect(validateAmount(1.5).ok).toBe(false);
    expect(validateAmount(MAX_CENTS + 1)).toEqual({
      ok: false,
      error: { code: 'amount.tooLarge' },
    });
    expect(validateAmount(MAX_CENTS).ok).toBe(true);
  });
});

describe('validateTransaction: transferencia y cambio', () => {
  const transfer: TransactionDraft = {
    type: 'transfer',
    amount: 1_000_00,
    date: '2026-10-03',
    description: '',
    accountId: cash.id,
    toAccountId: bank.id,
    categoryId: food.id,
  };

  // Una transferencia válida no conserva la categoría que venía del formulario.
  it('acepta una transferencia y descarta la categoría', () => {
    const result = validateTransaction(transfer, ctx);
    expect(result.ok && result.value).toEqual({
      type: 'transfer',
      amount: 1_000_00,
      date: '2026-10-03',
      description: '',
      accountId: cash.id,
      toAccountId: bank.id,
    });
  });

  // TC-03: no se puede transferir entre monedas distintas; tampoco a la misma cuenta.
  it.each([
    ['otra moneda (TC-03)', usd.id, 'account.currencyMismatch'],
    ['la misma cuenta', cash.id, 'account.sameAsOrigin'],
    ['una cuenta archivada', archived.id, 'account.archived'],
    ['sin destino', undefined, 'account.required'],
  ])('rechaza transferir a %s', (_label, toAccountId, code) => {
    const result = validateTransaction({ ...transfer, toAccountId }, ctx);
    expect(!result.ok && result.error.toAccountId?.code).toBe(code);
  });

  // Un cambio de moneda exige monedas distintas y los dos montos.
  it('cambio de moneda', () => {
    const exchange: TransactionDraft = {
      ...transfer,
      type: 'exchange',
      toAccountId: usd.id,
      toAmount: 100_00,
    };
    expect(validateTransaction(exchange, ctx).ok).toBe(true);

    const sameCurrency = validateTransaction({ ...exchange, toAccountId: bank.id }, ctx);
    expect(!sameCurrency.ok && sameCurrency.error.toAccountId?.code).toBe('account.sameCurrency');

    const noToAmount = validateTransaction({ ...exchange, toAmount: undefined }, ctx);
    expect(!noToAmount.ok && noToAmount.error.toAmount?.code).toBe('amount.notPositive');
  });
});

describe('canModifyTransaction (SRS 5.3)', () => {
  // Un movimiento con una cuenta archivada se ve pero no se edita ni elimina.
  it('bloquea si el origen o el destino están archivados', () => {
    const tx = makeTransfer({ accountId: cash.id, toAccountId: archived.id });
    expect(canModifyTransaction(tx, ctx.accounts)).toEqual({
      ok: false,
      error: { code: 'transaction.lockedByArchivedAccount', name: 'Vieja' },
    });
    const ok = makeExpense({ accountId: cash.id, categoryId: food.id });
    expect(canModifyTransaction(ok, ctx.accounts).ok).toBe(true);
  });
});

describe('nombres y descripción', () => {
  // Único entre las activas, sin distinguir mayúsculas; las archivadas no cuentan.
  it('validateAccountName', () => {
    const accounts = [cash, archived];
    expect(validateAccountName('  efectivo ', accounts)).toEqual({
      ok: false,
      error: { code: 'name.duplicateAccount', name: 'efectivo' },
    });
    expect(validateAccountName('Vieja', accounts)).toEqual({ ok: true, value: 'Vieja' });
    // Al editar, la propia cuenta no choca consigo misma.
    expect(validateAccountName('Efectivo', accounts, cash.id).ok).toBe(true);
    expect(validateAccountName('   ', accounts).ok).toBe(false);
    expect(validateAccountName('x'.repeat(51), accounts)).toEqual({
      ok: false,
      error: { code: 'name.tooLong', max: 50 },
    });
  });

  // Las categorías pueden repetir nombre si son de distinto tipo.
  it('validateCategoryName', () => {
    const categories = [food, salary];
    expect(validateCategoryName('COMIDA', 'expense', categories).ok).toBe(false);
    expect(validateCategoryName('Comida', 'income', categories).ok).toBe(true);
    expect(validateCategoryName('x'.repeat(41), 'income', categories).ok).toBe(false);
  });

  it('validateDescription', () => {
    expect(validateDescription('x'.repeat(200)).ok).toBe(true);
    expect(validateDescription('x'.repeat(201)).ok).toBe(false);
  });
});

describe('validateRecurring', () => {
  const draft = {
    type: 'expense' as const,
    amount: 10_000_00,
    description: 'Alquiler',
    accountId: cash.id,
    categoryId: food.id,
    frequency: 'monthly' as const,
    startDate: '2026-01-31',
    endDate: null,
  };

  it('acepta un recurrente válido', () => {
    expect(validateRecurring(draft, ctx)).toEqual({ ok: true, value: { ...draft } });
  });

  // Usa las mismas reglas que un movimiento, y la fecha de fin no puede ser anterior al inicio.
  it('reporta errores de cuentas, fechas y fin', () => {
    const result = validateRecurring(
      { ...draft, accountId: archived.id, startDate: 'mal', endDate: '2025-01-01' },
      ctx,
    );
    expect(!result.ok && result.error).toEqual({
      accountId: { code: 'account.archived', name: 'Vieja' },
      startDate: { code: 'date.invalid' },
      endDate: { code: 'date.endBeforeStart' },
    });
  });

  // Igual que en los movimientos: al editar se puede conservar una categoría archivada.
  it('conserva la categoría archivada al editar', () => {
    const original = makeRecurring({ accountId: cash.id, categoryId: oldCategory.id });
    const edited = { ...draft, categoryId: oldCategory.id };
    expect(validateRecurring(edited, ctx).ok).toBe(false);
    expect(validateRecurring(edited, ctx, original).ok).toBe(true);
  });
});

describe('validateBudget (SRS 5.9)', () => {
  // Solo categorías de gasto activas y un límite positivo.
  it('valida categoría y monto', () => {
    expect(
      validateBudget({ categoryId: food.id, currency: 'ARS', amount: 1 }, ctx.categories).ok,
    ).toBe(true);
    expect(
      validateBudget({ categoryId: salary.id, currency: 'ARS', amount: 0 }, ctx.categories),
    ).toEqual({
      ok: false,
      error: {
        amount: { code: 'amount.notPositive' },
        categoryId: { code: 'category.typeMismatch' },
      },
    });
    const original = makeBudget({ categoryId: oldCategory.id });
    const draft = { categoryId: oldCategory.id, currency: 'ARS' as const, amount: 5 };
    expect(validateBudget(draft, ctx.categories).ok).toBe(false);
    expect(validateBudget(draft, ctx.categories, original).ok).toBe(true);
  });
});
