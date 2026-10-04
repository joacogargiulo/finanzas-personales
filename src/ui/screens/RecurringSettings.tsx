// Ajustes → Movimientos recurrentes (SRS 6.6.4): descripción, monto, frecuencia y próxima fecha.
// Crear, editar y eliminar (lápida, ADR 0005). Los movimientos que ya generó quedan intactos.

import { useMemo, useState } from 'react';
import { alive, compareNames } from '../../domain/collections';
import { formatDisplayDate } from '../../domain/dates';
import type { Account, Category, Recurring } from '../../domain/model';
import { isFinished } from '../../domain/recurring';
import { useData, useLedger } from '../app/hooks';
import { openPanel } from '../app/navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { RowMenu } from '../components/RowMenu';
import { FREQUENCY_LABELS, TRANSACTION_TYPE_LABELS } from '../format';
import { session } from '../session';

/** Cómo se llama un recurrente en la lista: su descripción, o la categoría si no tiene. */
function recurringTitle(recurring: Recurring, categories: ReadonlyMap<string, Category>): string {
  const description = recurring.description.trim();
  if (description) return description;
  if (recurring.type === 'transfer') return TRANSACTION_TYPE_LABELS.transfer;
  return categories.get(recurring.categoryId)?.name ?? 'Categoría desconocida';
}

export function RecurringSettings() {
  const { accountsById, categoriesById } = useLedger();
  const recurring = useData((s) => s.recurring);
  const writesBlocked = useData((s) => s.writesBlocked);
  const [deleting, setDeleting] = useState<Recurring | null>(null);

  const rows = useMemo(
    () =>
      alive(recurring)
        .map((r) => ({ recurring: r, title: recurringTitle(r, categoriesById) }))
        // Los activos primero, por próxima fecha; los finalizados al final.
        .sort(
          (a, b) =>
            Number(isFinished(a.recurring)) - Number(isFinished(b.recurring)) ||
            a.recurring.nextDate.localeCompare(b.recurring.nextDate) ||
            compareNames(a.title, b.title),
        ),
    [recurring, categoriesById],
  );

  return (
    <section className="card" aria-labelledby="recurring-settings-title">
      <div className="card-header">
        <h2 id="recurring-settings-title" className="card-title">
          Recurrentes
        </h2>
        <button
          type="button"
          className="btn-link"
          disabled={writesBlocked}
          onClick={() => {
            openPanel({ kind: 'recurring', id: null });
          }}
        >
          + Añadir recurrente
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty">
          El alquiler, el sueldo, las suscripciones: cargalos una vez y la app te los recuerda en
          Inicio para que los confirmes.
        </p>
      ) : (
        <ul className="list">
          {rows.map(({ recurring: r, title }) => (
            <li key={r.id} className="list-row">
              <span className={`badge tone-${r.type}`}>
                <Icon name="repeat" />
              </span>
              <span className="row-main">
                <span className="row-title">{title}</span>
                <span className="row-subtitle">
                  {FREQUENCY_LABELS[r.frequency]} ·{' '}
                  {isFinished(r) ? 'Finalizado' : `Próximo: ${formatDisplayDate(r.nextDate)}`}
                </span>
              </span>
              <RecurringAmount recurring={r} accounts={accountsById} />
              <RowMenu
                label={`Acciones de ${title}`}
                disabled={writesBlocked}
                items={[
                  {
                    label: 'Editar',
                    onSelect: () => {
                      openPanel({ kind: 'recurring', id: r.id });
                    },
                  },
                  {
                    label: 'Eliminar',
                    danger: true,
                    onSelect: () => {
                      setDeleting(r);
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
          title={`¿Eliminar ${recurringTitle(deleting, categoriesById)}?`}
          confirmLabel="Eliminar"
          danger
          onConfirm={() => {
            session.writer()?.deleteRecurring(deleting.id);
            setDeleting(null);
          }}
          onClose={() => {
            setDeleting(null);
          }}
        >
          Deja de aparecer en pendientes. Los movimientos que ya confirmaste quedan como están.
        </ConfirmDialog>
      )}
    </section>
  );
}

function RecurringAmount({
  recurring,
  accounts,
}: {
  recurring: Recurring;
  accounts: ReadonlyMap<string, Account>;
}) {
  const currency = accounts.get(recurring.accountId)?.currency ?? 'ARS';
  if (recurring.type === 'transfer') return <Money cents={recurring.amount} currency={currency} />;
  const income = recurring.type === 'income';
  return (
    <Money
      cents={income ? recurring.amount : -recurring.amount}
      currency={currency}
      sign={income ? 'always' : 'auto'}
      tone={recurring.type}
    />
  );
}
