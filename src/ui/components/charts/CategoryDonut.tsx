// Gráficos 2 y 3 de Estadísticas (SRS 6.5, ADR 0021): una dona con el total en el centro y,
// debajo, la lista de categorías con ícono, monto y porcentaje. La lista dice todo lo que dice
// la dona, así el color nunca es la única forma de entenderla.

import { categoryIcon } from '../../../domain/categoryStyle';
import type { Category, Currency } from '../../../domain/model';
import { groupSmallCategories, OTHER_CATEGORY_ID, type CategoryTotal } from '../../../domain/stats';
import { donutSegments } from '../../charts';
import { categoryTone } from '../../categoryTone';
import { percentLabel } from '../../format';
import { Icon } from '../Icon';
import { Money } from '../Money';

const RADIUS = 72;
const THICKNESS = 20;

interface CategoryDonutProps {
  title: string;
  totals: readonly CategoryTotal[];
  total: number;
  currency: Currency;
  categories: ReadonlyMap<string, Category>;
  /** Signo de los montos: gastos con "−", ingresos con "+". */
  kind: 'income' | 'expense';
}

interface Slice extends CategoryTotal {
  name: string;
  category: Category | undefined;
}

export function CategoryDonut({
  title,
  totals,
  total,
  currency,
  categories,
  kind,
}: CategoryDonutProps) {
  const slices: Slice[] = groupSmallCategories(totals).map((t) => {
    const category = categories.get(t.categoryId);
    const name = t.categoryId === OTHER_CATEGORY_ID ? 'Otras' : (category?.name ?? 'Sin categoría');
    return { ...t, name, category };
  });
  const segments = donutSegments(
    slices.map((s) => s.share),
    { radius: RADIUS, thickness: THICKNESS },
  );
  const signed = kind === 'expense' ? -total : total;

  return (
    <div className="donut-chart">
      <div className="donut">
        <svg
          width={RADIUS * 2}
          height={RADIUS * 2}
          viewBox={`0 0 ${String(RADIUS * 2)} ${String(RADIUS * 2)}`}
          aria-hidden="true"
          focusable="false"
        >
          {segments.map((segment, i) => {
            const slice = slices[i];
            if (!slice || segment.d === '') return null;
            return (
              <path
                key={slice.categoryId}
                className={slice.category ? 'donut-segment' : 'donut-segment donut-segment--other'}
                style={slice.category ? categoryTone(slice.category.color) : undefined}
                d={segment.d}
              />
            );
          })}
        </svg>
        <div className="donut-center">
          <span className="small muted">{title}</span>
          <Money
            cents={signed}
            currency={currency}
            sign={kind === 'income' ? 'always' : 'auto'}
            className="donut-total"
          />
        </div>
      </div>

      <ul className="list donut-legend" aria-label={`${title} por categoría`}>
        {slices.map((slice) => (
          <li key={slice.categoryId} className="list-row">
            <span
              className={slice.category ? 'badge' : 'badge badge--other'}
              style={slice.category ? categoryTone(slice.category.color) : undefined}
            >
              <Icon name={categoryIcon(slice.category?.icon ?? 'tag')} size={18} />
            </span>
            <span className="row-main">
              <span className="row-title">
                {slice.name}
                {slice.category && slice.category.archivedAt !== null && (
                  <>
                    {' '}
                    <em className="tag">archivada</em>
                  </>
                )}
              </span>
              <span className="row-subtitle">{percentLabel(slice.share)}</span>
            </span>
            <Money
              cents={kind === 'expense' ? -slice.total : slice.total}
              currency={currency}
              sign={kind === 'income' ? 'always' : 'auto'}
              className="row-end"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
