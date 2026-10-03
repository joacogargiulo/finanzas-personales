// Cerrar sesión desde el menú de la cuenta o desde Ajustes.

import { session } from '../session';

/** Cierra la sesión avisando antes si hay cambios sin subir (SRS 7.2, TC-20). */
export async function signOutWithWarning(pendingWrites: boolean): Promise<void> {
  if (
    pendingWrites &&
    !window.confirm(
      'Tenés cambios que todavía no se subieron. Si cerrás sesión ahora, se van a perder. ' +
        '¿Querés cerrar sesión igual?',
    )
  ) {
    return;
  }
  await session.signOut();
  // Después de borrar la caché, Firestore queda inutilizable: se arranca de cero.
  window.location.reload();
}
