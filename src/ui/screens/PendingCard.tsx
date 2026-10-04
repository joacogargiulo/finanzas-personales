// "Pendientes de confirmar" en Inicio (SRS 6.3.3, 5.10): las ocurrencias de recurrentes cuya
// fecha ya llegó. Los recurrentes nunca se cargan solos: el usuario confirma (abre el panel
// precargado) o salta cada una.
//
// Es de presentación: recibe los pendientes y avisa qué tocó el usuario.

import { useState } from 'react';
import { errorMessage } from '../../domain/errors';
import type { Account, Category, Transaction } from '../../domain/model';
import { canConfirm, occurrenceDraft, type PendingOccurrence } from '../../domain/recurring';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Money } from '../components/Money';
import { dayMonth } from '../format';
import { transactionView } from '../transactionView';

interface PendingCardProps {
  pending: readonly PendingOccurrence[];
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
  today: string;
  disabled?: boolean;
  onConfirm: (occurrence: PendingOccurrence) => void;
  onSkip: (occurrence: PendingOccurrence) => void;
  onEdit: (occurrence: PendingOccurrence) => void;
}

/** El movimiento que generaría la ocurrencia, para mostrarlo como cualquier otro. */
function preview({ recurring, date }: PendingOccurrence): Transaction {
  const draft = occurrenceDraft(recurring, date);
  return {
    ...draft,
    id: '',
    source: 'app',
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
  } as Transaction;
}

export function PendingCard({
  pending,
  accounts,
  categories,
  today,
  disabled = false,
  onConfirm,
  onSkip,
  onEdit,
}: PendingCardProps) {
  const [skipping, setSkipping] = useState<PendingOccurrence | null>(null);

  if (pending.length === 0) return null;

  const skippingView = skipping && transactionView(preview(skipping), accounts, categories);

  return (
    <section className="card pending" aria-labelledby="pending-title">
      <h2 id="pending-title" className="card-title">
        Pendientes de confirmar ({pending.length})
      </h2>
      <ul className="list">
        {pending.map((occurrence) => {
          const view = transactionView(preview(occurrence), accounts, categories);
          const check = canConfirm(occurrence.recurring, accounts, categories);
          const amount = view.amounts[0];
          const when = occurrence.date === today ? 'Hoy' : dayMonth(occurrence.date);
          return (
            <li key={`${occurrence.recurring.id}_${occurrence.date}`} className="pending-row">
              <div className="list-row">
                <span className={`badge tone-${occurrence.recurring.type}`}>
                  <Icon name="repeat" />
                </span>
                <span className="row-main">
                  <span className="row-title">{view.title}</span>
                  <span className="row-subtitle">
                    {when} · {view.from.name}
                    {view.to ? ` → ${view.to.name}` : ''}
                  </span>
                </span>
                {amount && (
                  <Money
                    cents={amount.cents}
                    currency={amount.currency}
                    sign={amount.sign}
                    tone={amount.tone}
                  />
                )}
              </div>
              {!check.ok && <p className="small warn-text">{errorMessage(check.error)}</p>}
              <div className="pending-actions">
                <button
                  type="button"
                  className="btn"
                  disabled={disabled}
                  onClick={() => {
                    setSkipping(occurrence);
                  }}
                >
                  Saltar
                </button>
                {check.ok ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={disabled}
                    onClick={() => {
                      onConfirm(occurrence);
                    }}
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={disabled}
                    onClick={() => {
                      onEdit(occurrence);
                    }}
                  >
                    Editar recurrente
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {skipping && skippingView && (
        <ConfirmDialog
          title={`¿Saltar ${skippingView.title}?`}
          confirmLabel="Saltar"
          onConfirm={() => {
            onSkip(skipping);
            setSkipping(null);
          }}
          onClose={() => {
            setSkipping(null);
          }}
        >
          No se carga el movimiento del {dayMonth(skipping.date)}. El recurrente sigue con la
          próxima fecha.
        </ConfirmDialog>
      )}
    </section>
  );
}
