// "Borrar mi cuenta" en Firestore (ADR 0006 y 0030). Es el único borrado físico de la app.
//
// A diferencia del resto de las escrituras (src/data/writes.ts), acá sí se espera cada
// `commit()`: hace falta para mostrar el progreso y saber cuándo terminó. El flujo exige
// conexión antes de empezar; si la señal se corta a mitad, el lote queda en la cola de
// Firestore y la promesa se resuelve cuando vuelve.

import { FirebaseError } from 'firebase/app';
import { deleteDoc, writeBatch, type Firestore } from 'firebase/firestore';
import type { DeletionFailure, DocKey } from '../domain/accountDeletion';
import { docRef, profileRef, type UserCollection } from './paths';

/**
 * Borra los lotes en orden. Después de cada uno avisa cuántos documentos van borrados.
 * Si se corta a mitad, lo ya borrado no vuelve: al repetir, el plan sale de lo que queda.
 */
export async function deleteUserDocs(
  db: Firestore,
  uid: string,
  batches: readonly (readonly DocKey<UserCollection>[])[],
  onProgress: (done: number) => void,
): Promise<void> {
  let done = 0;
  for (const keys of batches) {
    const batch = writeBatch(db);
    for (const { collection, id } of keys) batch.delete(docRef(db, uid, collection, id));
    await batch.commit();
    done += keys.length;
    onProgress(done);
  }
}

/** Borra el perfil. Va al final: mientras exista, la cuenta sigue siendo usable. */
export function deleteProfile(db: Firestore, uid: string): Promise<void> {
  return deleteDoc(profileRef(db, uid));
}

/**
 * La persona cerró la ventana de Google sin confirmar: no es un error, se vuelve a Ajustes.
 */
export function isCancelledByUser(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'].includes(
      error.code,
    )
  );
}

/** Traduce el error de Firebase al motivo que muestra la pantalla. */
export function deletionFailure(error: unknown): DeletionFailure {
  if (!(error instanceof FirebaseError)) return 'unknown';
  switch (error.code) {
    case 'resource-exhausted':
      return 'quota';
    case 'auth/user-mismatch':
      return 'userMismatch';
    case 'auth/requires-recent-login':
      return 'recentLogin';
    case 'auth/network-request-failed':
    case 'unavailable':
      return 'offline';
    default:
      return 'unknown';
  }
}
