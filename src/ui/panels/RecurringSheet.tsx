// Panel de recurrente nuevo o de edición (SRS 6.7): tipo, monto, cuentas, categoría,
// descripción, frecuencia, inicio y fin opcional.
//
// Como TransactionSheet, es "de presentación": recibe los datos y avisa con `onSave`.

import { useMemo, useState } from 'react';
import { indexById } from '../../domain/collections';
import { errorMessage, type DomainError } from '../../domain/errors';
import {
  FREQUENCIES,
  type Account,
  type Category,
  type LocalDate,
  type Recurring,
} from '../../domain/model';
import { DESCRIPTION_MAX, type RecurringFields } from '../../domain/validation';
import { CategoryChips } from '../components/CategoryChips';
import { Sheet } from '../components/Sheet';
import { FREQUENCY_LABELS } from '../format';
import {
  buildRecurring,
  changeRecurringType,
  emptyRecurringForm,
  formFromRecurring,
  scheduleChanged,
  type RecurringForm,
  type RecurringFormErrors,
  type RecurringType,
} from './recurringForm';
import {
  accountOptions,
  categoryOptions,
  changeAccount,
  destinationOptions,
} from './transactionForm';

const TYPES: { type: RecurringType; label: string }[] = [
  { type: 'expense', label: 'Gasto' },
  { type: 'income', label: 'Ingreso' },
  { type: 'transfer', label: 'Transferir' },
];

export interface RecurringSheetProps {
  accounts: readonly Account[];
  categories: readonly Category[];
  today: LocalDate;
  /** El recurrente que se edita; sin él, se crea uno nuevo. */
  original?: Recurring | undefined;
  onSave: (fields: RecurringFields) => void;
  onClose: () => void;
}

function FieldError({ error }: { error: DomainError | undefined }) {
  return error ? <p className="field-error">{errorMessage(error)}</p> : null;
}

function accountLabel(account: Account): string {
  return `${account.name} · ${account.currency}`;
}

export function RecurringSheet({
  accounts,
  categories,
  today,
  original,
  onSave,
  onClose,
}: RecurringSheetProps) {
  const origins = useMemo(() => accountOptions(accounts), [accounts]);
  const accountsById = useMemo(() => indexById(accounts), [accounts]);
  const categoriesById = useMemo(() => indexById(categories), [categories]);

  const [form, setForm] = useState<RecurringForm>(() =>
    original ? formFromRecurring(original) : emptyRecurringForm(today, origins[0]?.id ?? ''),
  );
  const [errors, setErrors] = useState<RecurringFormErrors>({});

  const keepCategoryId = original && original.type !== 'transfer' ? original.categoryId : undefined;
  const categoryChoices = categoryOptions(form, categories, keepCategoryId);
  const destinations = destinationOptions(form, accounts);
  const origin = accountsById.get(form.accountId);
  const title = original ? 'Editar recurrente' : 'Nuevo recurrente';

  function update(changes: Partial<RecurringForm>, fields: (keyof RecurringFormErrors)[]) {
    setForm((current) => ({ ...current, ...changes }));
    // El error de un campo se borra cuando el usuario lo cambia.
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([field]) => !(fields as string[]).includes(field)),
      ),
    );
  }

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = buildRecurring(
      form,
      { accounts: accountsById, categories: categoriesById },
      original,
    );
    if (!result.ok) {
      setErrors(result.error);
      return;
    }
    onSave(result.value);
  }

  if (origins.length === 0 && !original) {
    return (
      <Sheet title={title} onClose={onClose} routed>
        <p className="empty">Para crear un recurrente, primero creá una cuenta.</p>
      </Sheet>
    );
  }

  return (
    <Sheet title={title} onClose={onClose} routed>
      <form className="sheet-form" onSubmit={submit} noValidate>
        <div className="segmented" role="group" aria-label="Tipo de recurrente">
          {TYPES.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              className={`tone-${type}`}
              aria-pressed={form.type === type}
              onClick={() => {
                setForm((current) => changeRecurringType(current, type));
                setErrors({});
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Monto{origin ? ` (${origin.currency})` : ''}</span>
          <input
            className="input num"
            type="text"
            inputMode="decimal"
            value={form.amount}
            placeholder="0"
            aria-invalid={errors.amount ? true : undefined}
            onChange={(event) => {
              update({ amount: event.target.value }, ['amount']);
            }}
          />
          {errors.amount ? (
            <FieldError error={errors.amount} />
          ) : (
            <p className="field-hint">
              Es una sugerencia: al confirmar cada vez, lo podés cambiar.
            </p>
          )}
        </label>

        {form.type !== 'transfer' && (
          <div className="field">
            <span className="section-label" id="recurring-categories-label">
              Categoría
            </span>
            {categoryChoices.length === 0 && (
              <p className="field-hint">
                No tenés categorías de {form.type === 'income' ? 'ingreso' : 'gasto'} activas.
              </p>
            )}
            <CategoryChips
              categories={categoryChoices}
              selectedId={form.categoryId}
              labelledBy="recurring-categories-label"
              onSelect={(categoryId) => {
                update({ categoryId }, ['categoryId']);
              }}
            />
            <FieldError error={errors.categoryId} />
          </div>
        )}

        <div className="form-grid">
          <label className="field">
            <span className="field-label">{form.type === 'transfer' ? 'Desde' : 'Cuenta'}</span>
            <select
              className="input"
              value={form.accountId}
              aria-invalid={errors.accountId ? true : undefined}
              onChange={(event) => {
                const accountId = event.target.value;
                setForm((current) => changeAccount(current, accountId, accounts));
                update({}, ['accountId', 'toAccountId']);
              }}
            >
              {origin && !origins.includes(origin) && (
                <option value={origin.id}>{accountLabel(origin)}</option>
              )}
              {origins.map((account) => (
                <option key={account.id} value={account.id}>
                  {accountLabel(account)}
                </option>
              ))}
            </select>
            <FieldError error={errors.accountId} />
          </label>

          {form.type === 'transfer' && (
            <label className="field">
              <span className="field-label">Hacia</span>
              <select
                className="input"
                value={form.toAccountId}
                aria-invalid={errors.toAccountId ? true : undefined}
                onChange={(event) => {
                  update({ toAccountId: event.target.value }, ['toAccountId']);
                }}
              >
                <option value="">
                  {destinations.length === 0 ? 'No hay cuentas disponibles' : 'Elegí una cuenta'}
                </option>
                {destinations.map((account) => (
                  <option key={account.id} value={account.id}>
                    {accountLabel(account)}
                  </option>
                ))}
              </select>
              <FieldError error={errors.toAccountId} />
            </label>
          )}
        </div>

        <label className="field">
          <span className="field-label">Descripción (opcional)</span>
          <input
            className="input"
            type="text"
            value={form.description}
            maxLength={DESCRIPTION_MAX}
            placeholder="Por ejemplo, Alquiler"
            aria-invalid={errors.description ? true : undefined}
            onChange={(event) => {
              update({ description: event.target.value }, ['description']);
            }}
          />
          <FieldError error={errors.description} />
        </label>

        <div className="field">
          <span className="field-label" id="frequency-label">
            Frecuencia
          </span>
          <div className="segmented" role="group" aria-labelledby="frequency-label">
            {FREQUENCIES.map((frequency) => (
              <button
                key={frequency}
                type="button"
                aria-pressed={form.frequency === frequency}
                onClick={() => {
                  update({ frequency }, []);
                }}
              >
                {FREQUENCY_LABELS[frequency]}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid">
          <label className="field">
            <span className="field-label">Primera vez</span>
            <input
              className="input"
              type="date"
              value={form.startDate}
              required
              aria-invalid={errors.startDate ? true : undefined}
              onChange={(event) => {
                update({ startDate: event.target.value }, ['startDate', 'endDate']);
              }}
            />
            <FieldError error={errors.startDate} />
          </label>

          <label className="field">
            <span className="field-label">Hasta (opcional)</span>
            <input
              className="input"
              type="date"
              value={form.endDate}
              aria-invalid={errors.endDate ? true : undefined}
              onChange={(event) => {
                update({ endDate: event.target.value }, ['endDate']);
              }}
            />
            <FieldError error={errors.endDate} />
          </label>
        </div>

        {scheduleChanged(form, original) && (
          <p className="field-hint">
            Las veces que ya confirmaste o salteaste no vuelven a quedar pendientes.
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block">
          {original ? 'Guardar cambios' : 'Crear recurrente'}
        </button>
      </form>
    </Sheet>
  );
}
