// Sesión: conecta Auth, la sincronización, la siembra y las escrituras con el store.
//
// Al iniciar sesión: arranca la sincronización (ADR 0016). Cuando el servidor confirma que el
// perfil no existe o no está sembrado, siembra las categorías (ADR 0004). Si el perfil tiene un
// schemaVersion mayor que el de esta app, bloquea las escrituras (ADR 0011). Si el servidor
// rechaza las lecturas, la cuenta no está en la lista de acceso: se detiene todo (ADR 0026).
// "Borrar mi cuenta" también se orquesta acá, porque necesita detener la sincronización (ADR 0030).

import type { Unsubscribe } from 'firebase/firestore';
import { canStartDeletion, deletionPlan } from '../domain/accountDeletion';
import { SCHEMA_VERSION } from '../domain/model';
import {
  deleteUserDocs,
  deleteProfile,
  deletionFailure,
  isCancelledByUser,
} from './accountDeletion';
import {
  checkRedirectResult,
  clearLocalCache,
  deleteCurrentUser,
  ensureRecentLogin,
  signInWithGoogle,
  signOutAndClear,
  watchUser,
  type SignInResult,
} from './auth';
import type { FirebaseServices } from './firebase';
import { USER_COLLECTIONS, type UserCollection } from './paths';
import { clearPreferences } from './preferences';
import { ensureSeeded } from './seed';
import type { DataState, DataStore } from './store';
import { emptyState } from './store';
import { isPermissionDenied, startSync } from './sync';
import { createWriter, type Writer } from './writes';

export interface Session {
  signIn: () => Promise<SignInResult>;
  /** Resultado de un login por redirect (ADR 0017), para mostrar un error si falló. */
  redirectResult: Promise<SignInResult>;
  /** Cierra la sesión y borra la caché local. Después hay que recargar la app. */
  signOut: () => Promise<void>;
  /** Las escrituras del usuario actual, o `null` si no hay sesión. */
  writer: () => Writer | null;
  /**
   * Borra todos los datos del usuario, su usuario de Auth y la caché local (ADR 0006 y 0030).
   * El progreso se ve en `accountDeletion` del store. Después hay que recargar la app.
   */
  deleteAccount: () => Promise<void>;
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
        if (isPermissionDenied(error)) {
          // Cada listener avisa por su lado: alcanza con el primero. `currentUid` se conserva,
          // así la renovación del token no vuelve a arrancar la sincronización.
          if (currentUid === user.uid && stopSync) {
            stopSync();
            stopSync = null;
            writer = null;
            store.setState({ accessDenied: true });
          }
          return;
        }
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
    deleteAccount: async () => {
      const uid = currentUid;
      const state = store.getState();
      if (!uid || state.accountDeletion || !canStartDeletion(state.sync).ok) return;
      const setDeletion = (accountDeletion: DataState['accountDeletion']) => {
        store.setState({ accountDeletion });
      };

      setDeletion({ phase: 'reauth' });
      try {
        // Antes de borrar nada: si se pidiera a mitad, podrían quedar los datos a medias.
        if ((await ensureRecentLogin(auth)) === 'redirecting') return;

        // Los IDs salen del store, que tiene todo lo de la caché, lápidas incluidas: sin lecturas.
        const current = store.getState();
        const ids = Object.fromEntries(
          USER_COLLECTIONS.map((name) => [name, current[name].map((d) => d.id)]),
        ) as Record<UserCollection, string[]>;
        const plan = deletionPlan(ids);
        setDeletion({ phase: 'deleting', done: 0, total: plan.total });
        await deleteUserDocs(db, uid, plan.batches, (done) => {
          setDeletion({ phase: 'deleting', done, total: plan.total });
        });

        // Se detiene la sincronización antes de borrar el perfil: si no, al ver que el perfil ya
        // no existe, la sesión volvería a sembrar las categorías iniciales.
        stopSync?.();
        stopSync = null;
        writer = null;
        await deleteProfile(db, uid);
        // Firebase cierra la sesión: `watchUser` deja el store en `signedOut`.
        await deleteCurrentUser(auth);
      } catch (error) {
        if (isCancelledByUser(error)) {
          setDeletion(null);
          return;
        }
        console.error('No se pudo borrar la cuenta', error);
        setDeletion({ phase: 'error', failure: deletionFailure(error) });
        return;
      }

      clearPreferences(uid);
      try {
        await clearLocalCache(db);
      } catch (error) {
        // Pasa si la app está abierta en otra pestaña. La cuenta ya se borró del servidor, así
        // que no se muestra como error; la copia local se borra en el próximo cierre de sesión.
        console.error('No se pudo borrar la caché local', error);
      }
      setDeletion({ phase: 'done' });
    },
  };
}
