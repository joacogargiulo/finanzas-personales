// Botón "Cerrar sesión". Si hay cambios que todavía no se subieron, avisa antes: se perderían
// al borrar la caché (SRS 7.2, TC-20).

import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useData } from './hooks';
import { signOut } from './signOut';

export function SignOutButton() {
  const pendingWrites = useData((s) => s.sync.pendingWrites);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          if (pendingWrites) setConfirming(true);
          else void signOut();
        }}
      >
        Cerrar sesión
      </button>
      {confirming && (
        <ConfirmDialog
          title="¿Cerrar sesión?"
          confirmLabel="Cerrar sesión igual"
          danger
          onConfirm={() => void signOut()}
          onClose={() => {
            setConfirming(false);
          }}
        >
          Tenés cambios que todavía no se subieron. Si cerrás sesión ahora, se van a perder.
        </ConfirmDialog>
      )}
    </>
  );
}
