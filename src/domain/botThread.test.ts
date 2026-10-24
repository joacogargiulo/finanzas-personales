import { describe, expect, it } from 'vitest';
import { applyChoice, choiceId, joinPhrases, parseChoiceId, questionFor } from './botThread';
import { SEED_CATEGORIES } from './seed';
import { makeAccount, makeCategory } from './testing/factories';
import type { ParsedPhrase } from './voice/parsePhrase';
import { draftFromPhrase } from './voice/phraseFields';

// El hilo del bot (ADR 0035): qué pregunta cuando falta un dato, qué opciones ofrece y cómo una
// elección completa el movimiento.

const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const bank = makeAccount({ id: 'bank', name: 'Banco' });
const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' });
const old = makeAccount({ id: 'old', name: 'Vieja', archivedAt: 1 });
const categories = SEED_CATEGORIES.map((c) => makeCategory({ ...c }));

function phrase(overrides: Partial<ParsedPhrase> = {}): ParsedPhrase {
  return {
    type: 'expense',
    amount: 1_800_000,
    toAmount: null,
    currency: null,
    date: '2026-10-14',
    accountId: null,
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
    missing: ['account'],
    unsupported: null,
    ...overrides,
  };
}

describe('choiceId', () => {
  it('va y vuelve', () => {
    expect(choiceId('account', 'cash')).toBe('elegir:account:cash');
    expect(parseChoiceId('elegir:toAccount:usd')).toEqual({ field: 'toAccount', id: 'usd' });
    expect(parseChoiceId('elegir:category:seed_comida')).toEqual({
      field: 'category',
      id: 'seed_comida',
    });
  });

  it('lo que no es una elección del bot devuelve null', () => {
    expect(parseChoiceId('guardar:wa_1')).toBeNull();
    expect(parseChoiceId('elegir:monto:5')).toBeNull();
    expect(parseChoiceId('elegir:account:')).toBeNull();
  });
});

describe('questionFor', () => {
  it('pregunta la cuenta y ofrece las cuentas activas', () => {
    const q = questionFor(['account'], phrase(), [cash, bank, old], categories);
    expect(q?.text).toBe('Gasto de $ 18.000,00. ¿De qué cuenta?');
    expect(q?.options).toEqual([
      { id: 'elegir:account:cash', title: 'Efectivo' },
      { id: 'elegir:account:bank', title: 'Banco' },
    ]);
  });

  it('si dijo "50 dólares", solo ofrece las cuentas en dólares', () => {
    const q = questionFor(
      ['account'],
      phrase({ currency: 'USD', amount: 5_000 }),
      [cash, usd],
      categories,
    );
    expect(q?.text).toBe('Gasto de US$ 50,00. ¿De qué cuenta?');
    expect(q?.options.map((o) => o.id)).toEqual(['elegir:account:usd']);
  });

  it('pregunta la categoría con las categorías del tipo del movimiento', () => {
    const q = questionFor(
      ['category'],
      phrase({ categoryId: null, accountId: 'cash' }),
      [cash],
      categories,
    );
    expect(q?.text).toContain('¿En qué categoría?');
    expect(q?.options.map((o) => o.title)).toEqual(['Comida', 'Transporte', 'Servicios', 'Ocio']);
  });

  it('en una transferencia, el destino es de la misma moneda y distinto del origen', () => {
    const transfer = phrase({
      type: 'transfer',
      accountId: 'cash',
      categoryId: null,
      missing: ['toAccount'],
    });
    const q = questionFor(['toAccount'], transfer, [cash, bank, usd], categories);
    expect(q?.text).toBe('Transferencia de $ 18.000,00. ¿A qué cuenta?');
    expect(q?.options.map((o) => o.id)).toEqual(['elegir:toAccount:bank']);
  });

  it('en un cambio, el destino es de otra moneda', () => {
    const exchange = phrase({
      type: 'exchange',
      accountId: 'cash',
      toAmount: 5_000,
      categoryId: null,
    });
    const q = questionFor(['toAccount'], exchange, [cash, bank, usd], categories);
    expect(q?.options.map((o) => o.id)).toEqual(['elegir:toAccount:usd']);
  });

  it('el monto y el tipo se contestan escribiendo: no llevan opciones', () => {
    const noAmount = questionFor(['amount'], phrase({ amount: null }), [cash], categories);
    expect(noAmount).toEqual({ text: 'Gasto. ¿De cuánto fue?', options: [] });
    const noType = questionFor(
      ['type', 'amount'],
      phrase({ type: null, amount: null }),
      [cash],
      categories,
    );
    expect(noType?.text).toContain('¿Qué querés registrar');
    expect(noType?.options).toEqual([]);
  });

  it('pregunta de a un dato, en orden: primero el monto, después la cuenta', () => {
    const q = questionFor(['account', 'amount'], phrase({ amount: null }), [cash], categories);
    expect(q?.text).toContain('¿De cuánto fue?');
  });

  it('con más de 10 opciones no ofrece ninguna (se contesta escribiendo)', () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      makeAccount({ id: `a${String(i)}`, name: `Cuenta ${String(i)}` }),
    );
    expect(questionFor(['account'], phrase(), many, categories)?.options).toEqual([]);
  });

  it('acorta los nombres largos para el botón', () => {
    const long = makeAccount({ id: 'long', name: 'Cuenta sueldo del banco Provincia' });
    const q = questionFor(['account'], phrase(), [long], categories);
    expect(q?.options[0]?.title).toHaveLength(20);
    expect(q?.options[0]?.title.endsWith('…')).toBe(true);
  });

  it('sin nada por preguntar devuelve null', () => {
    expect(questionFor([], phrase(), [cash], categories)).toBeNull();
  });
});

describe('applyChoice', () => {
  it('elegir la cuenta completa el movimiento', () => {
    const chosen = applyChoice(phrase(), 'account', 'cash');
    expect(chosen.accountId).toBe('cash');
    expect(chosen.missing).toEqual([]);
    // Con todo entendido, ya se puede armar el borrador para validar y confirmar.
    expect(draftFromPhrase(chosen, [cash]).ok).toBe(true);
  });

  it('elegir la categoría o el destino completa ese campo y deja lo demás', () => {
    const noCategory = phrase({ accountId: 'cash', categoryId: null, missing: ['category'] });
    expect(applyChoice(noCategory, 'category', 'seed_ocio').categoryId).toBe('seed_ocio');
    const noDestination = phrase({
      type: 'transfer',
      accountId: 'cash',
      categoryId: null,
      missing: ['toAccount'],
    });
    const chosen = applyChoice(noDestination, 'toAccount', 'bank');
    expect(chosen).toMatchObject({ accountId: 'cash', toAccountId: 'bank', missing: [] });
  });

  it('si todavía falta otra cosa, la sigue marcando', () => {
    const chosen = applyChoice(
      phrase({ amount: null, missing: ['amount', 'account'] }),
      'account',
      'cash',
    );
    expect(chosen.missing).toEqual(['amount']);
  });
});

describe('joinPhrases', () => {
  it('une el mensaje anterior con la respuesta', () => {
    expect(joinPhrases('gasté 18 mil en el súper ', ' con efectivo')).toBe(
      'gasté 18 mil en el súper con efectivo',
    );
  });
});
