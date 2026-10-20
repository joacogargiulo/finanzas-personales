// Qué se entendió de una frase y qué no, y el movimiento que sale de ella. Lo comparten el
// formulario de la app (dictado) y el bot de WhatsApp (ADR 0034), para que decidan igual.

import { isActive } from '../collections';
import type { Account, TransactionType } from '../model';
import type { TransactionDraft } from '../validation';
import type { ParsedField, ParsedPhrase } from './parsePhrase';

/** Lo que se usa cuando la frase no trae tipo o cuenta (el formulario ya tiene los suyos). */
export interface PhraseFallback {
  type: TransactionType;
  accountId: string;
}

/** `true` si la cuenta destino es activa, distinta del origen y de la moneda que corresponde. */
function isValidDestination(
  type: TransactionType,
  originId: string,
  toAccountId: string | null,
  accounts: readonly Account[],
): boolean {
  const origin = accounts.find((a) => a.id === originId);
  if (!origin || (type !== 'transfer' && type !== 'exchange') || toAccountId === null) return false;
  const sameCurrency = type === 'transfer';
  return accounts.some(
    (a) =>
      a.id === toAccountId &&
      isActive(a) &&
      a.id !== origin.id &&
      (a.currency === origin.currency) === sameCurrency,
  );
}

/**
 * Los campos que conviene revisar: los que no se entendieron más los que se entendieron pero no
 * cierran ("50 dólares" con una cuenta en pesos, un destino de otra moneda). Con `fallback`, el
 * tipo y la cuenta que faltan se toman de ahí (el formulario); sin él, quedan sin entender.
 */
export function unclearFields(
  parsed: ParsedPhrase,
  accounts: readonly Account[],
  fallback?: PhraseFallback,
): ParsedField[] {
  const type = parsed.type ?? fallback?.type ?? null;
  const accountId = parsed.accountId ?? fallback?.accountId ?? '';
  const account = accounts.find((a) => a.id === accountId);
  // "50 dólares" en una cuenta en pesos: el monto se entendió, pero la cuenta no cuadra.
  const currencyMismatch = parsed.currency !== null && account?.currency !== parsed.currency;

  const unclear: ParsedField[] = [];
  if (parsed.type === null) unclear.push('type');
  if (parsed.amount === null) unclear.push('amount');
  if (type === 'exchange' && parsed.toAmount === null) unclear.push('toAmount');
  if (parsed.accountId === null || currencyMismatch) unclear.push('account');
  if (
    (type === 'transfer' || type === 'exchange') &&
    !isValidDestination(type, accountId, parsed.toAccountId, accounts)
  ) {
    unclear.push('toAccount');
  }
  if ((type === 'income' || type === 'expense') && !parsed.categoryId) unclear.push('category');
  return unclear;
}

/** El movimiento listo para validar, o los campos que faltan si algo no se entendió. */
export type PhraseDraft =
  { ok: true; draft: TransactionDraft } | { ok: false; unclear: ParsedField[] };

/** Convierte una frase en un movimiento solo si se entendió completa (sin nada por revisar). */
export function draftFromPhrase(parsed: ParsedPhrase, accounts: readonly Account[]): PhraseDraft {
  const unclear = unclearFields(parsed, accounts);
  if (unclear.length > 0 || parsed.type === null) return { ok: false, unclear };
  const twoAccounts = parsed.type === 'transfer' || parsed.type === 'exchange';
  return {
    ok: true,
    draft: {
      type: parsed.type,
      amount: parsed.amount ?? 0,
      toAmount: parsed.type === 'exchange' ? (parsed.toAmount ?? 0) : undefined,
      date: parsed.date,
      description: parsed.description,
      accountId: parsed.accountId ?? '',
      toAccountId: twoAccounts ? (parsed.toAccountId ?? '') : undefined,
      categoryId: twoAccounts ? undefined : (parsed.categoryId ?? ''),
    },
  };
}
