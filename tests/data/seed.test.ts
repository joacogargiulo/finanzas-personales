import {
  collection,
  getDocFromServer,
  getDocsFromServer,
  serverTimestamp,
  setDoc,
  waitForPendingWrites,
} from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { docRef, profileRef } from '../../src/data/paths';
import { ensureSeeded } from '../../src/data/seed';
import { createClient, OWNER, useDataEnv, writerFor } from './helpers';

// Siembra de las categorías iniciales con runTransaction (SRS 4.7, ADR 0004, SRS 11.2.1).

useDataEnv();

async function categoryCount(): Promise<number> {
  const db = createClient(OWNER);
  const snapshot = await getDocsFromServer(collection(db, 'users', OWNER, 'categories'));
  return snapshot.size;
}

describe('ensureSeeded', () => {
  it('crea el perfil y las 6 categorías la primera vez', async () => {
    const db = createClient(OWNER);

    expect(await ensureSeeded(db, OWNER, () => 1_000)).toBe(true);

    const profile = await getDocFromServer(profileRef(db, OWNER));
    expect(profile.get('schemaVersion')).toBe(1);
    expect(profile.get('seededAt')).toBe(1_000);
    expect(await categoryCount()).toBe(6);
  });

  it('la segunda vez no hace nada', async () => {
    const db = createClient(OWNER);
    await ensureSeeded(db, OWNER);

    expect(await ensureSeeded(db, OWNER)).toBe(false);
  });

  // Si el perfil ya existía (sin siembra), se completa sin tocar su createdAt (inmutable).
  it('siembra un perfil que existe pero no estaba sembrado', async () => {
    const db = createClient(OWNER);
    await setDoc(profileRef(db, OWNER), {
      schemaVersion: 1,
      seededAt: null,
      sheetsSpreadsheetId: null,
      createdAt: 500,
      updatedAt: serverTimestamp(),
    });

    expect(await ensureSeeded(db, OWNER, () => 1_000)).toBe(true);

    const profile = await getDocFromServer(profileRef(db, OWNER));
    expect(profile.get('createdAt')).toBe(500);
    expect(profile.get('seededAt')).toBe(1_000);
  });

  // Dos dispositivos inician sesión a la vez por primera vez: la transacción del segundo
  // ve que el primero ya sembró y no hace nada.
  it('desde dos dispositivos a la vez, siembra una sola vez', async () => {
    const results = await Promise.all([
      ensureSeeded(createClient(OWNER), OWNER),
      ensureSeeded(createClient(OWNER), OWNER),
    ]);

    expect(results.sort()).toEqual([false, true]);
    expect(await categoryCount()).toBe(6);
  });

  // TC-27: renombrar "Comida" en el celular y después iniciar sesión en la compu.
  it('no pisa una categoría que el usuario ya renombró', async () => {
    const phone = createClient(OWNER);
    await ensureSeeded(phone, OWNER);
    writerFor(phone).writer.updateCategory('seed_comida', { name: 'Súper' });
    await waitForPendingWrites(phone);

    const computer = createClient(OWNER);
    expect(await ensureSeeded(computer, OWNER)).toBe(false);

    const category = await getDocFromServer(docRef(computer, OWNER, 'categories', 'seed_comida'));
    expect(category.get('name')).toBe('Súper');
  });
});
