// Ajustes (SRS 6.6). En la 3a: apariencia y cuenta de Google. Cuentas y categorías llegan en
// la 3b; presupuestos y recurrentes en la Fase 5; respaldo en la Fase 6.

import type { SessionUser } from '../../data/auth';
import { THEMES, type Theme } from '../../data/preferences';
import { useData } from '../app/hooks';
import { signOutWithWarning } from '../app/signOut';
import { setTheme, useTheme } from '../app/theme';

const THEME_LABELS: Record<Theme, string> = {
  auto: 'Automático',
  light: 'Claro',
  dark: 'Oscuro',
};

export function SettingsScreen({ user }: { user: SessionUser }) {
  const theme = useTheme();
  const pendingWrites = useData((s) => s.sync.pendingWrites);

  return (
    <>
      <section className="card" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="card-title">
          Apariencia
        </h2>
        <div className="segmented" role="group" aria-label="Tema">
          {THEMES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(user.uid, value);
              }}
            >
              {THEME_LABELS[value]}
            </button>
          ))}
        </div>
        <p className="field-hint">
          Automático sigue la configuración del dispositivo. Se guarda solo en este dispositivo.
        </p>
      </section>

      <section className="card" aria-labelledby="google-title">
        <h2 id="google-title" className="card-title">
          Cuenta de Google
        </h2>
        <div>
          <p className="menu-name">{user.displayName ?? 'Sin nombre'}</p>
          <p className="menu-email">{user.email}</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void signOutWithWarning(pendingWrites)}
        >
          Cerrar sesión
        </button>
      </section>
    </>
  );
}
