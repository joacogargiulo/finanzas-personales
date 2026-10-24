import { describe, expect, it, vi } from 'vitest';
import { computeBalances } from '../../src/domain/balances';
import type { Transaction } from '../../src/domain/model';
import {
  makeAccount,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from '../../src/domain/testing/factories';
import { accountBalances, accountBalanceBySums, type SumTransactions } from './accountBalances';

// Los saldos con sumas de Firestore tienen que dar lo mismo que `computeBalances`, que suma todos
// los movimientos (SRS 5.2). Acá la "base de datos" es una lista, y `sum` la filtra como lo haría
// una consulta de agregación con filtros de igualdad.

const cash = makeAccount({ id: 'cash', name: 'Efectivo', initialBalance: 100_000 });
const bank = makeAccount({ id: 'bank', name: 'Banco', initialBalance: 0 });
const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD', initialBalance: 5_000 });

const transactions: Transaction[] = [
  makeIncome({ accountId: 'cash', categoryId: 'c', amount: 2_000_000 }),
  makeExpense({ accountId: 'cash', categoryId: 'c', amount: 350_000 }),
  makeExpense({ accountId: 'bank', categoryId: 'c', amount: 40_000 }),
  makeTransfer({ accountId: 'cash', toAccountId: 'bank', amount: 500_000 }),
  makeTransfer({ accountId: 'bank', toAccountId: 'cash', amount: 120_000 }),
  makeExchange({ accountId: 'cash', toAccountId: 'usd', amount: 1_300_000, toAmount: 1_000 }),
  // Un movimiento eliminado no cuenta.
  makeExpense({ accountId: 'cash', categoryId: 'c', amount: 999_999, deletedAt: 1 }),
];

/** Una "suma de Firestore" sobre la lista: igualdad en cada filtro y sin los eliminados. */
const sumOver =
  (list: readonly Transaction[]): SumTransactions =>
  (filters, field) => {
    const total = list
      .filter((tx) => tx.deletedAt === null)
      .filter((tx) =>
        filters.every((f) => (tx as unknown as Record<string, unknown>)[f.field] === f.equals),
      )
      .reduce((sum, tx) => sum + Number((tx as unknown as Record<string, unknown>)[field] ?? 0), 0);
    return Promise.resolve(total);
  };

describe('accountBalances', () => {
  it('da el mismo saldo que computeBalances en cada cuenta', async () => {
    const expected = computeBalances([cash, bank, usd], transactions);
    const actual = await accountBalances([cash, bank, usd], sumOver(transactions));
    expect(actual).toEqual(expected);
  });

  it('una cuenta sin movimientos queda en su saldo inicial', async () => {
    expect(await accountBalanceBySums(cash, sumOver([]))).toBe(100_000);
  });

  it('hace seis sumas por cuenta, todas filtradas por su ID', async () => {
    const sum = vi.fn(sumOver(transactions));
    await accountBalanceBySums(bank, sum);

    expect(sum).toHaveBeenCalledTimes(6);
    const calls = sum.mock.calls;
    for (const [filters] of calls) {
      expect(filters.some((f) => f.equals === 'bank')).toBe(true);
    }
    // Lo recibido en un cambio se suma desde toAmount, no desde amount.
    expect(calls.filter(([, field]) => field === 'toAmount')).toHaveLength(1);
    expect(calls.map(([filters]) => filters.map((f) => f.field).join('+'))).toEqual([
      'type+accountId',
      'type+accountId',
      'type+accountId',
      'type+toAccountId',
      'type+accountId',
      'type+toAccountId',
    ]);
  });
});
