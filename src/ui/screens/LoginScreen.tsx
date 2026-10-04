// Inicio de sesión (SRS 6.1, ADR 0017): popup de Google y, si el navegador lo bloquea, redirect.

import { useEffect, useState } from 'react';
import { session } from '../session';

function signInMessage(reason: 'offline' | 'unknown'): string {
  return reason === 'offline'
    ? 'Necesitás conexión a internet para iniciar sesión por primera vez.'
    : 'No se pudo iniciar sesión. Probá de nuevo.';
}

export function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Si la app vuelve de un login por redirect que falló, se muestra el error (ADR 0017).
  useEffect(() => {
    void session.redirectResult.then((result) => {
      if (!result.ok && result.reason !== 'cancelled') setError(signInMessage(result.reason));
    });
  }, []);

  async function signIn() {
    setError(null);
    if (!navigator.onLine) {
      setError(signInMessage('offline'));
      return;
    }
    setBusy(true);
    const result = await session.signIn();
    setBusy(false);
    if (!result.ok && result.reason !== 'cancelled') setError(signInMessage(result.reason));
  }

  return (
    <main className="login">
      <div className="login-card">
        <span className="login-mark" aria-hidden="true">
          $
        </span>
        <h1 className="login-title">Control de Finanzas</h1>
        <p className="muted">
          Tus cuentas y movimientos, en el celular y en la compu. Funciona también sin conexión.
        </p>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={busy}
          onClick={() => void signIn()}
        >
          Continuar con Google
        </button>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
