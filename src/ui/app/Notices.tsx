// Avisos generales arriba del contenido: versión nueva de la app (ADR 0027), otro dispositivo con
// un esquema más nuevo (ADR 0011) y escrituras que el servidor rechazó.

import { Icon } from '../components/Icon';
import { appUpdates, store } from '../session';
import { useData } from './hooks';

export function Notices() {
  const writesBlocked = useData((s) => s.writesBlocked);
  const writeErrors = useData((s) => s.writeErrors.length);
  const updateAvailable = useData((s) => s.updateAvailable);
  if (!writesBlocked && writeErrors === 0 && !updateAvailable) return null;

  const updateButton = (
    <button
      type="button"
      className="btn"
      onClick={() => {
        appUpdates.apply();
      }}
    >
      Actualizar
    </button>
  );

  return (
    <div className="notices">
      {writesBlocked && (
        <div className="notice" role="alert">
          <Icon name="warning" />
          <div className="notice-body">
            Hay una versión nueva de la app. Actualizala para seguir cargando movimientos.
            {updateAvailable && updateButton}
          </div>
        </div>
      )}
      {updateAvailable && !writesBlocked && (
        <div className="notice" role="status">
          <Icon name="repeat" />
          <div className="notice-body">
            Hay una versión nueva de la app.
            {updateButton}
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
