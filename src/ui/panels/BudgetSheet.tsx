// Panel de presupuesto nuevo o de edición (SRS 6.6.3, 6.7): categoría de gasto, moneda y límite
// mensual. La categoría y la moneda forman el ID (`{categoryId}_{currency}`, ADR 0004), así que
// al editar solo cambia el límite. Si al crear se elige una combinación que ya existe, se edita
// esa (SRS 6.6).

import { useMemo, useState } from 'react';
import { amountToInput } from '../../domain/amountInput';
import { budgetId } from '../../domain/budgets';
import { compareNames, indexById, isActive } from '../../domain/collections';
import { errorMessage } from '../../domain/errors';
import type { Budget, Category, Currency } from '../../domain/model';
import { formatAmount, parseAmount } from '../../domain/money';
import {
  validateBudget,
  type BudgetDraft,
  type BudgetField,
  type FieldErrors,
} from '../../domain/validation';
import { CategoryChips } from '../components/CategoryChips';
import { Sheet } from '../components/Sheet';

export interface BudgetSheetProps {
  categories: readonly Category[];
  /** Todos los presupuestos (para avisar si la combinación ya existe). */
  budgets: readonly Budget[];
  /** Monedas que se pueden elegir: las que tienen alguna cuenta activa. */
  currencies: readonly Currency[];
  /** El presupuesto que se edita; sin él, se crea uno nuevo. */
  original?: Budget | undefined;
  onSave: (draft: BudgetDraft) => void;
  onClose: () => void;
}

export function BudgetSheet({
  categories,
  budgets,
  currencies,
  original,
  onSave,
  onClose,
}: BudgetSheetProps) {
  const categoriesById = useMemo(() => indexById(categories), [categories]);
  const choices = useMemo(
    () =>
      categories
        .filter((c) => c.type === 'expense' && isActive(c))
        .sort((a, b) => compareNames(a.name, b.name)),
    [categories],
  );

  const [categoryId, setCategoryId] = useState(original?.categoryId ?? '');
  const [currency, setCurrency] = useState<Currency>(original?.currency ?? currencies[0] ?? 'ARS');
  const [amount, setAmount] = useState(original ? amountToInput(original.amount) : '');
  const [errors, setErrors] = useState<FieldErrors<BudgetField>>({});

  const category = categoriesById.get(categoryId);
  // Al crear, ¿ya hay un presupuesto activo con esta categoría y moneda?
  const existing = original
    ? undefined
    : budgets.find((b) => b.id === budgetId(categoryId, currency) && b.deletedAt === null);

  function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const cents = parseAmount(amount);
    const result = validateBudget(
      { categoryId, currency, amount: cents.ok ? cents.value : 0 },
      categoriesById,
      original,
    );
    if (!cents.ok || !result.ok) {
      setErrors({
        ...(result.ok ? {} : result.error),
        ...(cents.ok ? {} : { amount: cents.error }),
      });
      return;
    }
    onSave(result.value);
  }

  return (
    <Sheet title={original ? 'Editar presupuesto' : 'Nuevo presupuesto'} onClose={onClose} routed>
      <form className="sheet-form" onSubmit={submit} noValidate>
        {original ? (
          <div className="field">
            <span className="field-label">Categoría y moneda</span>
            <p>
              {category?.name ?? 'Categoría desconocida'} · {original.currency}
            </p>
          </div>
        ) : (
          <>
            <div className="field">
              <span className="section-label" id="budget-categories-label">
                Categoría de gasto
              </span>
              {choices.length === 0 && (
                <p className="field-hint">No tenés categorías de gasto activas.</p>
              )}
              <CategoryChips
                categories={choices}
                selectedId={categoryId}
                labelledBy="budget-categories-label"
                onSelect={(id) => {
                  setCategoryId(id);
                  setErrors(({ amount: amountError }) =>
                    amountError ? { amount: amountError } : {},
                  );
                }}
              />
              {errors.categoryId && (
                <p className="field-error">{errorMessage(errors.categoryId)}</p>
              )}
            </div>

            {currencies.length > 1 && (
              <div className="field">
                <span className="field-label" id="budget-currency-label">
                  Moneda
                </span>
                <div className="segmented" role="group" aria-labelledby="budget-currency-label">
                  {currencies.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={currency === value}
                      onClick={() => {
                        setCurrency(value);
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="field-hint">Cuenta los gastos de las cuentas en esa moneda.</p>
              </div>
            )}
          </>
        )}

        <label className="field">
          <span className="field-label">Límite por mes ({currency})</span>
          <input
            className="input num"
            type="text"
            inputMode="decimal"
            value={amount}
            placeholder="0"
            aria-invalid={errors.amount ? true : undefined}
            onChange={(event) => {
              setAmount(event.target.value);
              setErrors(({ categoryId: categoryError }) =>
                categoryError ? { categoryId: categoryError } : {},
              );
            }}
          />
          {errors.amount && <p className="field-error">{errorMessage(errors.amount)}</p>}
        </label>

        {existing && category && (
          <p className="field-hint" role="status">
            Ya tenés un presupuesto de {formatAmount(existing.amount, existing.currency)} para{' '}
            {category.name} en {existing.currency}. Al guardar, se reemplaza el límite.
          </p>
        )}

        <button type="submit" className="btn btn-primary btn-block">
          {original || existing ? 'Guardar cambios' : 'Crear presupuesto'}
        </button>
      </form>
    </Sheet>
  );
}
