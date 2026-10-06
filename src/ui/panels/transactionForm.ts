// Estado y reglas del formulario de movimiento (SRS 6.7). Funciones puras: el componente
// TransactionSheet solo las llama, y los tests las prueban sin dibujar nada.
// Las validaciones de negocio son las del dominio (`validateTransaction`); acá se decide qué
// muestra el formulario y qué campos se limpian.

import { parseAmountInput, amountToInput } from '../../domain/amountInput';
import { compareNames, isActive, sortAccounts } from '../../domain/collections';
import type {
  Account,
  Category,
  LocalDate,
  Transaction,
  TransactionType,
} from '../../domain/model';
import { err, type Result } from '../../domain/result';
import type { ParsedField, ParsedPhrase } from '../../domain/voice/parsePhrase';
import {
  validateTransaction,
  type FieldErrors,
  type TransactionDraft,
  type TransactionField,
  type TransactionFields,
  type ValidationContext,
} from '../../domain/validation';

export interface TransactionForm {
  type: TransactionType;
  /** Texto del teclado numérico (`"12500,5"`). */
  amount: string;
  /** Lo que entra en la cuenta destino de un cambio de moneda. */
  toAmount: string;
  date: LocalDate;
  description: string;
  accountId: string;
  toAccountId: string;
  categoryId: string;
}

export type TransactionFormErrors = FieldErrors<TransactionField>;

/** Formulario vacío: gasto, fecha de hoy y la primera cuenta activa (o la última usada). */
export function emptyForm(today: LocalDate, accountId: string): TransactionForm {
  return {
    type: 'expense',
    amount: '',
    toAmount: '',
    date: today,
    description: '',
    accountId,
    toAccountId: '',
    categoryId: '',
  };
}

/** Formulario precargado para editar un movimiento guardado. */
export function formFromTransaction(tx: Transaction): TransactionForm {
  return {
    type: tx.type,
    amount: amountToInput(tx.amount),
    toAmount: tx.type === 'exchange' ? amountToInput(tx.toAmount) : '',
    date: tx.date,
    description: tx.description,
    accountId: tx.accountId,
    toAccountId: tx.type === 'transfer' || tx.type === 'exchange' ? tx.toAccountId : '',
    categoryId: tx.type === 'income' || tx.type === 'expense' ? tx.categoryId : '',
  };
}

/** Formulario precargado para un movimiento nuevo (la ocurrencia de un recurrente, el dictado). */
export function formFromDraft(draft: TransactionDraft): TransactionForm {
  return {
    type: draft.type,
    amount: draft.amount > 0 ? amountToInput(draft.amount) : '',
    toAmount: draft.toAmount ? amountToInput(draft.toAmount) : '',
    date: draft.date,
    description: draft.description,
    accountId: draft.accountId,
    toAccountId: draft.toAccountId ?? '',
    categoryId: draft.categoryId ?? '',
  };
}

/** Formulario precargado por voz y los campos que conviene revisar. */
export interface PhraseForm {
  form: TransactionForm;
  unclear: ParsedField[];
}

/**
 * Formulario precargado con lo que se entendió de una frase dictada (ADR 0015 y 0023). Lo que no
 * se entendió queda vacío y se marca para revisar. Como el selector de cuenta no tiene opción
 * vacía, si no se entendió la cuenta queda la que estaba elegida (`current`), también marcada.
 */
export function formFromPhrase(
  parsed: ParsedPhrase,
  current: TransactionForm,
  accounts: readonly Account[],
): PhraseForm {
  const type = parsed.type ?? current.type;
  const accountId = parsed.accountId ?? current.accountId;
  const form: TransactionForm = {
    type,
    amount: parsed.amount === null ? '' : amountToInput(parsed.amount),
    toAmount: parsed.toAmount === null ? '' : amountToInput(parsed.toAmount),
    date: parsed.date,
    description: parsed.description,
    accountId,
    toAccountId: '',
    categoryId: type === 'income' || type === 'expense' ? (parsed.categoryId ?? '') : '',
  };
  // La cuenta destino solo si cumple la regla de moneda (si no, el selector no la muestra).
  if (destinationOptions(form, accounts).some((a) => a.id === parsed.toAccountId)) {
    form.toAccountId = parsed.toAccountId ?? '';
  }

  // "50 dólares" en una cuenta en pesos: el monto se entendió, pero la cuenta no cuadra.
  const account = accounts.find((a) => a.id === accountId);
  const currencyMismatch = parsed.currency !== null && account?.currency !== parsed.currency;

  const unclear: ParsedField[] = [];
  if (parsed.type === null) unclear.push('type');
  if (parsed.amount === null) unclear.push('amount');
  if (type === 'exchange' && parsed.toAmount === null) unclear.push('toAmount');
  if (parsed.accountId === null || currencyMismatch) unclear.push('account');
  if ((type === 'transfer' || type === 'exchange') && form.toAccountId === '') {
    unclear.push('toAccount');
  }
  if ((type === 'income' || type === 'expense') && form.categoryId === '') unclear.push('category');
  return { form, unclear };
}

/**
 * Cambia el tipo y limpia los campos que dejan de aplicar (SRS 6.7): la categoría es de un tipo
 * (ingreso o gasto), la cuenta destino depende de la regla de moneda (igual para transferir,
 * distinta para cambiar) y el segundo monto existe solo en el cambio.
 */
export function changeType(form: TransactionForm, type: TransactionType): TransactionForm {
  if (type === form.type) return form;
  return {
    ...form,
    type,
    categoryId: '',
    toAccountId: '',
    toAmount: type === 'exchange' ? form.toAmount : '',
  };
}

/** Lo que miran las reglas de cuentas y categorías: sirve también para el formulario de recurrente. */
type AccountsPart = Pick<TransactionForm, 'type' | 'accountId' | 'toAccountId'>;

/** Cambia la cuenta de origen; si la destino deja de ser válida, la limpia. */
export function changeAccount<F extends AccountsPart>(
  form: F,
  accountId: string,
  accounts: readonly Account[],
): F {
  const next = { ...form, accountId };
  if (
    next.toAccountId &&
    !destinationOptions(next, accounts).some((a) => a.id === next.toAccountId)
  ) {
    next.toAccountId = '';
  }
  return next;
}

/** Cuentas para elegir como origen: las activas, en el orden por defecto (SRS 4.8). */
export function accountOptions(accounts: readonly Account[]): Account[] {
  return sortAccounts(accounts.filter(isActive));
}

/**
 * Cuentas destino (SRS 6.7): activas y distintas del origen; de la misma moneda para una
 * transferencia (TC-03) y de otra moneda para un cambio.
 */
export function destinationOptions(
  form: Pick<TransactionForm, 'type' | 'accountId'>,
  accounts: readonly Account[],
): Account[] {
  const origin = accounts.find((a) => a.id === form.accountId);
  if (!origin || (form.type !== 'transfer' && form.type !== 'exchange')) return [];
  const sameCurrency = form.type === 'transfer';
  return accountOptions(accounts).filter(
    (a) => a.id !== origin.id && (a.currency === origin.currency) === sameCurrency,
  );
}

/**
 * Categorías para elegir: las activas del tipo del movimiento, por nombre. Al editar, también la
 * que ya tenía aunque esté archivada (SRS 5.3).
 */
export function categoryOptions(
  form: Pick<TransactionForm, 'type'>,
  categories: readonly Category[],
  keepId?: string,
): Category[] {
  if (form.type !== 'income' && form.type !== 'expense') return [];
  return categories
    .filter(
      (c) =>
        c.type === form.type && c.deletedAt === null && (c.archivedAt === null || c.id === keepId),
    )
    .sort((a, b) => compareNames(a.name, b.name));
}

/**
 * Convierte el formulario en un movimiento listo para guardar. Los montos se convierten con las
 * reglas de SRS 5.1 y el resto lo valida el dominio. Devuelve un error por campo.
 */
export function buildTransaction(
  form: TransactionForm,
  ctx: ValidationContext,
  original?: Transaction,
): Result<TransactionFields, TransactionFormErrors> {
  const amount = parseAmountInput(form.amount);
  const toAmount = form.type === 'exchange' ? parseAmountInput(form.toAmount) : null;

  const result = validateTransaction(
    {
      type: form.type,
      amount: amount.ok ? amount.value : 0,
      toAmount: toAmount?.ok ? toAmount.value : undefined,
      date: form.date,
      description: form.description,
      accountId: form.accountId,
      toAccountId: form.toAccountId || undefined,
      categoryId: form.categoryId || undefined,
    },
    ctx,
    original,
  );

  // El error de lectura del monto ("ingresá un monto") es más claro que el de la validación.
  const parseErrors: TransactionFormErrors = {};
  if (!amount.ok) parseErrors.amount = amount.error;
  if (toAmount && !toAmount.ok) parseErrors.toAmount = toAmount.error;
  if (result.ok && Object.keys(parseErrors).length === 0) return result;
  return err({ ...(result.ok ? {} : result.error), ...parseErrors });
}
