// Firestore → tipos del dominio. El dominio no conoce Firebase: acá los timestamps del servidor
// se convierten a milisegundos (src/domain/model.ts).
// Si algún día hay un cambio de esquema incompatible, la conversión de la forma vieja
// a la nueva va en este archivo (ADR 0011).

import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import type { EpochMs, Profile } from '../domain/model';

/**
 * `updatedAt` de un documento leído con `serverTimestamps: 'estimate'`: si la escritura está
 * pendiente, el SDK devuelve la hora estimada del dispositivo, así la UI puede ordenar igual.
 */
export function timestampToMillis(value: unknown): EpochMs {
  return value instanceof Timestamp ? value.toMillis() : Date.now();
}

/**
 * Un documento de una colección del usuario. Las reglas de Firestore garantizan la forma
 * de los datos (ADR 0010), así que acá no se vuelve a validar: quien llama indica el tipo.
 */
export function docFromSnapshot(
  snapshot: QueryDocumentSnapshot,
): DocumentData & { id: string; updatedAt: EpochMs } {
  const data = snapshot.data({ serverTimestamps: 'estimate' });
  return { ...data, id: snapshot.id, updatedAt: timestampToMillis(data['updatedAt']) };
}

export function profileFromSnapshot(snapshot: DocumentSnapshot): Profile | null {
  const data = snapshot.data({ serverTimestamps: 'estimate' });
  if (!data) return null;
  return { ...data, updatedAt: timestampToMillis(data['updatedAt']) } as Profile;
}
