import { describe, expect, it } from 'vitest';
import { makeAccount } from '../testing/factories';
import type { ParsedPhrase } from './parsePhrase';
import { draftFromPhrase, unclearFields } from './phraseFields';

// `unclearFields` decide qué campos de una frase hay que revisar; lo usan el formulario de la app y
// el bot de WhatsApp. `draftFromPhrase` solo arma el movimiento si no queda nada por revisar.

const accounts = [
  makeAccount({ id: 'cash', name: 'Efectivo' }),
  makeAccount({ id: 'mp', name: 'Mercado Pago' }),
  makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' }),
  makeAccount({ id: 'old', name: 'Viejo', archivedAt: 1 }),
];

function phrase(overrides: Partial<ParsedPhrase> = {}): ParsedPhrase {
  return {
    type: 'expense',
    amount: 1_800_000,
    toAmount: null,
    currency: null,
    date: '2026-10-03',
    accountId: 'cash',
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
    missing: [],
    unsupported: null,
    ...overrides,
  };
}

describe('unclearFields', () => {
  it('un gasto completo no deja nada por revisar', () => {
    expect(unclearFields(phrase(), accounts)).toEqual([]);
  });

  it('marca lo que no se entendió', () => {
    const p = phrase({ type: null, amount: null, accountId: null, categoryId: null });
    expect(unclearFields(p, accounts)).toEqual(['type', 'amount', 'account']);
  });

  it('"50 dólares" con una cuenta en pesos marca la cuenta', () => {
    expect(unclearFields(phrase({ currency: 'USD' }), accounts)).toEqual(['account']);
  });

  it('una transferencia necesita un destino activo de la misma moneda', () => {
    const transfer = phrase({ type: 'transfer', categoryId: null });
    expect(unclearFields({ ...transfer, toAccountId: 'mp' }, accounts)).toEqual([]);
    expect(unclearFields({ ...transfer, toAccountId: 'usd' }, accounts)).toEqual(['toAccount']);
    expect(unclearFields({ ...transfer, toAccountId: 'old' }, accounts)).toEqual(['toAccount']);
    expect(unclearFields({ ...transfer, toAccountId: 'cash' }, accounts)).toEqual(['toAccount']);
  });

  it('un cambio necesita el monto de destino y una cuenta de otra moneda', () => {
    const exchange = phrase({ type: 'exchange', categoryId: null, toAccountId: 'usd' });
    expect(unclearFields(exchange, accounts)).toEqual(['toAmount']);
    expect(unclearFields({ ...exchange, toAmount: 5_000 }, accounts)).toEqual([]);
    expect(unclearFields({ ...exchange, toAmount: 5_000, toAccountId: 'mp' }, accounts)).toEqual([
      'toAccount',
    ]);
  });

  it('con fallback toma el tipo y la cuenta del formulario', () => {
    const p = phrase({ type: null, accountId: null, categoryId: null });
    const fallback = { type: 'expense' as const, accountId: 'cash' };
    expect(unclearFields(p, accounts, fallback)).toEqual(['type', 'account', 'category']);
  });
});

describe('draftFromPhrase', () => {
  it('arma el borrador de un gasto completo', () => {
    expect(draftFromPhrase(phrase(), accounts)).toEqual({
      ok: true,
      draft: {
        type: 'expense',
        amount: 1_800_000,
        toAmount: undefined,
        date: '2026-10-03',
        description: 'Súper',
        accountId: 'cash',
        toAccountId: undefined,
        categoryId: 'seed_comida',
      },
    });
  });

  it('arma un cambio con los dos montos y la cuenta destino', () => {
    const exchange = phrase({
      type: 'exchange',
      categoryId: null,
      toAccountId: 'usd',
      toAmount: 5_000,
    });
    const result = draftFromPhrase(exchange, accounts);
    expect(result.ok && result.draft).toMatchObject({
      type: 'exchange',
      toAmount: 5_000,
      toAccountId: 'usd',
      categoryId: undefined,
    });
  });

  it('si falta algo, devuelve qué falta y no arma nada', () => {
    expect(draftFromPhrase(phrase({ categoryId: null }), accounts)).toEqual({
      ok: false,
      unclear: ['category'],
    });
  });
});
