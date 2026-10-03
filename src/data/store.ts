// Store de la app (Zustand). Lo escriben los listeners de Firestore y lo leen las pantallas.
// Se usa la versión "vanilla" (sin React): la capa data no conoce React, y la UI lo lee con
// el hook `useStore` de zustand.
// El store guarda solo datos crudos. Saldos, totales y estadísticas se calculan con src/domain/.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Account, Budget, Category, Profile, Recurring, Transaction } from '../domain/model';
import type { SessionUser } from './auth';
import type { UserCollection } from './paths';
import type { SyncStatus } from './sync';
import type { WriteError } from './writes';

export type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

export interface DataState {
  session: SessionState;
  profile: Profile | null;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: Recurring[];
  /** Colecciones que ya recibieron su primera foto de la caché. */
  loaded: Record<UserCollection, boolean>;
  sync: SyncStatus;
  /** Otro dispositivo usa una versión más nueva del esquema: esta app no escribe (ADR 0011). */
  writesBlocked: boolean;
  /** Escrituras que el servidor rechazó. */
  writeErrors: WriteError[];
}

export type DataStore = StoreApi<DataState>;

/** Estado con la sesión dada y sin datos. */
export function emptyState(session: SessionState): DataState {
  return {
    session,
    profile: null,
    accounts: [],
    categories: [],
    transactions: [],
    budgets: [],
    recurring: [],
    loaded: {
      accounts: false,
      categories: false,
      transactions: false,
      budgets: false,
      recurring: false,
    },
    sync: { pendingWrites: false, upToDate: false },
    writesBlocked: false,
    writeErrors: [],
  };
}

export function createDataStore(): DataStore {
  return createStore<DataState>()(() => emptyState({ status: 'loading' }));
}
