import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  memoryLocalCache,
  memoryLruGarbageCollector,
  type Firestore,
} from 'firebase/firestore';
import { afterEach, beforeEach } from 'vitest';
import type { Profile } from '../../src/domain/model';
import type { CollectionDocs, UserCollection } from '../../src/data/paths';
import { startSync, type SyncStatus } from '../../src/data/sync';
import { createWriter, type Writer, type WriteError } from '../../src/data/writes';

// Utilidades de los tests de la capa data. Cada "cliente" es una instancia independiente de
// Firestore, como si fuera otro dispositivo, conectada al emulador con la sesión de un usuario.
// El emulador aplica las reglas reales de firestore.rules.

export const PROJECT_ID = 'demo-finanzas';
export const OWNER = 'ana';
const EMULATOR = '127.0.0.1';
const PORT = 8080;
const EMULATOR_URL = `http://${EMULATOR}:${String(PORT)}`;

let counter = 0;
let apps: FirebaseApp[] = [];

/** Un dispositivo nuevo, sin nada en la caché. */
export function createClient(uid: string): Firestore {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: 'demo-key' },
    `cliente-${String(++counter)}`,
  );
  apps.push(app);
  // En Node no hay IndexedDB: la caché vive en memoria. El recolector LRU la conserva aunque
  // no haya listeners activos, como hace la caché persistente de la app (ADR 0003).
  const db = initializeFirestore(app, {
    localCache: memoryLocalCache({
      garbageCollector: memoryLruGarbageCollector({ cacheSizeBytes: 100 * 1024 * 1024 }),
    }),
  });
  connectFirestoreEmulator(db, EMULATOR, PORT, { mockUserToken: { sub: uid, user_id: uid } });
  return db;
}

/** Vacía el emulador antes de cada test y cierra los clientes después. */
export function useDataEnv(): void {
  beforeEach(async () => {
    const url = `${EMULATOR_URL}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    await fetch(url, { method: 'DELETE' });
  });
  afterEach(async () => {
    await Promise.all(apps.map((app) => deleteApp(app)));
    apps = [];
  });
}

/** Espera hasta que `check` se cumpla (los listeners son asincrónicos). */
export async function until(check: () => boolean, what: string, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timeout esperando: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Lo que recibe la app desde la sincronización: un "store" mínimo para los tests. */
export interface SyncedState {
  collections: { [K in UserCollection]?: CollectionDocs[K][] };
  profile: Profile | null;
  profileFromServer: boolean;
  status: SyncStatus;
  errors: unknown[];
}

export function syncInto(db: Firestore, uid: string = OWNER) {
  const state: SyncedState = {
    collections: {},
    profile: null,
    profileFromServer: false,
    status: { pendingWrites: false, upToDate: false },
    errors: [],
  };
  const stop = startSync(db, uid, {
    onCollection: (name, docs) => {
      state.collections[name] = docs as never;
    },
    onProfile: (profile, fromServer) => {
      state.profile = profile;
      state.profileFromServer = fromServer;
    },
    onStatus: (status) => {
      state.status = status;
    },
    onError: (error) => state.errors.push(error),
  });
  return { state, stop };
}

/** Escrituras del usuario, guardando los errores que reporta el servidor. */
export function writerFor(db: Firestore, uid: string = OWNER) {
  const errors: WriteError[] = [];
  const writer: Writer = createWriter(db, uid, {
    canWrite: () => true,
    onError: (error) => errors.push(error),
  });
  return { writer, errors };
}
