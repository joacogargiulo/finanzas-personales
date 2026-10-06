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

/** La frase nombra las dos cuentas en pesos, así la IA puede elegir cualquiera de las dos. */
const parse = (raw: unknown, text = 'con efectivo o mercado pago') => parseAiResult(raw, text, ctx);

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
    expect(parse(answer())).toEqual({
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
    const parsed = parse(
      answer({ type: 'transfer', toAccountId: 'mp', categoryId: 'seed_comida' }),
    );
    expect(parsed).toMatchObject({ type: 'transfer', toAccountId: 'mp', categoryId: null });
    expect(parsed?.missing).toEqual([]);
  });

  // "compré 100 dólares a 1300": salen 130.000 pesos y entran 100 dólares.
  it('un cambio de moneda, con los dos montos', () => {
    const parsed = parse(
      answer({ type: 'exchange', amount: '130000', toAmount: '100', toAccountId: 'usd' }),
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
    expect(parse(JSON.stringify(answer()))?.amount).toBe(1_800_000);
  });
});

describe('lo que no cierra queda para revisar', () => {
  it('un ID inventado o archivado', () => {
    expect(parse(answer({ accountId: 'inventada' }))?.missing).toEqual(['account']);
    expect(parse(answer({ accountId: 'old' }))?.accountId).toBeNull();
    expect(parse(answer({ categoryId: 'gimnasio' }))?.missing).toEqual(['category']);
  });

  it('una categoría del otro tipo', () => {
    expect(parse(answer({ categoryId: 'seed_salario' }))?.categoryId).toBeNull();
  });

  it('una transferencia entre monedas distintas o a la misma cuenta', () => {
    expect(parse(answer({ type: 'transfer', toAccountId: 'usd' }))?.toAccountId).toBeNull();
    expect(parse(answer({ type: 'transfer', toAccountId: 'cash' }))?.missing).toEqual([
      'toAccount',
    ]);
  });

  it('un cambio con la misma moneda o sin el segundo monto', () => {
    const sameCurrency = parse(answer({ type: 'exchange', toAmount: '100', toAccountId: 'mp' }));
    expect(sameCurrency?.toAccountId).toBeNull();
    const noToAmount = parse(answer({ type: 'exchange', toAccountId: 'usd' }));
    expect(noToAmount?.missing).toEqual(['toAmount']);
  });

  it('un tipo desconocido', () => {
    expect(parse(answer({ type: 'regalo' }))?.missing).toContain('type');
  });

  it('una fecha futura o inválida se reemplaza por hoy', () => {
    expect(parse(answer({ date: '2026-10-04' }))?.date).toBe(TODAY);
    expect(parse(answer({ date: '2026-02-31' }))?.date).toBe(TODAY);
    expect(parse(answer({ date: null }))?.date).toBe(TODAY);
  });
});

// Los montos se convierten con el mismo parser del formulario: sin decimales flotantes.
describe('montos', () => {
  it.each([
    ['2500,50', 250_050],
    ['18.000', 1_800_000],
    ['1.234.567,89', 123_456_789],
    ['$ 500', 50_000],
    ['38,700', 3_870_000],
    ['1,234.50', 123_450],
    [1500, 150_000],
  ])('%s → %i centavos', (amount, cents) => {
    expect(parse(answer({ amount }))?.amount).toBe(cents);
  });

  it.each([['-500'], ['0'], ['mil'], ['1,23,4'], [null]])('%s no es un monto', (amount) => {
    const parsed = parse(answer({ amount }));
    expect(parsed?.amount).toBeNull();
    expect(parsed?.missing).toContain('amount');
  });
});

// El modelo real elegía una cuenta al azar si la frase no nombraba ninguna (2026-10-06).
describe('cuentas que la frase no nombra', () => {
  it('con dos cuentas en pesos, no acepta una que la frase no nombra', () => {
    const parsed = parse(answer({ accountId: 'cash' }), 'gasté 500 en el súper');
    expect(parsed?.accountId).toBeNull();
    expect(parsed?.missing).toEqual(['account']);
  });

  it('acepta la que nombra, aunque sea con otras palabras', () => {
    expect(parse(answer({ accountId: 'mp' }), 'gasté 500 con mercadopago')?.accountId).toBe('mp');
  });

  // "vendí 100 dólares": la de dólares es la única en su moneda; la de pesos queda para revisar.
  it('en un cambio, acepta la única de su moneda y no la que adivinó', () => {
    const parsed = parse(
      answer({
        type: 'exchange',
        accountId: 'usd',
        toAccountId: 'cash',
        amount: '100',
        toAmount: '130000',
        currency: 'USD',
      }),
      'vendí $100 a 1300',
    );
    expect(parsed).toMatchObject({ accountId: 'usd', toAccountId: null });
    expect(parsed?.missing).toEqual(['toAccount']);
  });
});

describe('cuenta implícita', () => {
  // "50 dólares en comida": la única cuenta en dólares.
  it('la única cuenta de la moneda nombrada', () => {
    expect(parse(answer({ accountId: null, currency: 'USD' }))?.accountId).toBe('usd');
  });

  it('con varias posibles, ninguna', () => {
    expect(parse(answer({ accountId: null }))?.accountId).toBeNull();
  });
});

describe('respuestas sin forma', () => {
  it.each([['no es JSON'], [null], [[1, 2]], [42]])('%s → null', (raw) => {
    expect(parse(raw)).toBeNull();
  });
});
