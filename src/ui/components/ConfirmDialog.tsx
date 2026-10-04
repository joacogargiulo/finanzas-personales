// Diálogos de confirmación (SRS 6.7):
// - Simple: "¿Eliminar este movimiento?" con Cancelar y el botón de la acción.
// - Reforzado (`requireText`): el botón queda deshabilitado hasta escribir el nombre exacto.
//   Se usa para archivar cuentas y categorías: obliga a leer qué se está archivando.
// - Aviso (sin `onConfirm`): solo explica algo y se cierra con "Entendido".

import { useId, useState, type ReactNode } from 'react';
import { Sheet } from './Sheet';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  /** Sin `onConfirm`, es un aviso con un solo botón. */
  onConfirm?: (() => void) | undefined;
  confirmLabel?: string;
  /** Acción destructiva (eliminar): el botón va en rojo. */
  danger?: boolean;
  /** Confirmación reforzada: el texto que hay que escribir, igual (mayúsculas incluidas). */
  requireText?: string | undefined;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  children,
  onConfirm,
  confirmLabel = 'Confirmar',
  danger = false,
  requireText,
  onClose,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const inputId = useId();
  const ready = requireText === undefined || typed.trim() === requireText;

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="dialog-text">{children}</div>
      {onConfirm && requireText !== undefined && (
        <div className="field">
          <label className="field-label" htmlFor={inputId}>
            Para confirmar, escribí <strong>{requireText}</strong>
          </label>
          <input
            id={inputId}
            className="input"
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
        </div>
      )}
      <div className="dialog-actions">
        {onConfirm ? (
          <>
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="button"
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
              disabled={!ready}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Entendido
          </button>
        )}
      </div>
    </Sheet>
  );
}
