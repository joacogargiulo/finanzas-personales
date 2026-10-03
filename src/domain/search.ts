// Buscador y filtros del Historial (SRS 6.4).

import { isAlive } from './collections';
import type { Account, Category, LocalDate, Transaction, TransactionType } from './model';

/** Sin acentos ni mayúsculas: "Crédito" → "credito" (TC-18). */
export function normalizeText(text: string): string {
  // NFD separa cada letra de su acento ("é" → "e" + "´"); después se borran los acentos.
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export interface TransactionFilters {
  /** Texto libre: busca en descripción, nombre de categoría y nombres de cuentas. */
  text: string;
  type: TransactionType | null;
  /** Coincide como origen o como destino. */
  accountId: string | null;
  /** Solo aplica a ingresos y gastos. */
  categoryId: string | null;
  from: LocalDate | null;
  to: LocalDate | null;
}

/** "Limpiar filtros". */
export const EMPTY_FILTERS: TransactionFilters = {
  text: '',
  type: null,
  accountId: null,
  categoryId: null,
  from: null,
  to: null,
};

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.text.trim() !== '' ||
    filters.type !== null ||
    filters.accountId !== null ||
    filters.categoryId !== null ||
    filters.from !== null ||
    filters.to !== null
  );
}

/** El filtro de categoría se deshabilita con Transferencia o Cambio (SRS 6.4). */
export function isCategoryFilterEnabled(type: TransactionType | null): boolean {
  return type !== 'transfer' && type !== 'exchange';
}

/**
 * Aplica los filtros combinados y el buscador. Sin lápidas. Conserva el orden recibido.
 * Si el texto tiene varias palabras, cada una tiene que aparecer en algún campo.
 */
export function filterTransactions(
  transactions: readonly Transaction[],
  filters: TransactionFilters,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlyMap<string, Category>,
): Transaction[] {
  const words = normalizeText(filters.text).split(/\s+/).filter(Boolean);
  const categoryId = isCategoryFilterEnabled(filters.type) ? filters.categoryId : null;

  // Los nombres se normalizan una sola vez, no una vez por movimiento.
  const accountNames = new Map([...accounts].map(([id, a]) => [id, normalizeText(a.name)]));
  const categoryNames = new Map([...categories].map(([id, c]) => [id, normalizeText(c.name)]));

  return transactions.filter((tx) => {
    if (!isAlive(tx)) return false;
    if (filters.type !== null && tx.type !== filters.type) return false;
    if (filters.from !== null && tx.date < filters.from) return false;
    if (filters.to !== null && tx.date > filters.to) return false;

    const toAccountId = 'toAccountId' in tx ? tx.toAccountId : null;
    const txCategoryId = 'categoryId' in tx ? tx.categoryId : null;
    if (
      filters.accountId !== null &&
      tx.accountId !== filters.accountId &&
      toAccountId !== filters.accountId
    ) {
      return false;
    }
    if (categoryId !== null && txCategoryId !== categoryId) return false;

    if (words.length === 0) return true;
    const haystack = [
      normalizeText(tx.description),
      accountNames.get(tx.accountId) ?? '',
      toAccountId === null ? '' : (accountNames.get(toAccountId) ?? ''),
      txCategoryId === null ? '' : (categoryNames.get(txCategoryId) ?? ''),
    ].join(' ');
    return words.every((word) => haystack.includes(word));
  });
}
