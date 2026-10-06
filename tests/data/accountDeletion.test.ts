import {
  collection,
  getDocFromServer,
  getDocsFromServer,
  waitForPendingWrites,
  type Firestore,
} from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { deletionPlan } from '../../src/domain/accountDeletion';
import { deleteProfile, deleteUserDocs } from '../../src/data/accountDeletion';
import { profileRef, USER_COLLECTIONS, type UserCollection } from '../../src/data/paths';
import { ensureSeeded } from '../../src/data/seed';
import {
  createClient,
  OWNER,
  syncInto,
  until,
  useDataEnv,
  writerFor,
  type SyncedState,
} from './helpers';

// "Borrar mi cuenta" contra el emulador (ADR 0006 y 0030): los borrados físicos pasan las
// reglas, no queda nada en el servidor y, si se corta a mitad, se puede terminar después.

useDataEnv();

/** Crea perfil, categorías iniciales, una cuenta, movimientos (uno eliminado), presupuesto y recurrente. */
async function createUserData(db: Firestore): Promise<void> {
  await ensureSeeded(db, OWNER);
  const { writer, errors } = writerFor(db);
  const accountId = writer.createAccount({
    name: 'Efectivo',
    currency: 'ARS',
    initialBalance: 100_000,
    kind: 'cash',
  });
  const expense = {
    type: 'expense',
    amount: 1_500,
    date: '2026-10-03',
    description: 'Café',
    accountId,
    categoryId: 'seed_comida',
  } as const;
  for (let i = 0; i < 4; i++) writer.createTransaction(expense);
  // Las lápidas también se borran: son documentos que siguen en Firestore.
  writer.deleteTransaction(writer.createTransaction(expense));
  writer.saveBudget({ categoryId: 'seed_comida', currency: 'ARS', amount: 50_000 }, undefined);
  writer.createRecurring({
    type: 'expense',
    amount: 9_000,
    accountId,
    categoryId: 'seed_comida',
    description: 'Gimnasio',
    frequency: 'monthly',
    startDate: '2026-10-01',
    endDate: null,
  });
  await waitForPendingWrites(db);
  expect(errors).toEqual([]);
}

/** Los IDs de cada colección que tiene la caché, como los toma la sesión del store. */
function idsInCache(state: SyncedState): Record<UserCollection, string[]> {
  return Object.fromEntries(
    USER_COLLECTIONS.map((name) => [name, (state.collections[name] ?? []).map((d) => d.id)]),
  ) as Record<UserCollection, string[]>;
}

/** Cuántos documentos quedan en el servidor, mirando desde otro dispositivo. */
async function countOnServer(): Promise<number> {
  const db = createClient(OWNER);
  let count = (await getDocFromServer(profileRef(db, OWNER))).exists() ? 1 : 0;
  for (const name of USER_COLLECTIONS) {
    count += (await getDocsFromServer(collection(db, 'users', OWNER, name))).size;
  }
  return count;
}

describe('borrar los datos de la cuenta', () => {
  // 6 categorías + 1 cuenta + 5 movimientos + 1 presupuesto + 1 recurrente = 14, más el perfil.
  it('borra todos los documentos en varios lotes y después el perfil', async () => {
    const db = createClient(OWNER);
    await createUserData(db);
    const { state, stop } = syncInto(db);
    await until(() => state.status.upToDate, 'la sincronización');
    expect(await countOnServer()).toBe(15);

    // Lotes de 4 en vez de 500, para probar varios lotes con pocos documentos.
    const plan = deletionPlan(idsInCache(state), 4);
    expect(plan.total).toBe(14);
    const progress: number[] = [];
    await deleteUserDocs(db, OWNER, plan.batches, (done) => progress.push(done));
    stop();
    await deleteProfile(db, OWNER);

    expect(progress).toEqual([4, 8, 12, 14]);
    expect(await countOnServer()).toBe(0);
  });

  // Si se corta después de algunos lotes, la caché ya no tiene lo borrado ("removed" en el
  // listener): el plan nuevo sale solo con lo que falta.
  it('se puede retomar si se cortó a mitad', async () => {
    const db = createClient(OWNER);
    await createUserData(db);
    const { state, stop } = syncInto(db);
    await until(() => state.status.upToDate, 'la sincronización');

    const first = deletionPlan(idsInCache(state), 5);
    await deleteUserDocs(db, OWNER, first.batches.slice(0, 1), () => undefined);
    await until(() => deletionPlan(idsInCache(state)).total === 9, 'que la caché vea los borrados');
    expect(await countOnServer()).toBe(10);

    const rest = deletionPlan(idsInCache(state), 5);
    await deleteUserDocs(db, OWNER, rest.batches, () => undefined);
    stop();
    await deleteProfile(db, OWNER);

    expect(await countOnServer()).toBe(0);
  });

  // Solo se borra lo del usuario: los datos de otra persona no se tocan.
  it('no toca los datos de otro usuario', async () => {
    const other = createClient('beto');
    await ensureSeeded(other, 'beto');

    const db = createClient(OWNER);
    await createUserData(db);
    const { state, stop } = syncInto(db);
    await until(() => state.status.upToDate, 'la sincronización');
    await deleteUserDocs(db, OWNER, deletionPlan(idsInCache(state)).batches, () => undefined);
    stop();
    await deleteProfile(db, OWNER);

    const beto = createClient('beto');
    expect((await getDocFromServer(profileRef(beto, 'beto'))).exists()).toBe(true);
    expect((await getDocsFromServer(collection(beto, 'users', 'beto', 'categories'))).size).toBe(6);
  });
});
