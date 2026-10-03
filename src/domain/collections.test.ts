import { describe, expect, it } from 'vitest';
import {
  alive,
  compareNames,
  indexById,
  referenceStatus,
  selectable,
  sortAccounts,
  sortTransactions,
} from './collections';
import { makeAccount, makeExpense } from './testing/factories';

describe('lápidas y archivados (ADR 0005)', () => {
  const active = makeAccount({ name: 'Activa' });
  const archived = makeAccount({ name: 'Archivada', archivedAt: 1 });
  const deleted = makeAccount({ name: 'Eliminada', deletedAt: 1 });
  const all = [active, archived, deleted];

  // alive() saca solo las lápidas; selectable() también los archivados.
  it('alive y selectable', () => {
    expect(alive(all)).toEqual([active, archived]);
    expect(selectable(all)).toEqual([active]);
  });

  // indexById conserva las lápidas para poder mostrar "(eliminada)".
  it('referenceStatus distingue los cuatro casos', () => {
    const byId = indexById(all);
    expect(referenceStatus(active.id, byId)).toBe('active');
    expect(referenceStatus(archived.id, byId)).toBe('archived');
    expect(referenceStatus(deleted.id, byId)).toBe('deleted');
    expect(referenceStatus('no-existe', byId)).toBe('unknown');
  });
});

describe('sortTransactions (SRS 5.11)', () => {
  // Más nuevo primero: fecha descendente y, en el mismo día, el último creado arriba.
  it('ordena por fecha y después por createdAt, sin modificar el original', () => {
    const a = makeExpense({
      id: 'a',
      accountId: 'x',
      categoryId: 'c',
      date: '2026-10-01',
      createdAt: 5,
    });
    const b = makeExpense({
      id: 'b',
      accountId: 'x',
      categoryId: 'c',
      date: '2026-10-02',
      createdAt: 1,
    });
    const c = makeExpense({
      id: 'c',
      accountId: 'x',
      categoryId: 'c',
      date: '2026-10-01',
      createdAt: 9,
    });
    const input = [a, b, c];
    expect(sortTransactions(input).map((t) => t.id)).toEqual(['b', 'c', 'a']);
    expect(input.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sortAccounts (SRS 4.8)', () => {
  it('ordena por moneda (ARS, USD, EUR) y después por nombre', () => {
    const input = [
      makeAccount({ name: 'Euros', currency: 'EUR' }),
      makeAccount({ name: 'Caja dólares', currency: 'USD' }),
      makeAccount({ name: 'efectivo', currency: 'ARS' }),
      makeAccount({ name: 'Banco', currency: 'ARS' }),
    ];
    expect(sortAccounts(input).map((a) => a.name)).toEqual([
      'Banco',
      'efectivo',
      'Caja dólares',
      'Euros',
    ]);
  });

  it('no modifica la lista original', () => {
    const input = [makeAccount({ currency: 'USD' }), makeAccount({ currency: 'ARS' })];
    const copy = [...input];
    sortAccounts(input);
    expect(input).toEqual(copy);
  });
});

describe('compareNames', () => {
  it('no distingue mayúsculas ni acentos', () => {
    expect(compareNames('Ómnibus', 'omnibus')).toBe(0);
    expect(compareNames('árbol', 'Banco')).toBeLessThan(0);
  });
});
