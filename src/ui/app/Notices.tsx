// Avisos generales arriba del contenido: versión nueva de la app (ADR 0011) y escrituras que
// el servidor rechazó.

import { Icon } from '../components/Icon';
import { store } from '../session';
import { useData } from './hooks';

export function Notices() {
  const writesBlocked = useData((s) => s.writesBlocked);
  const writeErrors = useData((s) => s.writeErrors.length);
  if (!writesBlocked && writeErrors === 0) return null;

  return (
    <div className="notices">
      {writesBlocked && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">
            Hay una versión nueva de la app. Actualizala para seguir cargando movimientos.
          </div>
        </div>
      )}
      {writeErrors > 0 && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">
            {writeErrors === 1
              ? 'Un cambio no se pudo guardar en el servidor y se descartó.'
              : `${String(writeErrors)} cambios no se pudieron guardar en el servidor y se descartaron.`}
            <button
              type="button"
              className="btn"
              onClick={() => {
                store.setState({ writeErrors: [] });
              }}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
