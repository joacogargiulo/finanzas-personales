// Siembra de las categorías iniciales (SRS 4.7, ADR 0004).

import { FirebaseError } from 'firebase/app';
import {
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { SCHEMA_VERSION } from '../domain/model';
import { SEED_CATEGORIES } from '../domain/seed';
import { docRef, profileRef } from './paths';

/**
 * Crea el perfil (si no existe) y las 6 categorías iniciales, una sola vez por usuario.
 *
 * Corre dentro de una transacción: Firestore lee el perfil y, si otro dispositivo lo cambió
 * antes de terminar, vuelve a empezar. Así, si dos dispositivos siembran a la vez, el segundo
 * ve `seededAt` y no hace nada, y nunca se pisa una categoría que el usuario ya renombró.
 *
 * Necesita conexión (es el único caso en que se espera al servidor). Devuelve `true` si sembró.
 */
export async function ensureSeeded(
  db: Firestore,
  uid: string,
  now: () => number = Date.now,
): Promise<boolean> {
  try {
    return await seedTransaction(db, uid, now);
  } catch (error) {
    // Si otro dispositivo sembró mientras tanto, el servidor puede evaluar las reglas antes de
    // detectar el conflicto: las categorías ya existen con otro createdAt (inmutable) y responde
    // "permission-denied" en vez de pedir un reintento. La transacción es atómica, así que no se
    // escribió nada; alcanza con confirmar que la siembra del otro dispositivo quedó hecha.
    if (error instanceof FirebaseError && error.code === 'permission-denied') {
      const profile = await getDocFromServer(profileRef(db, uid));
      if (profile.exists() && profile.get('seededAt') !== null) return false;
    }
    throw error;
  }
}

function seedTransaction(db: Firestore, uid: string, now: () => number): Promise<boolean> {
  return runTransaction(db, async (tx) => {
    const ref = profileRef(db, uid);
    const profile = await tx.get(ref);
    if (profile.exists() && profile.get('seededAt') !== null) return false;

    const at = now();
    if (profile.exists()) {
      tx.update(ref, { seededAt: at, updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, {
        schemaVersion: SCHEMA_VERSION,
        seededAt: at,
        sheetsSpreadsheetId: null,
        createdAt: at,
        updatedAt: serverTimestamp(),
      });
    }
    for (const { id, ...category } of SEED_CATEGORIES) {
      tx.set(docRef(db, uid, 'categories', id), {
        ...category,
        archivedAt: null,
        createdAt: at,
        updatedAt: serverTimestamp(),
        deletedAt: null,
      });
    }
    return true;
  });
}
