// Restaurar con otro nombre (SRS 5.5 y 5.6, ADR 0005): si ya hay una cuenta o categoría
// activa con el mismo nombre, el diálogo lo explica y pide un nombre nuevo.

import { useId, useState } from 'react';
import { errorMessage, type DomainError } from '../../domain/errors';
import type { Result } from '../../domain/result';
import { Sheet } from './Sheet';

interface RenameDialogProps {
  title: string;
  /** Por qué hay que elegir otro nombre (el error de `canRestoreAccount`, etc.). */
  reason: string;
  initialName: string;
  maxLength: number;
  /** Valida el nombre nuevo con el dominio (no vacío, no repetido). */
  validate: (name: string) => Result<string, DomainError>;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export function RenameDialog(props: RenameDialogProps) {
  const { title, reason, initialName, maxLength, validate, onConfirm, onClose } = props;
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<DomainError | null>(null);
  const inputId = useId();

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validate(name);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onConfirm(result.value);
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form className="sheet-form" onSubmit={submit} noValidate>
        <p className="dialog-text">{reason}</p>
        <div className="field">
          <label className="field-label" htmlFor={inputId}>
            Nombre nuevo
          </label>
          <input
            id={inputId}
            className="input"
            type="text"
            value={name}
            maxLength={maxLength}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          {error && <p className="field-error">{errorMessage(error)}</p>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary">
            Restaurar
          </button>
        </div>
      </form>
    </Sheet>
  );
}
