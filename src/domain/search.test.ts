import { describe, expect, it } from 'vitest';
import { indexById } from './collections';
import {
  EMPTY_FILTERS,
  filterTransactions,
  hasActiveFilters,
  normalizeText,
  type TransactionFilters,
} from './search';
import {
  makeAccount,
  makeCategory,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from './testing/factories';

const cash = makeAccount({ name: 'Efectivo' });
const card = makeAccount({ name: 'Tarjeta de Crédito' });
const usd = makeAccount({ name: 'Ahorro USD', currency: 'USD' });
const food = makeCategory({ name: 'Comida' });
const salary = makeCategory({ name: 'Salario', type: 'income' });
const accounts = indexById([cash, card, usd]);
const categories = indexById([food, salary]);

const lunch = makeExpense({
  accountId: card.id,
  categoryId: food.id,
  description: 'Almuerzo',
  date: '2026-10-01',
});
const pay = makeIncome({
  accountId: cash.id,
  categoryId: salary.id,
  description: 'Sueldo de octubre',
  date: '2026-10-05',
});
const move = makeTransfer({ accountId: card.id, toAccountId: cash.id, date: '2026-10-10' });
const fx = makeExchange({ accountId: cash.id, toAccountId: usd.id, date: '2026-10-20' });
const deleted = makeExpense({
  accountId: cash.id,
  categoryId: food.id,
  description: 'Almuerzo',
  deletedAt: 1,
});
const all = [lunch, pay, move, fx, deleted];

function ids(filters: Partial<TransactionFilters>) {
  return filterTransactions(all, { ...EMPTY_FILTERS, ...filters }, accounts, categories).map(
    (t) => t.id,
  );
}

describe('normalizeText', () => {
  it('quita acentos y mayúsculas', () => {
    expect(normalizeText('  Crédito ÑANDÚ ')).toBe('credito nandu');
  });
});

describe('buscador (SRS 6.4)', () => {
  // TC-18: "credito" encuentra el movimiento de la cuenta "Tarjeta de Crédito".
  it('TC-18: busca sin acentos en el nombre de la cuenta', () => {
    expect(ids({ text: 'credito' })).toEqual([lunch.id, move.id]);
  });

  // Busca también en la descripción y en la categoría; las lápidas nunca aparecen.
  it('busca en descripción y categoría', () => {
    expect(ids({ text: 'ALMUERZO' })).toEqual([lunch.id]);
    expect(ids({ text: 'salario' })).toEqual([pay.id]);
  });

  // Varias palabras: tienen que estar todas, en cualquier campo.
  it('combina palabras', () => {
    expect(ids({ text: 'sueldo efectivo' })).toEqual([pay.id]);
    expect(ids({ text: 'sueldo tarjeta' })).toEqual([]);
  });
});

describe('filtros combinables', () => {
  it('sin filtros devuelve todo lo que no está eliminado', () => {
    expect(ids({})).toEqual([lunch.id, pay.id, move.id, fx.id]);
  });

  it('por tipo', () => {
    expect(ids({ type: 'exchange' })).toEqual([fx.id]);
  });

  // La cuenta coincide como origen o como destino.
  it('por cuenta, origen o destino', () => {
    expect(ids({ accountId: usd.id })).toEqual([fx.id]);
    expect(ids({ accountId: cash.id })).toEqual([pay.id, move.id, fx.id]);
  });

  // Con Transferencia o Cambio, la categoría se ignora (el filtro está deshabilitado).
  it('por categoría, ignorada en transferencias', () => {
    expect(ids({ categoryId: food.id })).toEqual([lunch.id]);
    expect(ids({ type: 'transfer', categoryId: food.id })).toEqual([move.id]);
  });

  it('por rango de fechas (incluye los extremos)', () => {
    expect(ids({ from: '2026-10-05', to: '2026-10-10' })).toEqual([pay.id, move.id]);
  });

  it('todo junto', () => {
    expect(ids({ text: 'efectivo', type: 'income', from: '2026-10-01' })).toEqual([pay.id]);
  });

  it('hasActiveFilters', () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, text: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, to: '2026-10-01' })).toBe(true);
  });
});
