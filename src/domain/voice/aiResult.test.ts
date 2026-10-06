import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from '../seed';
import { makeAccount, makeCategory } from '../testing/factories';
import { parseAiResult } from './aiResult';

// La respuesta de la IA se revisa entera antes de precargar el formulario (ADR 0031): lo que
// no cierra queda vacío y en `missing`, y una respuesta sin forma devuelve null (se usa el parser).

const TODAY = '2026-10-03';
const categories = [
  ...SEED_CATEGORIES.map((c) => makeCategory({ ...c })),
  makeCategory({ id: 'gimnasio', name: 'Gimnasio', archivedAt: 1 }),
];
const accounts = [
  makeAccount({ id: 'cash', name: 'Efectivo' }),
  makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet' }),
  makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' }),
  makeAccount({ id: 'old', name: 'Banco Viejo', archivedAt: 1 }),
];
const ctx = { accounts, categories, today: TODAY };

/** Una respuesta completa de gasto; cada test cambia lo que le importa. */
function answer(overrides: Record<string, unknown> = {}) {
  return {
    type: 'expense',
    amount: '18000',
    toAmount: null,
    currency: null,
    date: '2026-10-02',
    accountId: 'cash',
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
    ...overrides,
  };
}

describe('respuestas completas', () => {
  it('un gasto', () => {
    expect(parseAiResult(answer(), ctx)).toEqual({
      type: 'expense',
      amount: 1_800_000,
      toAmount: null,
      currency: null,
      date: '2026-10-02',
      accountId: 'cash',
      toAccountId: null,
      categoryId: 'seed_comida',
      description: 'Súper',
      missing: [],
      unsupported: null,
    });
  });

  it('una transferencia, sin categoría', () => {
    const parsed = parseAiResult(
      answer({ type: 'transfer', toAccountId: 'mp', categoryId: 'seed_comida' }),
      ctx,
    );
    expect(parsed).toMatchObject({ type: 'transfer', toAccountId: 'mp', categoryId: null });
    expect(parsed?.missing).toEqual([]);
  });

  // "compré 100 dólares a 1300": salen 130.000 pesos y entran 100 dólares.
  it('un cambio de moneda, con los dos montos', () => {
    const parsed = parseAiResult(
      answer({ type: 'exchange', amount: '130000', toAmount: '100', toAccountId: 'usd' }),
      ctx,
    );
    expect(parsed).toMatchObject({
      type: 'exchange',
      amount: 13_000_000,
      toAmount: 10_000,
      accountId: 'cash',
      toAccountId: 'usd',
      categoryId: null,
    });
    expect(parsed?.missing).toEqual([]);
  });

  // Workers AI a veces devuelve el JSON como texto.
  it('acepta la respuesta como texto JSON', () => {
    expect(parseAiResult(JSON.stringify(answer()), ctx)?.amount).toBe(1_800_000);
  });
});

describe('lo que no cierra queda para revisar', () => {
  it('un ID inventado o archivado', () => {
    expect(parseAiResult(answer({ accountId: 'inventada' }), ctx)?.missing).toEqual(['account']);
    expect(parseAiResult(answer({ accountId: 'old' }), ctx)?.accountId).toBeNull();
    expect(parseAiResult(answer({ categoryId: 'gimnasio' }), ctx)?.missing).toEqual(['category']);
  });

  it('una categoría del otro tipo', () => {
    expect(parseAiResult(answer({ categoryId: 'seed_salario' }), ctx)?.categoryId).toBeNull();
  });

  it('una transferencia entre monedas distintas o a la misma cuenta', () => {
    expect(
      parseAiResult(answer({ type: 'transfer', toAccountId: 'usd' }), ctx)?.toAccountId,
    ).toBeNull();
    expect(parseAiResult(answer({ type: 'transfer', toAccountId: 'cash' }), ctx)?.missing).toEqual([
      'toAccount',
    ]);
  });

  it('un cambio con la misma moneda o sin el segundo monto', () => {
    const sameCurrency = parseAiResult(
      answer({ type: 'exchange', toAmount: '100', toAccountId: 'mp' }),
      ctx,
    );
    expect(sameCurrency?.toAccountId).toBeNull();
    const noToAmount = parseAiResult(answer({ type: 'exchange', toAccountId: 'usd' }), ctx);
    expect(noToAmount?.missing).toEqual(['toAmount']);
  });

  it('un tipo desconocido', () => {
    expect(parseAiResult(answer({ type: 'regalo' }), ctx)?.missing).toContain('type');
  });

  it('una fecha futura o inválida se reemplaza por hoy', () => {
    expect(parseAiResult(answer({ date: '2026-10-04' }), ctx)?.date).toBe(TODAY);
    expect(parseAiResult(answer({ date: '2026-02-31' }), ctx)?.date).toBe(TODAY);
    expect(parseAiResult(answer({ date: null }), ctx)?.date).toBe(TODAY);
  });
});

// Los montos se convierten con el mismo parser del formulario: sin decimales flotantes.
describe('montos', () => {
  it.each([
    ['2500,50', 250_050],
    ['18.000', 1_800_000],
    ['1.234.567,89', 123_456_789],
    ['$ 500', 50_000],
    [1500, 150_000],
  ])('%s → %i centavos', (amount, cents) => {
    expect(parseAiResult(answer({ amount }), ctx)?.amount).toBe(cents);
  });

  it.each([['-500'], ['0'], ['mil'], ['1,234,567'], [null]])('%s no es un monto', (amount) => {
    const parsed = parseAiResult(answer({ amount }), ctx);
    expect(parsed?.amount).toBeNull();
    expect(parsed?.missing).toContain('amount');
  });
});

describe('cuenta implícita', () => {
  // "50 dólares en comida": la única cuenta en dólares.
  it('la única cuenta de la moneda nombrada', () => {
    expect(parseAiResult(answer({ accountId: null, currency: 'USD' }), ctx)?.accountId).toBe('usd');
  });

  it('con varias posibles, ninguna', () => {
    expect(parseAiResult(answer({ accountId: null }), ctx)?.accountId).toBeNull();
  });
});

describe('respuestas sin forma', () => {
  it.each([['no es JSON'], [null], [[1, 2]], [42]])('%s → null', (raw) => {
    expect(parseAiResult(raw, ctx)).toBeNull();
  });
});
