// Cursor de la sincronización incremental (ADR 0003 y 0016).

import { Timestamp } from 'firebase/firestore';

/**
 * Margen de solapamiento: se vuelve a pedir lo que cambió en los últimos 10 minutos antes del
 * cursor. Cubre escrituras que el servidor confirma un instante después de su marca de tiempo.
 * Releer unos pocos documentos es barato y no duplica nada (se identifican por ID).
 */
export const CURSOR_MARGIN_MS = 10 * 60 * 1000;

/**
 * Desde dónde pedirle cambios al servidor. Recibe el `updatedAt` de cada documento de la caché,
 * o `null` si el documento tiene una escritura pendiente (todavía no tiene hora del servidor).
 * Devuelve `null` si no hay ningún documento confirmado: entonces se descarga todo.
 */
export function syncCursor(updatedAts: Iterable<Timestamp | null>): Timestamp | null {
  let max: number | null = null;
  for (const value of updatedAts) {
    if (value === null) continue;
    const ms = value.toMillis();
    if (max === null || ms > max) max = ms;
  }
  return max === null ? null : Timestamp.fromMillis(max - CURSOR_MARGIN_MS);
}
