// Validaciones que dependen de otros documentos (SRS 5.3, ADR 0010): las hace el dominio
// al escribir. Las reglas de Firestore validan solo la forma de cada documento.

import { isActive } from './collections';
import { isValidLocalDate } from './dates';
import type { DomainError } from './errors';
import {
  MAX_CENTS,
  type Account,
  type Budget,
  type Category,
  type CategoryType,
  type Cents,
  type Currency,
  type Frequency,
  type LocalDate,
  type Recurring,
  type Transaction,
  type TransactionType,
} from './model';
import { err, ok, type Result } from './result';

export const ACCOUNT_NAME_MAX = 50;
export const CATEGORY_NAME_MAX = 40;
export const DESCRIPTION_MAX = 200;

/** `Omit` que se aplica a cada variante de una unión discriminada por separado. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type SystemFields = 'id' | 'createdAt' | 'updatedAt' | 'deletedAt';

/** Los campos que elige el usuario, ya validados y sin los que no aplican al tipo. */
export type TransactionFields = DistributiveOmit<
  Transaction,
  SystemFields | 'source' | 'recurringId'
>;
export type RecurringFields = DistributiveOmit<Recurring, SystemFields | 'nextDate'>;

/** Lo que tiene el formulario: puede tener campos de más o de menos según el tipo. */
export interface TransactionDraft {
  type: TransactionType;
  amount: Cents;
  toAmount?: Cents | undefined;
  date: LocalDate;
  description: string;
  accountId: string;
  toAccountId?: string | undefined;
  categoryId?: string | undefined;
}

export interface RecurringDraft extends Omit<TransactionDraft, 'type' | 'toAmount' | 'date'> {
  type: Exclude<TransactionType, 'exchange'>;
  frequency: Frequency;
  startDate: LocalDate;
  endDate: LocalDate | null;
}

export type TransactionField = Exclude<keyof TransactionDraft, 'type'>;
export type RecurringField = Exclude<keyof RecurringDraft, 'type' | 'frequency'>;

/** Un error por campo, para mostrarlo junto al campo (SRS 6.7). */
export type FieldErrors<F extends string> = Partial<Record<F, DomainError>>;

export interface ValidationContext {
  accounts: ReadonlyMap<string, Account>;
  categories: ReadonlyMap<string, Category>;
}

// ── Campos sueltos ────────────────────────────────────────────────────────────

/** Un monto ya convertido a centavos: entero, positivo y hasta el máximo. */
export function validateAmount(cents: Cents): Result<Cents, DomainError> {
  if (!Number.isSafeInteger(cents)) return err({ code: 'amount.invalid' });
  if (cents <= 0) return err({ code: 'amount.notPositive' });
  if (cents > MAX_CENTS) return err({ code: 'amount.tooLarge' });
  return ok(cents);
}

export function validateDescription(text: string): Result<string, DomainError> {
  const value = text.trim();
  if (value.length > DESCRIPTION_MAX)
    return err({ code: 'description.tooLong', max: DESCRIPTION_MAX });
  return ok(value);
}

/** Nombre requerido, sin espacios al inicio ni al final, con un largo máximo. */
export function validateName(text: string, max: number): Result<string, DomainError> {
  const value = text.trim();
  if (value === '') return err({ code: 'name.required' });
  if (value.length > max) return err({ code: 'name.tooLong', max });
  return ok(value);
}

/** Igualdad de nombres sin distinguir mayúsculas (SRS 4.2). */
export function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase('es-AR') === b.trim().toLocaleLowerCase('es-AR');
}

/** Nombre de cuenta: válido y único entre las cuentas activas ("lo mejor posible", ADR 0005). */
export function validateAccountName(
  text: string,
  accounts: readonly Account[],
  excludeId?: string,
): Result<string, DomainError> {
  const result = validateName(text, ACCOUNT_NAME_MAX);
  if (!result.ok) return result;
  const taken = accounts.some(
    (a) => a.id !== excludeId && isActive(a) && sameName(a.name, result.value),
  );
  return taken ? err({ code: 'name.duplicateAccount', name: result.value }) : result;
}

/** Nombre de categoría: válido y único entre las activas del mismo tipo. */
export function validateCategoryName(
  text: string,
  type: CategoryType,
  categories: readonly Category[],
  excludeId?: string,
): Result<string, DomainError> {
  const result = validateName(text, CATEGORY_NAME_MAX);
  if (!result.ok) return result;
  const taken = categories.some(
    (c) => c.id !== excludeId && c.type === type && isActive(c) && sameName(c.name, result.value),
  );
  return taken ? err({ code: 'name.duplicateCategory', name: result.value }) : result;
}

// ── Referencias a otros documentos ────────────────────────────────────────────

/** La cuenta existe y está activa. */
function checkAccount(
  id: string | undefined,
  accounts: ReadonlyMap<string, Account>,
): Result<Account, DomainError> {
  if (id === undefined || id === '') return err({ code: 'account.required' });
  const account = accounts.get(id);
  if (!account || account.deletedAt !== null) return err({ code: 'account.missing' });
  if (account.archivedAt !== null) return err({ code: 'account.archived', name: account.name });
  return ok(account);
}

/**
 * La categoría existe, está activa y es del tipo del movimiento.
 * `keepId`: en una edición se admite la categoría ya asignada aunque esté archivada (SRS 5.3).
 */
function checkCategory(
  id: string | undefined,
  type: CategoryType,
  categories: ReadonlyMap<string, Category>,
  keepId: string | undefined,
): Result<Category, DomainError> {
  if (id === undefined || id === '') return err({ code: 'category.required' });
  const category = categories.get(id);
  if (!category || category.deletedAt !== null) return err({ code: 'category.missing' });
  if (category.type !== type) return err({ code: 'category.typeMismatch' });
  if (category.archivedAt !== null && id !== keepId) {
    return err({ code: 'category.archived', name: category.name });
  }
  return ok(category);
}

/** Cuenta destino de una transferencia (misma moneda) o un cambio (distinta moneda). */
function checkDestination(
  origin: Account | null,
  toAccountId: string | undefined,
  accounts: ReadonlyMap<string, Account>,
  sameCurrency: boolean,
): Result<Account, DomainError> {
  const destination = checkAccount(toAccountId, accounts);
  if (!destination.ok || !origin) return destination;
  if (destination.value.id === origin.id) return err({ code: 'account.sameAsOrigin' });
  const equal = destination.value.currency === origin.currency;
  if (sameCurrency && !equal) return err({ code: 'account.currencyMismatch' });
  if (!sameCurrency && equal) return err({ code: 'account.sameCurrency' });
  return destination;
}

// ── Movimientos ───────────────────────────────────────────────────────────────

/**
 * Valida un movimiento antes de guardarlo (SRS 5.3). Si es válido, devuelve solo los campos
 * que corresponden al tipo, con la descripción sin espacios de más.
 * `original`: el movimiento (o recurrente) que se está editando, si es una edición.
 */
export function validateTransaction(
  draft: TransactionDraft,
  ctx: ValidationContext,
  original?: Transaction | Recurring,
): Result<TransactionFields, FieldErrors<TransactionField>> {
  const errors: FieldErrors<TransactionField> = {};
  const fail = (field: TransactionField, r: Result<unknown, DomainError>) => {
    if (!r.ok) errors[field] = r.error;
  };

  const amount = validateAmount(draft.amount);
  fail('amount', amount);
  if (!isValidLocalDate(draft.date)) errors.date = { code: 'date.invalid' };
  const description = validateDescription(draft.description);
  fail('description', description);
  const account = checkAccount(draft.accountId, ctx.accounts);
  fail('accountId', account);
  const origin = account.ok ? account.value : null;

  const common = {
    amount: draft.amount,
    date: draft.date,
    description: description.ok ? description.value : '',
    accountId: draft.accountId,
  };
  let fields: TransactionFields;

  switch (draft.type) {
    case 'income':
    case 'expense': {
      const keepId = original && 'categoryId' in original ? original.categoryId : undefined;
      fail('categoryId', checkCategory(draft.categoryId, draft.type, ctx.categories, keepId));
      fields = { ...common, type: draft.type, categoryId: draft.categoryId ?? '' };
      break;
    }
    case 'transfer':
      fail('toAccountId', checkDestination(origin, draft.toAccountId, ctx.accounts, true));
      fields = { ...common, type: 'transfer', toAccountId: draft.toAccountId ?? '' };
      break;
    case 'exchange': {
      const toAmount = validateAmount(draft.toAmount ?? 0);
      fail('toAmount', toAmount);
      fail('toAccountId', checkDestination(origin, draft.toAccountId, ctx.accounts, false));
      fields = {
        ...common,
        type: 'exchange',
        toAccountId: draft.toAccountId ?? '',
        toAmount: draft.toAmount ?? 0,
      };
      break;
    }
  }

  return Object.keys(errors).length > 0 ? err(errors) : ok(fields);
}

/**
 * Un movimiento que usa una cuenta archivada se puede ver, pero no editar ni eliminar:
 * cambiaría el saldo de una cuenta que debe quedar en 0 (SRS 5.3).
 */
export function canModifyTransaction(
  tx: Transaction,
  accounts: ReadonlyMap<string, Account>,
): Result<void, DomainError> {
  const ids =
    tx.type === 'transfer' || tx.type === 'exchange'
      ? [tx.accountId, tx.toAccountId]
      : [tx.accountId];
  for (const id of ids) {
    const account = accounts.get(id);
    if (account && account.deletedAt === null && account.archivedAt !== null) {
      return err({ code: 'transaction.lockedByArchivedAccount', name: account.name });
    }
  }
  return ok(undefined);
}

// ── Recurrentes y presupuestos ────────────────────────────────────────────────

/**
 * Valida un recurrente (SRS 4.6, 6.7). Usa las mismas reglas de cuentas y categorías que un
 * movimiento, porque cada ocurrencia se convierte en uno.
 */
export function validateRecurring(
  draft: RecurringDraft,
  ctx: ValidationContext,
  original?: Recurring,
): Result<RecurringFields, FieldErrors<RecurringField>> {
  const tx = validateTransaction({ ...draft, date: draft.startDate }, ctx, original);

  const errors: FieldErrors<RecurringField> = {};
  if (!tx.ok) {
    for (const field of [
      'amount',
      'description',
      'accountId',
      'toAccountId',
      'categoryId',
    ] as const) {
      const error = tx.error[field];
      if (error) errors[field] = error;
    }
    if (tx.error.date) errors.startDate = tx.error.date;
  }
  if (draft.endDate !== null) {
    if (!isValidLocalDate(draft.endDate)) errors.endDate = { code: 'date.invalid' };
    else if (draft.endDate < draft.startDate) errors.endDate = { code: 'date.endBeforeStart' };
  }
  if (!tx.ok || Object.keys(errors).length > 0) return err(errors);

  const v = tx.value;
  const common = {
    amount: v.amount,
    description: v.description,
    accountId: v.accountId,
    frequency: draft.frequency,
    startDate: draft.startDate,
    endDate: draft.endDate,
  };
  switch (v.type) {
    case 'income':
    case 'expense':
      return ok({ ...common, type: v.type, categoryId: v.categoryId });
    case 'transfer':
      return ok({ ...common, type: 'transfer', toAccountId: v.toAccountId });
    case 'exchange':
      throw new Error('Un recurrente no puede ser un cambio de moneda');
  }
}

export interface BudgetDraft {
  categoryId: string;
  currency: Currency;
  amount: Cents;
}

export type BudgetField = Exclude<keyof BudgetDraft, 'currency'>;

/** Un presupuesto es para una categoría de gasto activa, con un límite positivo (SRS 5.9). */
export function validateBudget(
  draft: BudgetDraft,
  categories: ReadonlyMap<string, Category>,
  original?: Budget,
): Result<BudgetDraft, FieldErrors<BudgetField>> {
  const errors: FieldErrors<BudgetField> = {};
  const amount = validateAmount(draft.amount);
  if (!amount.ok) errors.amount = amount.error;
  const category = checkCategory(draft.categoryId, 'expense', categories, original?.categoryId);
  if (!category.ok) errors.categoryId = category.error;
  return Object.keys(errors).length > 0 ? err(errors) : ok(draft);
}
