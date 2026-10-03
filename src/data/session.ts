// Sesión: conecta Auth, la sincronización, la siembra y las escrituras con el store.
//
// Al iniciar sesión: arranca la sincronización (ADR 0016). Cuando el servidor confirma que el
// perfil no existe o no está sembrado, siembra las categorías (ADR 0004). Si el perfil tiene un
// schemaVersion mayor que el de esta app, bloquea las escrituras (ADR 0011).

import type { Unsubscribe } from 'firebase/firestore';
import { SCHEMA_VERSION } from '../domain/model';
import {
  checkRedirectResult,
  signInWithGoogle,
  signOutAndClear,
  watchUser,
  type SignInResult,
} from './auth';
import type { FirebaseServices } from './firebase';
import { ensureSeeded } from './seed';
import type { DataStore } from './store';
import { emptyState } from './store';
import { startSync } from './sync';
import { createWriter, type Writer } from './writes';

export interface Session {
  signIn: () => Promise<SignInResult>;
  /** Resultado de un login por redirect (ADR 0017), para mostrar un error si falló. */
  redirectResult: Promise<SignInResult>;
  /** Cierra la sesión y borra la caché local. Después hay que recargar la app. */
  signOut: () => Promise<void>;
  /** Las escrituras del usuario actual, o `null` si no hay sesión. */
  writer: () => Writer | null;
}

export function startSession({ auth, db }: FirebaseServices, store: DataStore): Session {
  let stopSync: Unsubscribe | null = null;
  let writer: Writer | null = null;
  let currentUid: string | null = null;
  let seeding = false;

  function stop(): void {
    stopSync?.();
    stopSync = null;
    writer = null;
    currentUid = null;
    seeding = false;
  }

  function seedIfNeeded(uid: string): void {
    if (seeding) return;
    seeding = true;
    // Si falla (por ejemplo, se cortó la conexión), se reintenta en la próxima apertura.
    ensureSeeded(db, uid).catch((error: unknown) => {
      console.error('No se pudieron crear las categorías iniciales', error);
      seeding = false;
    });
  }

  watchUser(auth, (user) => {
    // Firebase avisa también cuando se renueva el token: si es el mismo usuario, no hay nada que hacer.
    if (user && user.uid === currentUid) return;
    stop();
    if (!user) {
      store.setState(emptyState({ status: 'signedOut' }));
      return;
    }

    currentUid = user.uid;
    store.setState(emptyState({ status: 'signedIn', user }));
    writer = createWriter(db, user.uid, {
      canWrite: () => !store.getState().writesBlocked,
      onError: (error) => {
        console.error('El servidor rechazó una escritura', error);
        store.setState((state) => ({ writeErrors: [...state.writeErrors, error] }));
      },
    });
    stopSync = startSync(db, user.uid, {
      onCollection: (name, docs) => {
        store.setState((state) => ({ [name]: docs, loaded: { ...state.loaded, [name]: true } }));
      },
      onProfile: (profile, fromServer) => {
        store.setState({
          profile,
          writesBlocked: profile !== null && profile.schemaVersion > SCHEMA_VERSION,
        });
        if (fromServer && (profile === null || profile.seededAt === null)) seedIfNeeded(user.uid);
      },
      onStatus: (sync) => {
        store.setState({ sync });
      },
      onError: (error) => {
        console.error('Error en la sincronización', error);
      },
    });
  });

  return {
    signIn: () => signInWithGoogle(auth),
    redirectResult: checkRedirectResult(auth),
    signOut: async () => {
      stop();
      await signOutAndClear(auth, db);
    },
    writer: () => writer,
  };
}
