// Utilidades sobre colecciones: lápidas, archivados y orden (ADR 0005, SRS 5.11).

import type { EpochMs, LocalDate } from './model';

interface Tombstoned {
  deletedAt: EpochMs | null;
}

interface Archivable extends Tombstoned {
  archivedAt: EpochMs | null;
}

/** El documento existe (no es una lápida). */
export function isAlive(doc: Tombstoned): boolean {
  return doc.deletedAt === null;
}

/** Existe y no está archivado: es lo que se ofrece en los selectores. */
export function isActive(doc: Archivable): boolean {
  return doc.deletedAt === null && doc.archivedAt === null;
}

/** Sin lápidas. Toda consulta del dominio empieza por acá. */
export function alive<T extends Tombstoned>(docs: readonly T[]): T[] {
  return docs.filter(isAlive);
}

/** Sin lápidas ni archivados. */
export function selectable<T extends Archivable>(docs: readonly T[]): T[] {
  return docs.filter(isActive);
}

/**
 * Índice por ID. Incluye las lápidas a propósito: un movimiento puede apuntar a una cuenta
 * eliminada en otro dispositivo, y la app igual muestra su nombre con la marca "(eliminada)".
 */
export function indexById<T extends { id: string }>(docs: readonly T[]): Map<string, T> {
  return new Map(docs.map((doc) => [doc.id, doc]));
}

/** Cómo mostrar una referencia: el documento puede estar archivado, eliminado o no existir. */
export type ReferenceStatus = 'active' | 'archived' | 'deleted' | 'unknown';

export function referenceStatus<T extends Archivable>(
  id: string,
  byId: ReadonlyMap<string, T>,
): ReferenceStatus {
  const doc = byId.get(id);
  if (!doc) return 'unknown';
  if (doc.deletedAt !== null) return 'deleted';
  if (doc.archivedAt !== null) return 'archived';
  return 'active';
}

interface Sortable {
  id: string;
  date: LocalDate;
  createdAt: EpochMs;
}

/** Fecha descendente y, dentro del mismo día, `createdAt` descendente (SRS 5.11). Devuelve una copia. */
export function sortTransactions<T extends Sortable>(transactions: readonly T[]): T[] {
  return [...transactions].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
    // Desempate final por ID, así el orden es estable en todos los dispositivos.
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}
