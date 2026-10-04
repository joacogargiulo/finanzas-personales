// Cerrar sesión desde el menú de la cuenta o desde Ajustes.

import { session } from '../session';

/** Cierra la sesión y borra la caché local (SRS 7.2). Quien llama avisa antes si hay cambios sin subir. */
export async function signOut(): Promise<void> {
  await session.signOut();
  // Después de borrar la caché, Firestore queda inutilizable: se arranca de cero.
  window.location.reload();
}
