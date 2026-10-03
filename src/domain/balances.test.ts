import { describe, expect, it } from 'vitest';
import { accountBalance, computeBalances } from './balances';
import {
  makeAccount,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from './testing/factories';

describe('computeBalances (SRS 5.2)', () => {
  // Cada tipo de movimiento suma o resta según la fórmula del SRS.
  it('aplica los cuatro tipos de movimiento', () => {
    const cash = makeAccount({ initialBalance: 1_000_00 });
    const bank = makeAccount({ initialBalance: 5_000_00 });
    const usd = makeAccount({ currency: 'USD', initialBalance: 0 });
    const balances = computeBalances(
      [cash, bank, usd],
      [
        makeIncome({ accountId: cash.id, categoryId: 'c', amount: 200_00 }),
        makeExpense({ accountId: cash.id, categoryId: 'c', amount: 50_00 }),
        makeTransfer({ accountId: bank.id, toAccountId: cash.id, amount: 1_000_00 }),
        makeExchange({ accountId: bank.id, toAccountId: usd.id, amount: 1_300_00, toAmount: 1_00 }),
      ],
    );
    expect(balances.get(cash.id)).toBe(1_000_00 + 200_00 - 50_00 + 1_000_00);
    expect(balances.get(bank.id)).toBe(5_000_00 - 1_000_00 - 1_300_00);
    expect(balances.get(usd.id)).toBe(1_00);
  });

  // TC-01: un gasto de $500 en una cuenta con $2.000 la deja en $1.500.
  it('TC-01: gasto de $500 sobre $2.000', () => {
    const cash = makeAccount({ initialBalance: 2_000_00 });
    const tx = makeExpense({ accountId: cash.id, categoryId: 'c', amount: 500_00 });
    expect(accountBalance(cash, [tx])).toBe(1_500_00);
  });

  // TC-02: una transferencia mueve plata entre cuentas sin cambiar el total.
  it('TC-02: transferencia de $1.000', () => {
    const salary = makeAccount({ initialBalance: 5_000_00 });
    const cash = makeAccount({ initialBalance: 1_000_00 });
    const balances = computeBalances(
      [salary, cash],
      [makeTransfer({ accountId: salary.id, toAccountId: cash.id, amount: 1_000_00 })],
    );
    expect(balances.get(salary.id)).toBe(4_000_00);
    expect(balances.get(cash.id)).toBe(2_000_00);
  });

  // TC-04: como el saldo se recalcula, editar un gasto de $300 a $500 baja el saldo $200.
  it('TC-04: editar un gasto recalcula el saldo', () => {
    const cash = makeAccount({ initialBalance: 1_000_00 });
    const before = makeExpense({ accountId: cash.id, categoryId: 'c', amount: 300_00 });
    const after = { ...before, amount: 500_00 };
    expect(accountBalance(cash, [before]) - accountBalance(cash, [after])).toBe(200_00);
  });

  // Las lápidas no cuentan; una cuenta sin movimientos queda en su saldo inicial.
  it('ignora movimientos eliminados', () => {
    const cash = makeAccount({ initialBalance: 700_00 });
    const deleted = makeExpense({ accountId: cash.id, categoryId: 'c', deletedAt: 1 });
    expect(accountBalance(cash, [deleted])).toBe(700_00);
  });

  // Tolerancia al leer (SRS 5.3): un movimiento de una cuenta que todavía no llegó no rompe nada.
  it('tolera cuentas desconocidas', () => {
    const balances = computeBalances(
      [],
      [makeExpense({ accountId: 'fantasma', categoryId: 'c', amount: 10_00 })],
    );
    expect(balances.get('fantasma')).toBe(-10_00);
  });

  // Rendimiento (SRS 10): 10.000 movimientos se procesan rápido.
  it('procesa 10.000 movimientos en poco tiempo', () => {
    const cash = makeAccount();
    const txs = Array.from({ length: 10_000 }, () =>
      makeIncome({ accountId: cash.id, categoryId: 'c', amount: 1 }),
    );
    const start = performance.now();
    expect(accountBalance(cash, txs)).toBe(10_000);
    expect(performance.now() - start).toBeLessThan(250);
  });
});
