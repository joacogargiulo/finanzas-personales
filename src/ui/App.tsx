// Raíz de la interfaz: según la sesión, muestra la carga, el inicio de sesión, el aviso de app
// privada (ADR 0026) o la app. Mientras se borra la cuenta, solo esa pantalla (ADR 0030).

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Shell } from './app/Shell';
import { signOut } from './app/signOut';
import { loadTheme } from './app/theme';
import { DeletingAccountScreen } from './screens/DeletingAccountScreen';
import { LoginScreen } from './screens/LoginScreen';
import { PrivateScreen } from './screens/PrivateScreen';
import { store } from './session';

export function App() {
  const state = useStore(store, (s) => s.session);
  const accessDenied = useStore(store, (s) => s.accessDenied);
  const accountDeletion = useStore(store, (s) => s.accountDeletion);

  // Sin sesión, el tema sigue al sistema.
  const signedOut = state.status !== 'signedIn';
  useEffect(() => {
    if (signedOut) loadTheme(null);
  }, [signedOut]);

  if (accountDeletion) {
    return (
      <DeletingAccountScreen
        state={accountDeletion}
        onReload={() => {
          window.location.reload();
        }}
      />
    );
  }
  if (state.status === 'loading') {
    return (
      <p className="loading" role="status">
        Cargando…
      </p>
    );
  }
  if (state.status === 'signedOut') return <LoginScreen />;
  if (accessDenied) return <PrivateScreen email={state.user.email} onSignOut={signOut} />;
  return <Shell user={state.user} />;
}
