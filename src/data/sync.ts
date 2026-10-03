// Sincronización incremental con dos listeners por colección (ADR 0003 y 0016).
//
//   servidor ──(listener updatedAt > cursor)──► caché local ──(listener source: 'cache')──► store
//
// El listener al servidor solo trae a la caché lo que cambió en otros dispositivos; sus datos no
// se usan. El listener a la caché es gratis y es la única fuente del store: ve al instante las
// escrituras propias, aunque estén pendientes (un listener filtrado por updatedAt no las vería).

import {
  onSnapshot,
  query,
  Timestamp,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Profile } from '../domain/model';
import { docFromSnapshot, profileFromSnapshot } from './converters';
import { syncCursor } from './cursor';
import {
  collectionRef,
  profileRef,
  USER_COLLECTIONS,
  type CollectionDocs,
  type UserCollection,
} from './paths';

export interface SyncStatus {
  /** Hay escrituras que el servidor todavía no confirmó. */
  pendingWrites: boolean;
  /** Todos los listeners al servidor están al día (si es `false`, no hay conexión o está conectando). */
  upToDate: boolean;
}

export interface SyncHandlers {
  /** Todos los documentos de una colección, incluidas las lápidas (el dominio las filtra). */
  onCollection: <K extends UserCollection>(name: K, docs: CollectionDocs[K][]) => void;
  /** El perfil, o `null` si todavía no existe. `fromServer` indica si el dato está confirmado. */
  onProfile: (profile: Profile | null, fromServer: boolean) => void;
  onStatus: (status: SyncStatus) => void;
  onError: (error: unknown) => void;
}

/** Arranca la sincronización del usuario. Devuelve la función que la detiene. */
export function startSync(db: Firestore, uid: string, handlers: SyncHandlers): Unsubscribe {
  const pending = new Map<UserCollection, boolean>();
  const upToDate = new Map<UserCollection, boolean>();
  let profileUpToDate = false;
  const stops: Unsubscribe[] = [];

  function emitStatus(): void {
    handlers.onStatus({
      pendingWrites: [...pending.values()].some(Boolean),
      upToDate: profileUpToDate && USER_COLLECTIONS.every((name) => upToDate.get(name) === true),
    });
  }

  function syncCollection(name: UserCollection): void {
    const ref = collectionRef(db, uid, name);
    const docs = new Map<string, CollectionDocs[UserCollection]>();
    let serverStarted = false;

    // 1. Listener a la caché: no cuesta lecturas y alimenta el store.
    const stopCache = onSnapshot(
      ref,
      { source: 'cache', includeMetadataChanges: true },
      (snapshot) => {
        for (const change of snapshot.docChanges()) {
          // "removed" solo pasa con un borrado físico ("Borrar mi cuenta"); lo normal es una lápida.
          if (change.type === 'removed') docs.delete(change.doc.id);
          else
            docs.set(change.doc.id, docFromSnapshot(change.doc) as CollectionDocs[UserCollection]);
        }
        handlers.onCollection(name, [...docs.values()]);
        pending.set(name, snapshot.metadata.hasPendingWrites);
        emitStatus();

        // 2. Con la primera foto de la caché ya se conoce el cursor: se abre el listener al servidor.
        if (!serverStarted) {
          serverStarted = true;
          const cursor = syncCursor(
            snapshot.docs.map((doc) => {
              const value: unknown = doc.get('updatedAt');
              return !doc.metadata.hasPendingWrites && value instanceof Timestamp ? value : null;
            }),
          );
          const serverQuery = cursor ? query(ref, where('updatedAt', '>', cursor)) : ref;
          stops.push(
            onSnapshot(
              serverQuery,
              { includeMetadataChanges: true },
              (serverSnapshot) => {
                upToDate.set(name, !serverSnapshot.metadata.fromCache);
                emitStatus();
              },
              handlers.onError,
            ),
          );
        }
      },
      handlers.onError,
    );
    stops.push(stopCache);
  }

  for (const name of USER_COLLECTIONS) syncCollection(name);

  // El perfil es un solo documento: se escucha directo (SRS 3.2).
  stops.push(
    onSnapshot(
      profileRef(db, uid),
      { includeMetadataChanges: true },
      (snapshot) => {
        profileUpToDate = !snapshot.metadata.fromCache;
        handlers.onProfile(profileFromSnapshot(snapshot), profileUpToDate);
        emitStatus();
      },
      handlers.onError,
    ),
  );

  return () => {
    for (const stop of stops) stop();
  };
}
