import { describe, expect, it } from 'vitest';
import {
  accountsReply,
  balancesReply,
  periodReply,
  queryRange,
  totalsReply,
  usesPeriod,
  type BotQuery,
  type CurrencyStats,
} from './botQuery';
import { SEED_CATEGORIES } from './seed';
import { computeStats } from './stats';
import { makeAccount, makeCategory, makeExpense, makeIncome } from './testing/factories';

// Las consultas del bot (ADR 0035): qué período es cada palabra y cómo se escribe cada respuesta.
// Los números salen de `computeStats`; acá se prueba que el texto los muestre bien.

const TODAY = '2026-10-14'; // miércoles

describe('queryRange', () => {
  it.each([
    ['today', '2026-10-14', '2026-10-14'],
    ['yesterday', '2026-10-13', '2026-10-13'],
    // La semana empieza el lunes: el 12 de octubre de 2026.
    ['week', '2026-10-12', '2026-10-14'],
    ['month', '2026-10-01', '2026-10-14'],
    ['lastMonth', '2026-09-01', '2026-09-30'],
    ['year', '2026-01-01', '2026-10-14'],
  ] as const)('%s', (period, from, to) => {
    expect(queryRange(period, TODAY)).toEqual({ from, to });
  });

  it('el mes pasado en enero es diciembre del año anterior', () => {
    expect(queryRange('lastMonth', '2027-01-10')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('el mes pasado desde el 31 no se pasa de día', () => {
    expect(queryRange('lastMonth', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('solo las consultas de gastos e ingresos usan período', () => {
    expect(usesPeriod('accounts')).toBe(false);
    expect(usesPeriod('balance')).toBe(false);
    expect(usesPeriod('spending')).toBe(true);
    expect(usesPeriod('byCategory')).toBe(true);
  });
});

describe('accountsReply y balancesReply', () => {
  const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
  const bank = makeAccount({ id: 'bank', name: 'Banco' });
  const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' });

  it('lista las cuentas con su moneda', () => {
    expect(accountsReply([cash, usd])).toBe(
      'Tus cuentas:\n• Efectivo (pesos)\n• Caja USD (dólares)',
    );
  });

  it('sin cuentas, lo dice', () => {
    expect(accountsReply([])).toContain('Todavía no tenés cuentas');
  });

  it('el saldo de una sola cuenta es una frase', () => {
    expect(balancesReply([{ account: cash, balance: 1_234_500 }])).toBe(
      'En Efectivo tenés $ 12.345,00.',
    );
  });

  it('con varias cuentas, una línea por cuenta y el total de cada moneda con más de una', () => {
    const text = balancesReply([
      { account: cash, balance: 100_000 },
      { account: bank, balance: 250_000 },
      { account: usd, balance: 5_000 },
    ]);
    expect(text).toBe(
      [
        '• Efectivo: $ 1.000,00',
        '• Banco: $ 2.500,00',
        '• Caja USD: US$ 50,00',
        '',
        'Total en pesos: $ 3.500,00',
      ].join('\n'),
    );
  });

  // Un saldo negativo (se gastó más de lo que había) se muestra con signo.
  it('un saldo negativo lleva el signo', () => {
    expect(balancesReply([{ account: cash, balance: -50_000 }])).toContain('−');
  });
});

describe('periodReply', () => {
  const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
  const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' });
  const accounts = new Map([cash, usd].map((a) => [a.id, a]));
  const categories = new Map(SEED_CATEGORIES.map((c) => [c.id, makeCategory({ ...c })]));
  const range = { from: '2026-10-01', to: TODAY };
  const noScope = { accountName: null, categoryName: null };

  const transactions = [
    makeExpense({
      accountId: 'cash',
      categoryId: 'seed_comida',
      amount: 600_000,
      date: '2026-10-05',
    }),
    makeExpense({
      accountId: 'cash',
      categoryId: 'seed_ocio',
      amount: 400_000,
      date: '2026-10-06',
    }),
    makeIncome({
      accountId: 'cash',
      categoryId: 'seed_salario',
      amount: 2_000_000,
      date: '2026-10-01',
    }),
    makeExpense({ accountId: 'usd', categoryId: 'seed_comida', amount: 2_500, date: '2026-10-07' }),
  ];
  const results = (): CurrencyStats[] =>
    (['ARS', 'USD'] as const).map((currency) => ({
      currency,
      stats: computeStats(transactions, accounts, currency, range),
    }));
  const query = (overrides: Partial<BotQuery>): BotQuery => ({
    kind: 'spending',
    accountId: null,
    categoryId: null,
    period: 'month',
    ...overrides,
  });

  it('gastos: una frase por moneda, aclarando la moneda si hay más de una', () => {
    expect(periodReply(query({}), results(), categories, noScope)).toBe(
      'Gastaste $ 10.000,00 este mes (pesos).\n\nGastaste US$ 25,00 este mes (dólares).',
    );
  });

  it('con una sola moneda no aclara', () => {
    const arsOnly = results().filter((r) => r.currency === 'ARS');
    expect(periodReply(query({ period: 'today' }), arsOnly, categories, noScope)).toBe(
      'Gastaste $ 10.000,00 hoy.',
    );
  });

  it('ingresos', () => {
    const arsOnly = results().filter((r) => r.currency === 'ARS');
    expect(periodReply(query({ kind: 'income' }), arsOnly, categories, noScope)).toBe(
      'Ingresaron $ 20.000,00 este mes.',
    );
  });

  it('resumen con la diferencia', () => {
    const arsOnly = results().filter((r) => r.currency === 'ARS');
    expect(periodReply(query({ kind: 'summary' }), arsOnly, categories, noScope)).toBe(
      [
        'Resumen este mes:',
        '• Ingresos: $ 20.000,00',
        '• Gastos: $ 10.000,00',
        '• Diferencia: $ 10.000,00',
      ].join('\n'),
    );
  });

  it('por categoría: de mayor a menor, con el porcentaje', () => {
    const arsOnly = results().filter((r) => r.currency === 'ARS');
    expect(periodReply(query({ kind: 'byCategory' }), arsOnly, categories, noScope)).toBe(
      [
        'Gastos este mes, de mayor a menor:',
        '• Comida: $ 6.000,00 (60%)',
        '• Ocio: $ 4.000,00 (40%)',
      ].join('\n'),
    );
  });

  it('dice a qué cuenta o categoría se limitó', () => {
    const arsOnly = results().filter((r) => r.currency === 'ARS');
    const scope = { accountName: 'Efectivo', categoryName: 'Comida' };
    expect(periodReply(query({}), arsOnly, categories, scope)).toBe(
      'Gastaste $ 10.000,00 en Comida en Efectivo este mes.',
    );
  });

  it('sin movimientos en el período, lo dice en vez de mostrar ceros', () => {
    const empty: CurrencyStats[] = [
      { currency: 'ARS', stats: computeStats([], accounts, 'ARS', range) },
    ];
    expect(periodReply(query({ period: 'yesterday' }), empty, categories, noScope)).toBe(
      'No tenés gastos ayer.',
    );
    expect(periodReply(query({ kind: 'income' }), empty, categories, noScope)).toBe(
      'No tenés ingresos este mes.',
    );
  });
});

describe('totalsReply', () => {
  it('muestra el total de cada moneda e invita a preguntar por una cuenta', () => {
    const text = totalsReply(
      new Map([
        ['ARS', 1_010_000],
        ['USD', 2_500],
      ]),
      8,
    );
    expect(text).toBe(
      [
        'Tenés 8 cuentas, demasiadas para mostrarlas todas juntas. En total:',
        '• Total en pesos: $ 10.100,00',
        '• Total en dólares: US$ 25,00',
        '',
        'Para ver una en particular, preguntame por ella: «cuánto tengo en Efectivo».',
      ].join('\n'),
    );
  });
});
