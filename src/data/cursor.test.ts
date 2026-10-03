import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { CURSOR_MARGIN_MS, syncCursor } from './cursor';

// El cursor decide qué se le pide al servidor al abrir la app (ADR 0003 y 0016).

describe('syncCursor', () => {
  const at = (ms: number) => Timestamp.fromMillis(ms);

  it('sin documentos no hay cursor: se descarga todo', () => {
    expect(syncCursor([])).toBeNull();
  });

  it('con solo escrituras pendientes tampoco hay cursor', () => {
    expect(syncCursor([null, null])).toBeNull();
  });

  it('es el updatedAt más alto menos el margen', () => {
    const cursor = syncCursor([at(1_000_000), at(5_000_000), at(3_000_000)]);
    expect(cursor?.toMillis()).toBe(5_000_000 - CURSOR_MARGIN_MS);
  });

  // Un documento pendiente todavía no tiene hora del servidor: no puede mover el cursor.
  it('ignora los documentos con escrituras pendientes', () => {
    const cursor = syncCursor([at(2_000_000), null]);
    expect(cursor?.toMillis()).toBe(2_000_000 - CURSOR_MARGIN_MS);
  });
});
