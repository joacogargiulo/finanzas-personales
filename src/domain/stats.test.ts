import { describe, expect, it } from 'vitest';
import { indexById } from './collections';
import {
  computeStats,
  currenciesInUse,
  groupSmallCategories,
  monthsInRange,
  OTHER_CATEGORY_ID,
  periodRange,
  validateCustomRange,
} from './stats';
import {
  makeAccount,
  makeCategory,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from './testing/factories';

describe('periodRange (SRS 6.5)', () => {
  const today = '2026-10-03';

  // Los períodos son meses completos: "últimos 3 meses" = agosto, septiembre y octubre.
  it.each([
    ['thisMonth', '2026-10-01', '2026-10-31'],
    ['last3', '2026-08-01', '2026-10-31'],
    ['last6', '2026-05-01', '2026-10-31'],
    ['last12', '2025-11-01', '2026-10-31'],
    ['thisYear', '2026-01-01', '2026-12-31'],
  ] as const)('%s → %s a %s', (preset, from, to) => {
    expect(periodRange(preset, today)).toEqual({ from, to });
  });

  it('personalizado usa el rango recibido', () => {
    const custom = { from: '2026-01-15', to: '2026-02-10' };
    expect(periodRange('custom', today, custom)).toEqual(custom);
  });

  it('monthsInRange cruza el año', () => {
    expect(monthsInRange({ from: '2025-11-20', to: '2026-01-05' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });
});

describe('computeStats', () => {
  const ars = makeAccount();
  const usd = makeAccount({ currency: 'USD' });
  const food = makeCategory({ id: 'food' });
  const fun = makeCategory({ id: 'fun', archivedAt: 1 });
  const accounts = indexById([ars, usd]);
  const range = { from: '2026-09-01', to: '2026-10-31' };

  const txs = [
    makeIncome({ accountId: ars.id, categoryId: 'salary', amount: 1_000_00, date: '2026-09-05' }),
    makeExpense({ accountId: ars.id, categoryId: food.id, amount: 300_00, date: '2026-09-10' }),
    makeExpense({ accountId: ars.id, categoryId: fun.id, amount: 100_00, date: '2026-10-01' }),
    // Lo que no tiene que contar:
    makeExpense({ accountId: usd.id, categoryId: food.id, amount: 9_00, date: '2026-10-01' }), // otra moneda
    makeExpense({ accountId: ars.id, categoryId: food.id, amount: 9_00, date: '2026-08-31' }), // fuera del período
    makeExpense({
      accountId: ars.id,
      categoryId: food.id,
      amount: 9_00,
      date: '2026-10-02',
      deletedAt: 1,
    }),
    makeTransfer({ accountId: ars.id, toAccountId: 'otra', amount: 9_00, date: '2026-10-02' }),
    makeExchange({ accountId: ars.id, toAccountId: usd.id, date: '2026-10-02' }), // TC-05: no cuenta
  ];

  // Gráfico 1: ingresos y gastos por mes, solo de la moneda elegida.
  it('totales mensuales', () => {
    expect(computeStats(txs, accounts, 'ARS', range).monthly).toEqual([
      { month: '2026-09', income: 1_000_00, expense: 300_00 },
      { month: '2026-10', income: 0, expense: 100_00 },
    ]);
  });

  // Gráficos 2 y 3: por categoría, de mayor a menor, con su parte del total.
  // La categoría archivada ("fun") se incluye.
  it('por categoría, con categorías archivadas', () => {
    const stats = computeStats(txs, accounts, 'ARS', range);
    expect(stats.expenseByCategory).toEqual([
      { categoryId: 'food', total: 300_00, share: 0.75 },
      { categoryId: 'fun', total: 100_00, share: 0.25 },
    ]);
    expect(stats.incomeByCategory).toEqual([{ categoryId: 'salary', total: 1_000_00, share: 1 }]);
    expect(stats.totalExpense).toBe(400_00);
    expect(stats.isEmpty).toBe(false);
  });

  // Estado vacío: sin ingresos ni gastos en el período.
  it('estado vacío', () => {
    const stats = computeStats(txs, accounts, 'EUR', range);
    expect(stats.isEmpty).toBe(true);
    expect(stats.monthly).toHaveLength(2);
  });
});

describe('groupSmallCategories (ADR 0021)', () => {
  const total = (categoryId: string, cents: number, sum: number) => ({
    categoryId,
    total: cents,
    share: cents / sum,
  });

  // Con pocas categorías, la dona las muestra todas.
  it('con 5 o menos no agrupa', () => {
    const totals = [total('a', 60_00, 100_00), total('b', 40_00, 100_00)];
    expect(groupSmallCategories(totals)).toEqual(totals);
  });

  // Con más, quedan las 4 más grandes y el resto suma en "Otras", sin perder un centavo.
  it('agrupa el resto en "Otras"', () => {
    const sum = 100_00;
    const totals = [
      total('a', 40_00, sum),
      total('b', 25_00, sum),
      total('c', 15_00, sum),
      total('d', 10_00, sum),
      total('e', 6_00, sum),
      total('f', 3_00, sum),
      total('g', 1_00, sum),
    ];
    const grouped = groupSmallCategories(totals);
    expect(grouped.map((t) => t.categoryId)).toEqual(['a', 'b', 'c', 'd', OTHER_CATEGORY_ID]);
    expect(grouped[4]).toEqual({ categoryId: OTHER_CATEGORY_ID, total: 10_00, share: 0.1 });
    expect(grouped.reduce((acc, t) => acc + t.total, 0)).toBe(sum);
    expect(grouped.reduce((acc, t) => acc + t.share, 0)).toBeCloseTo(1);
  });
});

describe('currenciesInUse', () => {
  // Solo las monedas con cuentas (archivadas incluidas), siempre en el orden ARS, USD, EUR.
  it('ordena y omite las monedas sin cuentas', () => {
    const accounts = [
      makeAccount({ currency: 'EUR', archivedAt: 1 }),
      makeAccount({ currency: 'ARS' }),
      makeAccount({ currency: 'USD', deletedAt: 1 }), // eliminada: no cuenta
    ];
    expect(currenciesInUse(accounts)).toEqual(['ARS', 'EUR']);
  });
});

describe('validateCustomRange', () => {
  it('acepta un rango válido, incluso de un solo día', () => {
    expect(validateCustomRange('2026-01-15', '2026-01-15')).toEqual({
      ok: true,
      value: { from: '2026-01-15', to: '2026-01-15' },
    });
  });

  it('"hasta" antes de "desde" es un error en "hasta"', () => {
    expect(validateCustomRange('2026-02-01', '2026-01-31')).toEqual({
      ok: false,
      error: { to: { code: 'date.endBeforeStart' } },
    });
  });

  it('fechas vacías o imposibles', () => {
    expect(validateCustomRange('', '2026-02-30')).toEqual({
      ok: false,
      error: { from: { code: 'date.invalid' }, to: { code: 'date.invalid' } },
    });
  });
});
