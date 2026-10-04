// Panel de categoría nueva o de edición (SRS 6.7): nombre, tipo, ícono y color.
// El tipo no se puede cambiar si algún movimiento, presupuesto o recurrente la usa (ADR 0009).

import { useState } from 'react';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  categoryColor,
  categoryIcon,
  type CategoryColor,
  type CategoryIcon,
} from '../../domain/categoryStyle';
import { errorMessage, type DomainError } from '../../domain/errors';
import type { Category, CategoryType } from '../../domain/model';
import { CATEGORY_NAME_MAX, validateCategoryName } from '../../domain/validation';
import type { CategoryFields } from '../../data/writes';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';

const ICON_LABELS: Record<CategoryIcon, string> = {
  tag: 'Etiqueta',
  food: 'Comida',
  cart: 'Compras',
  transport: 'Transporte',
  car: 'Auto',
  home: 'Casa',
  bolt: 'Servicios',
  phone: 'Teléfono',
  health: 'Salud',
  education: 'Educación',
  leisure: 'Ocio',
  travel: 'Viajes',
  gift: 'Regalos',
  pet: 'Mascotas',
  clothes: 'Ropa',
  salary: 'Sueldo',
  coins: 'Monedas',
  savings: 'Ahorro',
};

const COLOR_LABELS: Record<CategoryColor, string> = {
  gray: 'Gris',
  red: 'Rojo',
  orange: 'Naranja',
  yellow: 'Amarillo',
  green: 'Verde',
  teal: 'Verde azulado',
  blue: 'Azul',
  purple: 'Violeta',
  pink: 'Rosa',
};

interface CategorySheetProps {
  categories: readonly Category[];
  /** La categoría que se edita; sin ella, se crea una nueva. */
  original?: Category | undefined;
  /** Tipo inicial de una categoría nueva (por ejemplo, el del movimiento que se está cargando). */
  defaultType?: CategoryType;
  /** Si el tipo no se puede cambiar, el motivo. */
  typeLockedReason?: string | null;
  onSave: (fields: CategoryFields) => void;
  onClose: () => void;
  /** Abierta como panel de la dirección (desde Ajustes) y no desde otro panel. */
  routed?: boolean;
}

export function CategorySheet({
  categories,
  original,
  defaultType = 'expense',
  typeLockedReason = null,
  onSave,
  onClose,
  routed = false,
}: CategorySheetProps) {
  const [name, setName] = useState(original?.name ?? '');
  const [type, setType] = useState<CategoryType>(original?.type ?? defaultType);
  const [icon, setIcon] = useState<CategoryIcon>(categoryIcon(original?.icon ?? 'tag'));
  const [color, setColor] = useState<CategoryColor>(categoryColor(original?.color ?? 'teal'));
  const [error, setError] = useState<DomainError | null>(null);

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateCategoryName(name, type, categories, original?.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSave({ name: result.value, type, icon, color });
  }

  return (
    <Sheet
      title={original ? 'Editar categoría' : 'Nueva categoría'}
      onClose={onClose}
      routed={routed}
    >
      <form className="sheet-form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Nombre</span>
          <input
            className="input"
            type="text"
            value={name}
            maxLength={CATEGORY_NAME_MAX}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          {error && <p className="field-error">{errorMessage(error)}</p>}
        </label>

        <div className="field">
          <span className="field-label" id="category-type-label">
            Tipo
          </span>
          <div className="segmented" role="group" aria-labelledby="category-type-label">
            {(['expense', 'income'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`tone-${value}`}
                aria-pressed={type === value}
                disabled={typeLockedReason !== null && type !== value}
                onClick={() => {
                  setType(value);
                  setError(null);
                }}
              >
                {value === 'expense' ? 'Gasto' : 'Ingreso'}
              </button>
            ))}
          </div>
          {typeLockedReason && <p className="field-hint">{typeLockedReason}</p>}
        </div>

        <div className="field">
          <span className="field-label" id="category-icon-label">
            Ícono
          </span>
          <div className="picker-grid" role="group" aria-labelledby="category-icon-label">
            {CATEGORY_ICONS.map((value) => (
              <button
                key={value}
                type="button"
                className="picker-item"
                style={{ '--tone': `var(--cat-${color})` } as React.CSSProperties}
                aria-label={ICON_LABELS[value]}
                aria-pressed={icon === value}
                onClick={() => {
                  setIcon(value);
                }}
              >
                <Icon name={value} />
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label" id="category-color-label">
            Color
          </span>
          <div className="picker-grid" role="group" aria-labelledby="category-color-label">
            {CATEGORY_COLORS.map((value) => (
              <button
                key={value}
                type="button"
                className="picker-item picker-color"
                style={{ '--tone': `var(--cat-${value})` } as React.CSSProperties}
                aria-label={COLOR_LABELS[value]}
                aria-pressed={color === value}
                onClick={() => {
                  setColor(value);
                }}
              />
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-block">
          {original ? 'Guardar cambios' : 'Crear categoría'}
        </button>
      </form>
    </Sheet>
  );
}
