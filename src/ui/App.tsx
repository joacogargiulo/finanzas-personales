// Raíz de la interfaz: según la sesión, muestra la carga, el inicio de sesión, el aviso de app
// privada (ADR 0026) o la app.

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Shell } from './app/Shell';
import { signOut } from './app/signOut';
import { loadTheme } from './app/theme';
import { LoginScreen } from './screens/LoginScreen';
import { PrivateScreen } from './screens/PrivateScreen';
import { store } from './session';

export function App() {
  const state = useStore(store, (s) => s.session);
  const accessDenied = useStore(store, (s) => s.accessDenied);

  // Sin sesión, el tema sigue al sistema.
  const signedOut = state.status !== 'signedIn';
  useEffect(() => {
    if (signedOut) loadTheme(null);
  }, [signedOut]);

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
