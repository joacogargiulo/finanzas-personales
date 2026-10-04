import { describe, expect, it } from 'vitest';
import { indexById } from './collections';
import { groupByDay } from './grouping';
import {
  makeAccount,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from './testing/factories';

const cash = makeAccount({ id: 'cash', currency: 'ARS' });
const bank = makeAccount({ id: 'bank', currency: 'ARS' });
const dollars = makeAccount({ id: 'usd', currency: 'USD' });
const accounts = indexById([cash, bank, dollars]);

// La lista de Movimientos muestra un encabezado por día con su subtotal (diseño "Sereno").
describe('groupByDay', () => {
  it('agrupa por fecha conservando el orden recibido', () => {
    const a = makeExpense({ accountId: 'cash', categoryId: 'c', date: '2026-10-03' });
    const b = makeIncome({ accountId: 'cash', categoryId: 'c', date: '2026-10-03' });
    const c = makeExpense({ accountId: 'cash', categoryId: 'c', date: '2026-10-01' });
    const groups = groupByDay([a, b, c], accounts);
    expect(groups.map((g) => [g.date, g.transactions.map((t) => t.id)])).toEqual([
      ['2026-10-03', [a.id, b.id]],
      ['2026-10-01', [c.id]],
    ]);
  });

  it('el subtotal es ingresos menos gastos', () => {
    const groups = groupByDay(
      [
        makeIncome({ accountId: 'cash', categoryId: 'c', amount: 100_000, date: '2026-10-03' }),
        makeExpense({ accountId: 'bank', categoryId: 'c', amount: 30_000, date: '2026-10-03' }),
      ],
      accounts,
    );
    expect(groups[0]?.subtotals).toEqual([{ currency: 'ARS', amount: 70_000 }]);
  });

  it('las transferencias y los cambios no cuentan en el subtotal', () => {
    const groups = groupByDay(
      [
        makeExpense({ accountId: 'cash', categoryId: 'c', amount: 18_400, date: '2026-10-02' }),
        makeTransfer({ accountId: 'bank', toAccountId: 'cash', date: '2026-10-02' }),
        makeExchange({ accountId: 'bank', toAccountId: 'usd', date: '2026-10-02' }),
      ],
      accounts,
    );
    expect(groups[0]?.subtotals).toEqual([{ currency: 'ARS', amount: -18_400 }]);
  });

  it('un subtotal por moneda, en el orden ARS, USD, EUR', () => {
    const groups = groupByDay(
      [
        makeExpense({ accountId: 'usd', categoryId: 'c', amount: 500, date: '2026-10-02' }),
        makeExpense({ accountId: 'cash', categoryId: 'c', amount: 900, date: '2026-10-02' }),
      ],
      accounts,
    );
    expect(groups[0]?.subtotals).toEqual([
      { currency: 'ARS', amount: -900 },
      { currency: 'USD', amount: -500 },
    ]);
  });

  it('un día solo con transferencias no tiene subtotal', () => {
    const groups = groupByDay(
      [makeTransfer({ accountId: 'bank', toAccountId: 'cash', date: '2026-10-02' })],
      accounts,
    );
    expect(groups[0]?.subtotals).toEqual([]);
  });

  it('un movimiento con cuenta desconocida no suma (no se sabe la moneda)', () => {
    const groups = groupByDay(
      [makeExpense({ accountId: 'nope', categoryId: 'c', date: '2026-10-02' })],
      accounts,
    );
    expect(groups[0]?.subtotals).toEqual([]);
  });

  it('sin movimientos, no hay grupos', () => {
    expect(groupByDay([], accounts)).toEqual([]);
  });
});
