import { describe, expect, it } from 'vitest';
import { alive, indexById, referenceStatus, selectable, sortTransactions } from './collections';
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
