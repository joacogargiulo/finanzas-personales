import { describe, expect, it } from 'vitest';
import {
  canStartDeletion,
  DELETION_BATCH_SIZE,
  deletionFailureMessage,
  deletionPlan,
  needsReauth,
  RECENT_LOGIN_MS,
  type DeletionFailure,
} from './accountDeletion';

// "Borrar mi cuenta" (ADR 0006 y 0030): la parte que no depende de Firebase.

/** `n` IDs inventados: a0, a1, a2… */
function ids(n: number, prefix = 'a'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i)}`);
}

describe('deletionPlan: lotes de borrado', () => {
  // Un writeBatch admite hasta 500 operaciones: los lotes nunca pasan ese tamaño y, entre todos,
  // tienen cada documento exactamente una vez.
  it.each([
    [0, 0],
    [1, 1],
    [500, 1],
    [501, 2],
    [1_200, 3],
  ])('%i documentos → %i lotes', (count, batches) => {
    const plan = deletionPlan({ transactions: ids(count) });
    expect(plan.total).toBe(count);
    expect(plan.batches).toHaveLength(batches);
    expect(plan.batches.every((b) => b.length <= DELETION_BATCH_SIZE)).toBe(true);
    expect(new Set(plan.batches.flat().map((key) => key.id)).size).toBe(count);
  });

  // Un lote puede mezclar colecciones, así no se gasta un commit por cada colección chica.
  it('junta colecciones distintas en el mismo lote', () => {
    const plan = deletionPlan({ accounts: ['c1', 'c2'], categories: ['k1'] }, 2);
    expect(plan.batches).toEqual([
      [
        { collection: 'accounts', id: 'c1' },
        { collection: 'accounts', id: 'c2' },
      ],
      [{ collection: 'categories', id: 'k1' }],
    ]);
    expect(plan.total).toBe(3);
  });
});

describe('needsReauth: inicio de sesión reciente', () => {
  const now = 10 * 60_000;

  // Firebase pide menos de 5 minutos; la app pide de nuevo desde los 4, con margen.
  it('no lo pide si iniciaste sesión hace menos de 4 minutos', () => {
    expect(needsReauth(now - RECENT_LOGIN_MS + 1, now)).toBe(false);
  });

  it('lo pide desde los 4 minutos', () => {
    expect(needsReauth(now - RECENT_LOGIN_MS, now)).toBe(true);
  });

  // Si la fecha del token no se pudo leer, por las dudas se pide.
  it('lo pide si la fecha no es válida', () => {
    expect(needsReauth(Number.NaN, now)).toBe(true);
  });
});

describe('canStartDeletion: cuándo se puede empezar', () => {
  it('con conexión y sin cambios pendientes, sí', () => {
    expect(canStartDeletion({ upToDate: true, pendingWrites: false }).ok).toBe(true);
  });

  // Los cambios pendientes van primero: aunque falte conexión, es lo que hay que esperar.
  it('con cambios pendientes, no', () => {
    expect(canStartDeletion({ upToDate: false, pendingWrites: true })).toEqual({
      ok: false,
      error: { code: 'deletion.pendingWrites' },
    });
  });

  it('sin estar al día con el servidor, no', () => {
    expect(canStartDeletion({ upToDate: false, pendingWrites: false })).toEqual({
      ok: false,
      error: { code: 'deletion.notSynced' },
    });
  });
});

describe('deletionFailureMessage', () => {
  const failures: DeletionFailure[] = ['quota', 'userMismatch', 'recentLogin', 'offline', 'unknown'];

  it.each(failures)('%s tiene texto', (failure) => {
    expect(deletionFailureMessage(failure).length).toBeGreaterThan(10);
  });
});
