// "Borrar mi cuenta" (ADR 0006 y 0030): la parte pura del proceso. Qué documentos se borran y en
// qué lotes, cuándo hace falta volver a iniciar sesión y cuándo se puede empezar.
// La capa data hace los borrados en Firestore siguiendo este plan.

import type { DomainError } from './errors';
import { err, ok, type Result } from './result';

/** Máximo de operaciones de un `writeBatch` de Firestore. */
export const DELETION_BATCH_SIZE = 500;

/**
 * Firebase exige haber iniciado sesión hace menos de 5 minutos para borrar el usuario de Auth.
 * Se pide de nuevo a partir de los 4, para que no venza mientras se borran los datos.
 */
export const RECENT_LOGIN_MS = 4 * 60_000;

/** Un documento a borrar: la colección y su ID. */
export interface DocKey<K extends string> {
  collection: K;
  id: string;
}

export interface DeletionPlan<K extends string> {
  /** Lotes de hasta `DELETION_BATCH_SIZE` documentos; un lote puede mezclar colecciones. */
  batches: DocKey<K>[][];
  /** Cantidad de documentos, para mostrar el progreso. */
  total: number;
}

/** Arma los lotes con los IDs de cada colección (salen de la caché local: no gasta lecturas). */
export function deletionPlan<K extends string>(
  idsByCollection: Readonly<Record<K, readonly string[]>>,
  batchSize: number = DELETION_BATCH_SIZE,
): DeletionPlan<K> {
  const keys: DocKey<K>[] = [];
  for (const collection of Object.keys(idsByCollection) as K[]) {
    for (const id of idsByCollection[collection]) keys.push({ collection, id });
  }
  const batches: DocKey<K>[][] = [];
  for (let start = 0; start < keys.length; start += batchSize) {
    batches.push(keys.slice(start, start + batchSize));
  }
  return { batches, total: keys.length };
}

/** `true` si el último inicio de sesión es demasiado viejo para borrar el usuario de Auth. */
export function needsReauth(authTimeMs: number, nowMs: number): boolean {
  return !Number.isFinite(authTimeMs) || nowMs - authTimeMs >= RECENT_LOGIN_MS;
}

export interface DeletionReadiness {
  /** El dispositivo está al día con el servidor (hay conexión). */
  upToDate: boolean;
  /** Hay cambios que todavía no se subieron. */
  pendingWrites: boolean;
}

/**
 * Se puede empezar solo con conexión, al día y sin cambios pendientes: así la caché tiene los
 * IDs de todo lo que se creó en otros dispositivos y no queda nada a medias.
 */
export function canStartDeletion({
  upToDate,
  pendingWrites,
}: DeletionReadiness): Result<void, DomainError> {
  if (pendingWrites) return err({ code: 'deletion.pendingWrites' });
  if (!upToDate) return err({ code: 'deletion.notSynced' });
  return ok(undefined);
}

/** Por qué se cortó el borrado; la pantalla muestra `deletionFailureMessage`. */
export type DeletionFailure =
  | 'quota' // se agotó la cuota diaria de borrados del plan Spark
  | 'userMismatch' // al volver a iniciar sesión se eligió otra cuenta de Google
  | 'recentLogin' // venció el inicio de sesión reciente antes de borrar el usuario
  | 'offline' // sin conexión al hablar con Google
  | 'unknown';

export function deletionFailureMessage(failure: DeletionFailure): string {
  switch (failure) {
    case 'quota':
      return 'Se alcanzó el límite diario de borrados de Firebase. Volvé a intentarlo mañana: sigue desde donde quedó.';
    case 'userMismatch':
      return 'Elegiste otra cuenta de Google. Para borrar esta cuenta, iniciá sesión con la misma.';
    case 'recentLogin':
      return 'Pasó demasiado tiempo desde que confirmaste tu cuenta. Volvé a intentarlo: sigue desde donde quedó.';
    case 'offline':
      return 'No hay conexión. Volvé a intentarlo cuando tengas señal: sigue desde donde quedó.';
    case 'unknown':
      return 'No se pudo terminar de borrar la cuenta. Volvé a intentarlo: sigue desde donde quedó.';
  }
}
