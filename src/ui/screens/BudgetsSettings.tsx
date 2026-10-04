// Ajustes → Presupuestos (SRS 6.6.3): categoría, moneda y límite. Crear, editar el límite y
// eliminar (lápida). Un presupuesto de una categoría archivada se oculta en Inicio (SRS 5.6).

import { useMemo, useState } from 'react';
import { categoryIcon } from '../../domain/categoryStyle';
import { alive, compareNames } from '../../domain/collections';
import type { Budget, Category } from '../../domain/model';
import { useData, useLedger } from '../app/hooks';
import { openPanel } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { RowMenu } from '../components/RowMenu';
import { categoryTone } from '../categoryTone';
import { session } from '../session';

export function BudgetsSettings() {
  const { categoriesById } = useLedger();
  const budgets = useData((s) => s.budgets);
  const writesBlocked = useData((s) => s.writesBlocked);
  const [deleting, setDeleting] = useState<Budget | null>(null);

  const rows = useMemo(
    () =>
      alive(budgets)
        .map((budget) => ({ budget, category: categoriesById.get(budget.categoryId) }))
        .sort(
          (a, b) =>
            compareNames(a.category?.name ?? '', b.category?.name ?? '') ||
            a.budget.currency.localeCompare(b.budget.currency),
        ),
    [budgets, categoriesById],
  );

  return (
    <section className="card" aria-labelledby="budgets-settings-title">
      <div className="card-header">
        <h2 id="budgets-settings-title" className="card-title">
          Presupuestos
        </h2>
        <button
          type="button"
          className="btn-link"
          disabled={writesBlocked}
          onClick={() => {
            openPanel({ kind: 'budget', id: null });
          }}
        >
          + Añadir presupuesto
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          Poné un límite por mes a una categoría de gasto y seguí en Inicio cuánto llevás gastado.
        </p>
      ) : (
        <ul className="list">
          {rows.map(({ budget, category }) => (
            <li key={budget.id} className="list-row">
              <CategoryBadge category={category} />
              <span className="row-main">
                <span className="row-title">{category?.name ?? 'Categoría desconocida'}</span>
                <span className="row-subtitle">
                  Por mes · {budget.currency}
                  {category && category.archivedAt !== null && (
                    <em className="tag">categoría archivada</em>
                  )}
                </span>
              </span>
              <Money cents={budget.amount} currency={budget.currency} />
              <RowMenu
                label={`Acciones del presupuesto de ${category?.name ?? 'la categoría'}`}
                disabled={writesBlocked}
                items={[
                  {
                    label: 'Editar',
                    onSelect: () => {
                      openPanel({ kind: 'budget', id: budget.id });
                    },
                  },
                  {
                    label: 'Eliminar',
                    danger: true,
                    onSelect: () => {
                      setDeleting(budget);
                    },
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="¿Eliminar este presupuesto?"
          confirmLabel="Eliminar"
          danger
          onConfirm={() => {
            session.writer()?.deleteBudget(deleting.id);
            setDeleting(null);
          }}
          onClose={() => {
            setDeleting(null);
          }}
        >
          Los movimientos no cambian. Podés volver a crearlo cuando quieras.
        </ConfirmDialog>
      )}
    </section>
  );
}

function CategoryBadge({ category }: { category: Category | undefined }) {
  return (
    <span className="badge" style={category ? categoryTone(category.color) : undefined}>
      <Icon name={category ? categoryIcon(category.icon) : 'tag'} />
    </span>
  );
}
