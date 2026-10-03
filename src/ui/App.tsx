// Pantalla provisoria de la Fase 2: sirve para probar a mano el login, la sincronización y las
// escrituras. La interfaz real (diseño "Sereno", ADR 0001) llega en la Fase 3.

import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import type { SessionUser } from '../data/auth';
import type { SyncStatus } from '../data/sync';
import { USER_COLLECTIONS } from '../data/paths';
import { validateAccountName } from '../domain/validation';
import { session, store } from './session';

export function App() {
  const state = useStore(store, (s) => s.session);

  if (state.status === 'loading') return <p>Cargando…</p>;
  if (state.status === 'signedOut') return <LoginScreen />;
  return <DebugHome user={state.user} />;
}

function LoginScreen() {
  const [error, setError] = useState<string | null>(null);

  // Si la app vuelve de un login por redirect que falló, se muestra el error (ADR 0017).
  useEffect(() => {
    void session.redirectResult.then((result) => {
      if (!result.ok && result.reason !== 'cancelled') setError(signInMessage(result.reason));
    });
  }, []);

  async function signIn() {
    setError(null);
    const result = await session.signIn();
    if (!result.ok && result.reason !== 'cancelled') setError(signInMessage(result.reason));
  }

  return (
    <main>
      <h1>Control de Finanzas</h1>
      <button type="button" onClick={() => void signIn()}>
        Continuar con Google
      </button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}

function signInMessage(reason: 'offline' | 'unknown'): string {
  return reason === 'offline'
    ? 'Necesitás conexión a internet para iniciar sesión por primera vez.'
    : 'No se pudo iniciar sesión. Probá de nuevo.';
}

function syncLabel(sync: SyncStatus): string {
  if (!sync.upToDate)
    return sync.pendingWrites ? 'Sin conexión (con cambios sin subir)' : 'Sin conexión';
  return sync.pendingWrites ? 'Sincronizando…' : 'Sincronizado';
}

function DebugHome({ user }: { user: SessionUser }) {
  const data = useStore(store);

  function createTestAccount() {
    const writer = session.writer();
    if (!writer) return;
    // Pasa por el dominio igual que la app real: el nombre tiene que ser válido y no repetirse.
    const name = validateAccountName(
      `Cuenta de prueba ${String(data.accounts.length + 1)}`,
      data.accounts,
    );
    if (!name.ok) return;
    // Sin await: la cuenta aparece en la lista por el listener a la caché (ADR 0016).
    writer.createAccount({ name: name.value, currency: 'ARS', initialBalance: 0, kind: 'cash' });
  }

  async function signOut() {
    if (
      data.sync.pendingWrites &&
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

  return (
    <main>
      <h1>Hola, {user.displayName ?? user.email}</h1>
      <p>Estado: {syncLabel(data.sync)}</p>
      {data.writesBlocked && (
        <p role="alert">
          Hay una versión nueva. Actualizá la app para seguir cargando movimientos.
        </p>
      )}

      <h2>Documentos en el dispositivo</h2>
      <ul>
        {USER_COLLECTIONS.map((name) => (
          <li key={name}>
            {name}: {data.loaded[name] ? data[name].length : '…'}
          </li>
        ))}
      </ul>

      <h2>Cuentas</h2>
      <ul>
        {data.accounts
          .filter((account) => account.deletedAt === null)
          .map((account) => (
            <li key={account.id}>{account.name}</li>
          ))}
      </ul>
      <button type="button" onClick={createTestAccount} disabled={data.writesBlocked}>
        Crear cuenta de prueba
      </button>

      {data.writeErrors.length > 0 && (
        <>
          <h2>Escrituras rechazadas</h2>
          <ul>
            {data.writeErrors.map((error, index) => (
              <li key={index}>{error.action}</li>
            ))}
          </ul>
        </>
      )}

      <p>
        <button type="button" onClick={() => void signOut()}>
          Cerrar sesión
        </button>
      </p>
    </main>
  );
}
