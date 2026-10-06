// "Borrar mi cuenta" en Ajustes (ADR 0006 y 0030). Solo se puede empezar con conexión y sin
// cambios pendientes; el proceso en sí lo hace la sesión y se ve en DeletingAccountScreen.

import { useState } from 'react';
import { canStartDeletion } from '../../domain/accountDeletion';
import { errorMessage } from '../../domain/errors';
import { useData } from '../app/hooks';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { session } from '../session';

/** Lo que hay que escribir para confirmar. */
export const DELETE_CONFIRM_TEXT = 'BORRAR';

export function DeleteAccountSettings() {
  const sync = useData((s) => s.sync);
  const [confirming, setConfirming] = useState(false);
  const check = canStartDeletion(sync);

  return (
    <section className="card" aria-labelledby="delete-account-title">
      <h2 id="delete-account-title" className="card-title">
        Borrar mi cuenta
      </h2>
      <p className="field-hint">
        Borra para siempre todos tus datos de la app, en todos tus dispositivos. No se puede
        deshacer.
      </p>
      <button
        type="button"
        className="btn btn-danger-text"
        disabled={!check.ok}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Borrar mi cuenta
      </button>
      {!check.ok && (
        <p className="field-hint" role="status">
          {errorMessage(check.error)}
        </p>
      )}
      {confirming && (
        <ConfirmDialog
          title="¿Borrar tu cuenta?"
          confirmLabel="Borrar mi cuenta"
          danger
          requireText={DELETE_CONFIRM_TEXT}
          onClose={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void session.deleteAccount();
          }}
        >
          <p>
            Se borran tus cuentas, movimientos, categorías, presupuestos y recurrentes, en todos tus
            dispositivos. <strong>No se puede deshacer.</strong>
          </p>
          <p>
            Si querés guardar una copia, antes descargá el respaldo (JSON) desde la tarjeta
            Respaldo.
          </p>
          <p>
            Puede que Google te pida confirmar tu cuenta. No se borran tu cuenta de Google ni la
            hoja de Google Sheets que hayas exportado, que queda en tu Drive.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
