// Raíz de la interfaz: según la sesión, muestra la carga, el inicio de sesión o la app.

import { useEffect } from 'react';
import { useStore } from 'zustand';
import { Shell } from './app/Shell';
import { loadTheme } from './app/theme';
import { LoginScreen } from './screens/LoginScreen';
import { store } from './session';

export function App() {
  const state = useStore(store, (s) => s.session);

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
  return <Shell user={state.user} />;
}
