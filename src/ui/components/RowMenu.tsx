// Menú de acciones de una fila ("⋯"): Editar, Archivar, Eliminar… Es un botón con
// `aria-haspopup` que abre una lista de botones (`role="menu"`), y se cierra con Escape o
// tocando afuera.

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface RowMenuProps {
  /** Nombre accesible del botón, por ejemplo "Acciones de Efectivo". */
  label: string;
  items: RowMenuItem[];
  disabled?: boolean;
}

export function RowMenu({ label, items, disabled = false }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        <Icon name="more" size={22} />
      </button>
      {open && (
        <div className="menu row-menu" role="menu" aria-label={label}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={`menu-item${item.danger ? ' menu-item--danger' : ''}`}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
