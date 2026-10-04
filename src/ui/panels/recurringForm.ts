// Estado y reglas del formulario de recurrente (SRS 6.7). Funciones puras, como en
// transactionForm.ts: el componente RecurringSheet las llama y los tests las prueban solas.
// La validación de negocio es la del dominio (`validateRecurring`).

import { amountToInput } from '../../domain/amountInput';
import type { Frequency, LocalDate, Recurring } from '../../domain/model';
import { parseAmount } from '../../domain/money';
import { err, type Result } from '../../domain/result';
import {
  validateRecurring,
  type FieldErrors,
  type RecurringField,
  type RecurringFields,
  type ValidationContext,
} from '../../domain/validation';

export type RecurringType = Recurring['type'];

export interface RecurringForm {
  type: RecurringType;
  /** Texto del campo de monto (`"15000,50"`). */
  amount: string;
  description: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  frequency: Frequency;
  startDate: LocalDate;
  /** `''` = sin fecha de fin. */
  endDate: string;
}

export type RecurringFormErrors = FieldErrors<RecurringField>;

export function emptyRecurringForm(today: LocalDate, accountId: string): RecurringForm {
  return {
    type: 'expense',
    amount: '',
    description: '',
    accountId,
    toAccountId: '',
    categoryId: '',
    frequency: 'monthly',
    startDate: today,
    endDate: '',
  };
}

export function formFromRecurring(recurring: Recurring): RecurringForm {
  return {
    type: recurring.type,
    amount: amountToInput(recurring.amount),
    description: recurring.description,
    accountId: recurring.accountId,
    toAccountId: recurring.type === 'transfer' ? recurring.toAccountId : '',
    categoryId: recurring.type === 'transfer' ? '' : recurring.categoryId,
    frequency: recurring.frequency,
    startDate: recurring.startDate,
    endDate: recurring.endDate ?? '',
  };
}

/** Cambia el tipo y limpia la categoría y la cuenta destino, que dependen de él. */
export function changeRecurringType(form: RecurringForm, type: RecurringType): RecurringForm {
  if (type === form.type) return form;
  return { ...form, type, categoryId: '', toAccountId: '' };
}

/**
 * Al editar, ¿cambió el calendario? Si cambian la frecuencia o el inicio, la próxima fecha se
 * recalcula sin repetir lo ya confirmado (ADR 0009); el panel lo explica.
 */
export function scheduleChanged(form: RecurringForm, original: Recurring | undefined): boolean {
  return (
    original !== undefined &&
    (form.frequency !== original.frequency || form.startDate !== original.startDate)
  );
}

/** Convierte el formulario en un recurrente listo para guardar, o devuelve un error por campo. */
export function buildRecurring(
  form: RecurringForm,
  ctx: ValidationContext,
  original?: Recurring,
): Result<RecurringFields, RecurringFormErrors> {
  const amount = parseAmount(form.amount);
  const result = validateRecurring(
    {
      type: form.type,
      amount: amount.ok ? amount.value : 0,
      description: form.description,
      accountId: form.accountId,
      toAccountId: form.toAccountId || undefined,
      categoryId: form.categoryId || undefined,
      frequency: form.frequency,
      startDate: form.startDate,
      endDate: form.endDate === '' ? null : form.endDate,
    },
    ctx,
    original,
  );
  // "Ingresá un monto" es más claro que el error de la validación con un 0.
  if (!amount.ok) return err({ ...(result.ok ? {} : result.error), amount: amount.error });
  return result;
}
