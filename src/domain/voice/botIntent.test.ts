import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from '../seed';
import { makeAccount, makeCategory } from '../testing/factories';
import { BOT_RESPONSE_SCHEMA, buildBotMessages } from './botPrompt';
import { parseBotIntent, quickIntent, rulesIntent } from './botIntent';

// La IA clasifica el mensaje (ADR 0035) y el dominio revisa todo lo que dice: una intención que no
// existe, un ID ajeno o una charla con cifras no pasan. Sin IA, `rulesIntent` cubre lo básico.

const TODAY = '2026-10-14';
const accounts = [
  makeAccount({ id: 'cash', name: 'Efectivo' }),
  makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet' }),
  makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' }),
  makeAccount({ id: 'old', name: 'Banco Viejo', archivedAt: 1 }),
];
const categories = SEED_CATEGORIES.map((c) => makeCategory({ ...c }));
const ctx = { accounts, categories, today: TODAY };

/** Una respuesta de la IA: todos los campos, cada test cambia los que le importan. */
function answer(overrides: Record<string, unknown> = {}) {
  return {
    intent: 'other',
    type: null,
    amount: null,
    toAmount: null,
    currency: null,
    date: null,
    accountId: null,
    toAccountId: null,
    categoryId: null,
    description: '',
    queryKind: null,
    queryPeriod: null,
    reply: '',
    ...overrides,
  };
}

describe('parseBotIntent', () => {
  it('un movimiento se valida igual que en el dictado', () => {
    const raw = answer({
      intent: 'movement',
      type: 'expense',
      amount: '18000',
      date: TODAY,
      accountId: 'cash',
      categoryId: 'seed_comida',
      description: 'Súper',
    });
    const intent = parseBotIntent(raw, 'gasté 18 mil en el súper con efectivo', ctx);
    expect(intent).toMatchObject({
      kind: 'movement',
      phrase: { type: 'expense', amount: 1_800_000, accountId: 'cash', missing: [] },
    });
  });

  // La cuenta que dice el mensaje anterior cuenta: "con efectivo" ya se dijo antes.
  it('con un mensaje anterior, las cuentas nombradas en cualquiera de los dos valen', () => {
    const raw = answer({
      intent: 'movement',
      type: 'expense',
      amount: '18000',
      accountId: 'cash',
      categoryId: 'seed_comida',
    });
    const withPrevious = parseBotIntent(raw, 'sí, en comida', ctx, 'gasté 18 mil con efectivo');
    expect(withPrevious).toMatchObject({ kind: 'movement', phrase: { accountId: 'cash' } });
  });

  it('una cuenta que el mensaje no nombra (con dos en pesos) se descarta y queda por preguntar', () => {
    const raw = answer({
      intent: 'movement',
      type: 'expense',
      amount: '18000',
      accountId: 'mp',
      categoryId: 'seed_comida',
    });
    const intent = parseBotIntent(raw, 'gasté 18 mil en el súper', ctx);
    expect(intent).toMatchObject({ kind: 'movement', phrase: { accountId: null } });
  });

  it('una consulta con cuenta, categoría y período válidos', () => {
    const raw = answer({
      intent: 'query',
      queryKind: 'spending',
      queryPeriod: 'week',
      accountId: 'cash',
      categoryId: 'seed_comida',
    });
    expect(parseBotIntent(raw, 'cuánto gasté en comida esta semana con efectivo', ctx)).toEqual({
      kind: 'query',
      query: { kind: 'spending', accountId: 'cash', categoryId: 'seed_comida', period: 'week' },
    });
  });

  it('en una consulta, un ID inventado o archivado se descarta y un período raro es "este mes"', () => {
    const raw = answer({
      intent: 'query',
      queryKind: 'balance',
      queryPeriod: 'el mes del año pasado',
      accountId: 'inventada',
      categoryId: 'old',
    });
    expect(parseBotIntent(raw, 'cuánto tengo', ctx)).toEqual({
      kind: 'query',
      query: { kind: 'balance', accountId: null, categoryId: null, period: 'month' },
    });
    const archived = answer({ intent: 'query', queryKind: 'balance', accountId: 'old' });
    expect(parseBotIntent(archived, 'saldo del banco viejo', ctx)).toMatchObject({
      query: { accountId: null },
    });
  });

  it('una consulta de un tipo que no existe no se entiende', () => {
    expect(parseBotIntent(answer({ intent: 'query', queryKind: 'predecir' }), 'x', ctx)).toBeNull();
  });

  it.each(['greeting', 'thanks', 'help'] as const)('%s', (intent) => {
    expect(parseBotIntent(answer({ intent }), 'hola', ctx)).toEqual({ kind: intent });
  });

  describe('other', () => {
    it('conserva la frase del modelo si es corta y sin cifras', () => {
      const reply = 'De eso no sé, pero te ayudo con tus gastos y tus cuentas.';
      expect(parseBotIntent(answer({ reply }), 'quién ganó el partido', ctx)).toEqual({
        kind: 'other',
        reply,
      });
    });

    it('descarta una frase vacía, larga o con cifras', () => {
      for (const reply of ['', '   ', 'a'.repeat(281), 'Tenés $ 5000 en tu cuenta']) {
        expect(parseBotIntent(answer({ reply }), 'x', ctx)).toEqual({ kind: 'other', reply: null });
      }
    });

    it('junta los espacios y los saltos de línea', () => {
      const intent = parseBotIntent(answer({ reply: 'Hola\n\n  ¿cómo   va?' }), 'x', ctx);
      expect(intent).toEqual({ kind: 'other', reply: 'Hola ¿cómo va?' });
    });
  });

  it('una intención desconocida, un JSON roto o algo que no es un objeto devuelven null', () => {
    expect(parseBotIntent(answer({ intent: 'hackear' }), 'x', ctx)).toBeNull();
    expect(parseBotIntent('{no es json', 'x', ctx)).toBeNull();
    expect(parseBotIntent(null, 'x', ctx)).toBeNull();
    expect(parseBotIntent([], 'x', ctx)).toBeNull();
  });

  it('acepta el JSON como texto', () => {
    expect(parseBotIntent(JSON.stringify(answer({ intent: 'greeting' })), 'hola', ctx)).toEqual({
      kind: 'greeting',
    });
  });
});

describe('rulesIntent (sin IA)', () => {
  it.each(['hola', 'Hola!', 'buen día', 'buenas tardes', 'qué tal'])(
    '"%s" es un saludo',
    (text) => {
      expect(rulesIntent(text, ctx)).toEqual({ kind: 'greeting' });
    },
  );

  it.each(['gracias', 'Muchas gracias!', 'perfecto, gracias', 'chau'])(
    '"%s" es un agradecimiento',
    (text) => {
      expect(rulesIntent(text, ctx)).toEqual({ kind: 'thanks' });
    },
  );

  it.each(['ayuda', 'qué podés hacer', 'cómo funciona esto'])('"%s" pide ayuda', (text) => {
    expect(rulesIntent(text, ctx)).toEqual({ kind: 'help' });
  });

  it('"cuáles son mis cuentas" lista las cuentas', () => {
    expect(rulesIntent('cuáles son mis cuentas', ctx)).toMatchObject({
      kind: 'query',
      query: { kind: 'accounts' },
    });
  });

  it('el saldo de todo o de una cuenta nombrada', () => {
    expect(rulesIntent('cuánta plata tengo', ctx)).toMatchObject({
      query: { kind: 'balance', accountId: null },
    });
    expect(rulesIntent('cuánto me queda en Efectivo', ctx)).toMatchObject({
      query: { kind: 'balance', accountId: 'cash' },
    });
  });

  it.each([
    ['cuánto gasté hoy', 'today'],
    ['cuánto gasté ayer', 'yesterday'],
    ['cuánto gasté esta semana', 'week'],
    ['cuánto gasté este mes', 'month'],
    ['cuánto gasté el mes pasado', 'lastMonth'],
    ['cuánto gasté este año', 'year'],
    ['cuánto gasté', 'month'],
  ] as const)('"%s" → gastos de %s', (text, period) => {
    expect(rulesIntent(text, ctx)).toMatchObject({
      kind: 'query',
      query: { kind: 'spending', period },
    });
  });

  it('gastos de una categoría, ingresos, resumen y en qué se gastó', () => {
    expect(rulesIntent('cuánto gasté en comida este mes', ctx)).toMatchObject({
      query: { kind: 'spending', categoryId: 'seed_comida' },
    });
    expect(rulesIntent('cuánto cobré este mes', ctx)).toMatchObject({ query: { kind: 'income' } });
    expect(rulesIntent('cómo vengo este mes', ctx)).toMatchObject({ query: { kind: 'summary' } });
    expect(rulesIntent('en qué gasté más este mes', ctx)).toMatchObject({
      query: { kind: 'byCategory' },
    });
  });

  // "gasté 500" cuenta un gasto; "cuánto gasté" lo pregunta.
  it('contar un gasto no se confunde con preguntarlo', () => {
    expect(rulesIntent('gasté 500 en comida con efectivo', ctx).kind).toBe('movement');
    expect(rulesIntent('hola, gasté 500', ctx).kind).toBe('movement');
  });

  it('algo que no se entiende es "other" sin frase propia', () => {
    expect(rulesIntent('quién ganó el partido', ctx)).toEqual({ kind: 'other', reply: null });
    expect(rulesIntent('', ctx)).toEqual({ kind: 'other', reply: null });
  });
});

describe('buildBotMessages', () => {
  const input = {
    phrase: 'con efectivo',
    today: TODAY,
    accounts: [{ id: 'cash', name: 'Efectivo', currency: 'ARS' as const }],
    categories: [{ id: 'seed_comida', name: 'Comida', type: 'expense' as const }],
  };

  it('manda las instrucciones aparte de los datos y el día de la semana', () => {
    const [system, user] = buildBotMessages(input);
    expect(system?.role).toBe('system');
    expect(system?.content).toContain('"intent"');
    expect(system?.content).toContain('Tipos:'); // las reglas de movimientos del dictado
    expect(user?.content).toContain('2026-10-14 (miércoles)');
    expect(user?.content).toContain('"con efectivo"');
    expect(user?.content).not.toContain('anterior');
  });

  it('suma el mensaje anterior solo si lo hay', () => {
    const [, user] = buildBotMessages({ ...input, previous: 'gasté 18 mil' });
    expect(user?.content).toContain('"anterior":"gasté 18 mil"');
  });

  // La IA no tiene que ver montos del usuario: solo nombres e IDs.
  it('no incluye saldos ni montos en los datos', () => {
    const [, user] = buildBotMessages(input);
    expect(user?.content).not.toMatch(/saldo|balance|amount/i);
  });

  it('el esquema pide todos los campos', () => {
    expect(BOT_RESPONSE_SCHEMA.required).toContain('intent');
    expect(BOT_RESPONSE_SCHEMA.required).toHaveLength(
      Object.keys(BOT_RESPONSE_SCHEMA.properties).length,
    );
  });
});

describe('quickIntent', () => {
  it('reconoce saludo, gracias y ayuda sin necesitar cuentas', () => {
    expect(quickIntent('hola')).toEqual({ kind: 'greeting' });
    expect(quickIntent('gracias!')).toEqual({ kind: 'thanks' });
    expect(quickIntent('qué podés hacer')).toEqual({ kind: 'help' });
  });

  // Si hay un monto, es un movimiento aunque empiece con un saludo.
  it('un saludo con un gasto no es un saludo', () => {
    expect(quickIntent('hola, gasté 500 en comida')).toBeNull();
  });

  it('una consulta o un movimiento no son "rápidos"', () => {
    expect(quickIntent('cuánta plata tengo')).toBeNull();
    expect(quickIntent('gasté 500')).toBeNull();
  });
});
