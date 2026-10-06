// La cuenta no está en la lista de acceso (ADR 0026): en vez de errores de permisos, un aviso
// claro y la salida para entrar con otra cuenta.

import { useState } from 'react';

interface PrivateScreenProps {
  email: string | null;
  /** Cierra la sesión y recarga la app. */
  onSignOut: () => Promise<void>;
}

export function PrivateScreen({ email, onSignOut }: PrivateScreenProps) {
  const [busy, setBusy] = useState(false);

  return (
    <main className="login">
      <div className="login-card">
        <span className="login-mark" aria-hidden="true">
          $
        </span>
        <h1 className="login-title">Esta app es privada</h1>
        <p className="muted">
          {email ? (
            <>
              La cuenta <strong>{email}</strong> no tiene acceso.
            </>
          ) : (
            'Esta cuenta no tiene acceso.'
          )}{' '}
          Si creés que es un error, pedile acceso a quien te pasó el link.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void onSignOut();
          }}
        >
          Usar otra cuenta
        </button>
      </div>
    </main>
  );
}
