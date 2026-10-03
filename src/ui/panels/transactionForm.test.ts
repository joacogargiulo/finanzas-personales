import { describe, expect, it } from 'vitest';
import { indexById } from '../../domain/collections';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import {
  buildTransaction,
  categoryOptions,
  changeAccount,
  changeType,
  destinationOptions,
  emptyForm,
  formFromTransaction,
  type TransactionForm,
} from './transactionForm';

const cash = makeAccount({ id: 'cash', name: 'Efectivo', currency: 'ARS' });
const bank = makeAccount({ id: 'bank', name: 'Banco', currency: 'ARS' });
const dollars = makeAccount({ id: 'usd', name: 'Caja dólares', currency: 'USD' });
const old = makeAccount({ id: 'old', name: 'Vieja', currency: 'ARS', archivedAt: 1 });
const accounts = [cash, bank, dollars, old];

const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const leisure = makeCategory({ id: 'leisure', name: 'Ocio', type: 'expense', archivedAt: 1 });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });
const categories = [food, leisure, salary];

const ctx = { accounts: indexById(accounts), categories: indexById(categories) };

function form(overrides: Partial<TransactionForm> = {}): TransactionForm {
  return { ...emptyForm('2026-10-03', 'cash'), ...overrides };
}

// SRS 6.7: al cambiar el tipo, se limpian los campos que dejan de aplicar.
describe('changeType', () => {
  it('de gasto a ingreso limpia la categoría (son de otro tipo)', () => {
    const next = changeType(form({ categoryId: 'food', amount: '500' }), 'income');
    expect(next).toMatchObject({ type: 'income', categoryId: '', amount: '500' });
  });

  it('de transferencia a cambio limpia la cuenta destino (cambia la regla de moneda)', () => {
    const next = changeType(form({ type: 'transfer', toAccountId: 'bank' }), 'exchange');
    expect(next.toAccountId).toBe('');
  });

  it('al salir de cambio, borra el segundo monto', () => {
    const next = changeType(form({ type: 'exchange', toAmount: '100' }), 'expense');
    expect(next.toAmount).toBe('');
  });

  it('mantiene monto, fecha, descripción y cuenta', () => {
    const before = form({ amount: '12,5', description: 'Algo', date: '2026-10-01' });
    expect(changeType(before, 'transfer')).toMatchObject({
      amount: '12,5',
      description: 'Algo',
      date: '2026-10-01',
      accountId: 'cash',
    });
  });
});

// SRS 6.7 y TC-03: el destino depende del origen y del tipo.
describe('destinationOptions', () => {
  it('transferencia: solo cuentas activas de la misma moneda, sin el origen (TC-03)', () => {
    const ids = destinationOptions(form({ type: 'transfer' }), accounts).map((a) => a.id);
    expect(ids).toEqual(['bank']);
  });

  it('transferencia desde una cuenta en dólares: no aparecen las de pesos (TC-03)', () => {
    expect(destinationOptions(form({ type: 'transfer', accountId: 'usd' }), accounts)).toEqual([]);
  });

  it('cambio: solo cuentas de otra moneda', () => {
    const ids = destinationOptions(form({ type: 'exchange' }), accounts).map((a) => a.id);
    expect(ids).toEqual(['usd']);
  });

  it('gasto o ingreso: no hay destino', () => {
    expect(destinationOptions(form(), accounts)).toEqual([]);
  });
});

describe('changeAccount', () => {
  it('limpia el destino si deja de ser válido', () => {
    const before = form({ type: 'transfer', toAccountId: 'bank' });
    expect(changeAccount(before, 'usd', accounts).toAccountId).toBe('');
  });

  it('mantiene el destino si sigue siendo válido', () => {
    const before = form({ type: 'exchange', toAccountId: 'usd' });
    expect(changeAccount(before, 'bank', accounts).toAccountId).toBe('usd');
  });
});

describe('categoryOptions', () => {
  it('ofrece las activas del tipo del movimiento', () => {
    expect(categoryOptions(form(), categories).map((c) => c.id)).toEqual(['food']);
    expect(categoryOptions(form({ type: 'income' }), categories).map((c) => c.id)).toEqual([
      'salary',
    ]);
  });

  it('al editar, incluye la categoría archivada que ya tenía (SRS 5.3)', () => {
    expect(categoryOptions(form(), categories, 'leisure').map((c) => c.id)).toEqual([
      'food',
      'leisure',
    ]);
  });
});

// Montos según SRS 5.1 y validaciones del dominio según SRS 5.3.
describe('buildTransaction', () => {
  it('arma un gasto válido con el monto en centavos', () => {
    const result = buildTransaction(
      form({ amount: '1500,5', categoryId: 'food', description: '  Súper  ' }),
      ctx,
    );
    expect(result).toEqual({
      ok: true,
      value: {
        type: 'expense',
        amount: 150050,
        date: '2026-10-03',
        description: 'Súper',
        accountId: 'cash',
        categoryId: 'food',
      },
    });
  });

  it('pide el monto si está vacío y la categoría si falta', () => {
    const result = buildTransaction(form(), ctx);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.amount).toEqual({ code: 'amount.required' });
    expect(result.error.categoryId).toEqual({ code: 'category.required' });
  });

  it('rechaza "1.500" si llega desde otro lado que no sea el teclado (TC-17)', () => {
    const result = buildTransaction(form({ amount: '1.500', categoryId: 'food' }), ctx);
    expect(result.ok ? null : result.error.amount).toEqual({ code: 'amount.tooManyDecimals' });
  });

  it('cambio: necesita los dos montos', () => {
    const result = buildTransaction(
      form({ type: 'exchange', amount: '130000', toAccountId: 'usd' }),
      ctx,
    );
    expect(result.ok ? null : result.error.toAmount).toEqual({ code: 'amount.required' });
  });

  it('cambio válido (TC-05)', () => {
    const result = buildTransaction(
      form({ type: 'exchange', amount: '130000', toAmount: '100', toAccountId: 'usd' }),
      ctx,
    );
    expect(result.ok && result.value).toMatchObject({
      type: 'exchange',
      amount: 13_000_000,
      toAmount: 10_000,
      toAccountId: 'usd',
    });
  });

  it('al editar, ida y vuelta con formFromTransaction', () => {
    const tx = makeExpense({ accountId: 'cash', categoryId: 'food', amount: 30000 });
    const result = buildTransaction({ ...formFromTransaction(tx), amount: '500' }, ctx, tx);
    expect(result.ok && result.value.amount).toBe(50000);
  });
});
