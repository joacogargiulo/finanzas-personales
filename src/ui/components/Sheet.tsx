// Panel que sube desde abajo (en la compu, un diálogo centrado). Usa el elemento <dialog> del
// navegador con `showModal()`, que ya resuelve lo difícil de la accesibilidad: atrapa el foco
// adentro, deja inerte el resto de la página y lo anuncia como diálogo a los lectores de pantalla.
// Escape, tocar afuera o la X llaman a `onClose`; quien lo usa decide qué hacer (ADR 0018).
// El botón Atrás también: los paneles con dirección propia (`routed`) ya lo resuelven con la
// ruta, y el resto de las hojas (Filtros, confirmaciones) se abren como una capa (`useLayer`).

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useLayer } from '../app/navigation';
import { Icon } from './Icon';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Teclas que el panel maneja por su cuenta (por ejemplo, el teclado numérico en la compu). */
  onKeyDown?: (event: React.KeyboardEvent<HTMLDialogElement>) => void;
  /** Es el panel de la dirección (`?movimiento=…`): Atrás ya lo cierra la ruta. */
  routed?: boolean | undefined;
}

export function Sheet({ title, onClose, children, onKeyDown, routed = false }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useLayer(onClose, !routed);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape: el navegador cerraría el diálogo solo; lo cerramos nosotros para que la
        // dirección (el hash) quede sincronizada.
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Un clic en el fondo oscuro llega al <dialog> mismo, no a su contenido.
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 id={titleId} className="sheet-title">
            {title}
          </h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
