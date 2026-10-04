// Categorías como botones (diseño "Sereno"): el panel de movimiento y el de recurrente eligen la
// categoría así. El botón presionado (`aria-pressed`) es la categoría elegida.

import { categoryIcon } from '../../domain/categoryStyle';
import type { Category } from '../../domain/model';
import { categoryTone } from '../categoryTone';
import { Icon } from './Icon';

interface CategoryChipsProps {
  categories: readonly Category[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** ID del texto que nombra el grupo ("Categoría"). */
  labelledBy: string;
  /** Si se pasa, agrega el chip "+ Nueva". */
  onCreate?: (() => void) | undefined;
}

export function CategoryChips({
  categories,
  selectedId,
  onSelect,
  labelledBy,
  onCreate,
}: CategoryChipsProps) {
  return (
    <div className="chips" role="group" aria-labelledby={labelledBy}>
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className="chip"
          style={categoryTone(category.color)}
          aria-pressed={selectedId === category.id}
          onClick={() => {
            onSelect(category.id);
          }}
        >
          <Icon name={categoryIcon(category.icon)} size={16} />
          {category.name}
          {category.archivedAt !== null && <em className="tag">archivada</em>}
        </button>
      ))}
      {onCreate && (
        <button type="button" className="chip" onClick={onCreate}>
          + Nueva
        </button>
      )}
    </div>
  );
}
