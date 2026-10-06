// Store de la app (Zustand). Lo escriben los listeners de Firestore y lo leen las pantallas.
// Se usa la versión "vanilla" (sin React): la capa data no conoce React, y la UI lo lee con
// el hook `useStore` de zustand.
// El store guarda solo datos crudos. Saldos, totales y estadísticas se calculan con src/domain/.

import { createStore, type StoreApi } from 'zustand/vanilla';
import type {
  Account,
  Budget,
  Category,
  ExchangeRates,
  Profile,
  Recurring,
  Transaction,
} from '../domain/model';
import type { SessionUser } from './auth';
import type { UserCollection } from './paths';
import type { SyncStatus } from './sync';
import type { WriteError } from './writes';

export type SessionState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: SessionUser };

/** Lo que depende del usuario: se vacía al iniciar o cerrar sesión. */
export interface UserState {
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
  /** La cuenta no está en la lista de acceso: la app es privada (ADR 0026). */
  accessDenied: boolean;
}

export interface DataState extends UserState {
  /** Cotizaciones del dispositivo (SRS 4.8): no dependen del usuario y sobreviven al cambio de sesión. */
  rates: ExchangeRates | null;
}

export type DataStore = StoreApi<DataState>;

/** Estado con la sesión dada y sin datos. No toca las cotizaciones. */
export function emptyState(session: SessionState): UserState {
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
    accessDenied: false,
  };
}

export function createDataStore(): DataStore {
  return createStore<DataState>()(() => ({ ...emptyState({ status: 'loading' }), rates: null }));
}
