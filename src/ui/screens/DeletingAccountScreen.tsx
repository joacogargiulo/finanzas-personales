// Pantalla de "Borrar mi cuenta" mientras corre (ADR 0030). Reemplaza a toda la app: cuando
// Firebase borra el usuario la sesión se cierra, y esta pantalla tiene que seguir a la vista.

import { deletionFailureMessage } from '../../domain/accountDeletion';
import type { AccountDeletionState } from '../../data/store';

const count = new Intl.NumberFormat('es-AR');

interface DeletingAccountScreenProps {
  state: AccountDeletionState;
  /** Recarga la app: después de borrar (o de un error a mitad), se arranca de cero. */
  onReload: () => void;
}

export function DeletingAccountScreen({ state, onReload }: DeletingAccountScreenProps) {
  return (
    <main className="login">
      <div className="login-card">{content(state, onReload)}</div>
    </main>
  );
}

function content(state: AccountDeletionState, onReload: () => void) {
  switch (state.phase) {
    case 'reauth':
      return (
        <>
          <h1 className="login-title">Confirmá que sos vos</h1>
          <p className="muted" role="status">
            Elegí tu cuenta en la ventana de Google para empezar a borrar.
          </p>
        </>
      );

    case 'deleting':
      return (
        <>
          <h1 className="login-title">Borrando tu cuenta…</h1>
          <progress
            className="deletion-progress"
            value={state.done}
            max={Math.max(state.total, 1)}
            aria-label="Progreso del borrado"
          />
          <p className="muted" role="status">
            {count.format(state.done)} de {count.format(state.total)} datos borrados
          </p>
          <p className="field-hint">
            No cierres la app. Si se corta la conexión, sigue sola cuando vuelva.
          </p>
        </>
      );

    case 'done':
      return (
        <>
          <h1 className="login-title">Tu cuenta se borró</h1>
          <p className="muted">
            Ya no quedan datos tuyos en la app. Si volvés a entrar con Google, empezás de cero.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={onReload}>
            Listo
          </button>
        </>
      );

    case 'error':
      return (
        <>
          <h1 className="login-title">No se terminó de borrar</h1>
          <p className="muted" role="alert">
            {deletionFailureMessage(state.failure)}
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={onReload}>
            Volver a la app
          </button>
        </>
      );
  }
}
