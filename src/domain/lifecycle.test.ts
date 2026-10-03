import { describe, expect, it } from 'vitest';
import { computeBalances } from './balances';
import {
  accountUsage,
  activeRecurringUsing,
  canArchiveAccount,
  canChangeCategoryType,
  canDelete,
  canRestoreAccount,
  canRestoreCategory,
  categoryUsage,
  type UserData,
} from './lifecycle';
import {
  makeAccount,
  makeBudget,
  makeCategory,
  makeExpense,
  makeRecurring,
  makeTransfer,
  makeTransferRecurring,
} from './testing/factories';

const empty: UserData = { transactions: [], budgets: [], recurring: [] };

describe('archivar cuentas (SRS 5.5)', () => {
  // TC-06: con saldo distinto de 0 no se archiva, y el error trae el saldo para el mensaje.
  it('TC-06: bloquea con saldo ≠ 0', () => {
    const cash = makeAccount({ initialBalance: 2_000_00 });
    const balance = computeBalances([cash], []).get(cash.id) ?? 0;
    expect(canArchiveAccount(cash, balance)).toEqual({
      ok: false,
      error: { code: 'archive.nonZeroBalance', balance: 2_000_00, currency: 'ARS' },
    });
  });

  // TC-07: después de transferir todo el saldo, se puede archivar.
  it('TC-07: permite con saldo 0', () => {
    const cash = makeAccount({ initialBalance: 2_000_00 });
    const bank = makeAccount();
    const tx = makeTransfer({ accountId: cash.id, toAccountId: bank.id, amount: 2_000_00 });
    const balance = computeBalances([cash, bank], [tx]).get(cash.id) ?? 0;
    expect(canArchiveAccount(cash, balance).ok).toBe(true);
  });
});

describe('uso y eliminación (ADR 0005)', () => {
  const cash = makeAccount();
  const bank = makeAccount();
  const food = makeCategory();

  // Una cuenta se usa como origen o destino de movimientos y recurrentes.
  it('accountUsage cuenta origen y destino, sin lápidas', () => {
    const data: UserData = {
      transactions: [
        makeExpense({ accountId: cash.id, categoryId: food.id }),
        makeTransfer({ accountId: bank.id, toAccountId: cash.id }),
        makeExpense({ accountId: cash.id, categoryId: food.id, deletedAt: 1 }),
      ],
      budgets: [makeBudget({ categoryId: food.id })],
      recurring: [makeTransferRecurring({ accountId: bank.id, toAccountId: cash.id })],
    };
    expect(accountUsage(cash.id, data)).toEqual({ transactions: 2, budgets: 0, recurring: 1 });
  });

  it('categoryUsage cuenta movimientos, presupuestos y recurrentes', () => {
    const data: UserData = {
      transactions: [makeExpense({ accountId: cash.id, categoryId: food.id })],
      budgets: [
        makeBudget({ categoryId: food.id }),
        makeBudget({ categoryId: food.id, deletedAt: 1 }),
      ],
      recurring: [makeRecurring({ accountId: cash.id, categoryId: food.id })],
    };
    expect(categoryUsage(food.id, data)).toEqual({ transactions: 1, budgets: 1, recurring: 1 });
  });

  // Solo se elimina lo que no se usa; si no, se ofrece archivar.
  it('canDelete', () => {
    expect(canDelete(accountUsage(cash.id, empty)).ok).toBe(true);
    expect(canDelete({ transactions: 0, budgets: 1, recurring: 0 })).toEqual({
      ok: false,
      error: { code: 'delete.inUse' },
    });
  });

  // ADR 0009: el tipo de una categoría queda bloqueado si algo la usa (también un presupuesto).
  it('canChangeCategoryType', () => {
    expect(canChangeCategoryType(food.id, empty).ok).toBe(true);
    const withBudget = { ...empty, budgets: [makeBudget({ categoryId: food.id })] };
    expect(canChangeCategoryType(food.id, withBudget)).toEqual({
      ok: false,
      error: { code: 'category.typeLocked' },
    });
  });
});

describe('restaurar con nombre repetido (SRS 5.5 y 5.6)', () => {
  it('cuenta: pide otro nombre si hay una activa igual', () => {
    const archived = makeAccount({ name: 'Efectivo', archivedAt: 1 });
    const active = makeAccount({ name: 'EFECTIVO' });
    expect(canRestoreAccount(archived, [archived, active])).toEqual({
      ok: false,
      error: { code: 'restore.accountNameTaken', name: 'Efectivo' },
    });
    expect(canRestoreAccount(archived, [archived]).ok).toBe(true);
  });

  // En categorías solo choca con las activas del mismo tipo.
  it('categoría: solo choca con el mismo tipo', () => {
    const archived = makeCategory({ name: 'Otros', type: 'expense', archivedAt: 1 });
    const income = makeCategory({ name: 'Otros', type: 'income' });
    expect(canRestoreCategory(archived, [archived, income]).ok).toBe(true);
    const expense = makeCategory({ name: 'otros', type: 'expense' });
    expect(canRestoreCategory(archived, [archived, expense]).ok).toBe(false);
  });
});

describe('activeRecurringUsing (ADR 0009)', () => {
  // Al archivar se advierte por los recurrentes activos; los eliminados o finalizados no cuentan.
  it('encuentra recurrentes activos por cuenta, destino o categoría', () => {
    const cash = makeAccount();
    const food = makeCategory();
    const byAccount = makeRecurring({ accountId: cash.id, categoryId: 'x' });
    const byCategory = makeRecurring({ accountId: 'y', categoryId: food.id });
    const byDestination = makeTransferRecurring({ accountId: 'y', toAccountId: cash.id });
    const deleted = makeRecurring({ accountId: cash.id, categoryId: 'x', deletedAt: 1 });
    const finished = makeRecurring({
      accountId: cash.id,
      categoryId: 'x',
      nextDate: '2026-05-01',
      endDate: '2026-04-30',
    });
    const all = [byAccount, byCategory, byDestination, deleted, finished];
    expect(activeRecurringUsing(cash.id, all)).toEqual([byAccount, byDestination]);
    expect(activeRecurringUsing(food.id, all)).toEqual([byCategory]);
  });
});
