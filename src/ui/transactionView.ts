// Cómo se muestra un movimiento en una lista (SRS 6.4): título, cuentas, categoría y montos con
// signo. Es una función pura para poder testearla sin dibujar nada.
//
// Tolerancia al leer (SRS 5.3): una cuenta o categoría puede estar archivada, eliminada o no
// existir (todavía no llegó por la sincronización). Se muestra igual, con su marca.

import { referenceStatus } from '../domain/collections';
import { implicitRate } from '../domain/exchange';
import type { Account, Category, Cents, Currency, Transaction } from '../domain/model';
import { TRANSACTION_TYPE_LABELS } from './format';

export interface NamedRef {
  name: string;
  /** Marca junto al nombre: "archivada" o "eliminada". */
  tag: string | null;
}

export interface AmountView {
  /** Con signo: negativo para lo que sale. */
  cents: Cents;
  currency: Currency;
  /** `always`: muestra también el `+`. `auto`: solo el `−`. */
  sign: 'always' | 'auto';
  tone: 'income' | 'expense' | null;
}

export interface TransactionView {
  title: string;
  category: NamedRef | null;
  from: NamedRef;
  /** Cuenta destino de una transferencia o un cambio. */
  to: NamedRef | null;
  /** Cotización implícita de un cambio: "1 USD = $ 1.300,00". */
  rate: string | null;
  amounts: AmountView[];
}

/** Moneda que se usa si la cuenta todavía no llegó (no se puede saber la real). */
const FALLBACK_CURRENCY: Currency = 'ARS';

function accountRef(id: string, accounts: ReadonlyMap<string, Account>): NamedRef {
  const status = referenceStatus(id, accounts);
  const name = accounts.get(id)?.name ?? 'Cuenta desconocida';
  return { name, tag: statusTag(status) };
}

function categoryRef(id: string, categories: ReadonlyMap<string, Category>): NamedRef {
  const status = referenceStatus(id, categories);
  const name = categories.get(id)?.name ?? 'Categoría desconocida';
  return { name, tag: statusTag(status) };
}

function statusTag(status: ReturnType<typeof referenceStatus>): string | null {
  if (status === 'archived') return 'archivada';
  if (status === 'deleted') return 'eliminada';
  return null;
}

export function transactionView(
  tx: Transaction,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlyMap<string, Category>,
): TransactionView {
  const currency = accounts.get(tx.accountId)?.currency ?? FALLBACK_CURRENCY;
  const from = accountRef(tx.accountId, accounts);
  const description = tx.description.trim();

  switch (tx.type) {
    case 'income':
    case 'expense': {
      const category = categoryRef(tx.categoryId, categories);
      const income = tx.type === 'income';
      return {
        title: description || category.name,
        category,
        from,
        to: null,
        rate: null,
        amounts: [
          {
            cents: income ? tx.amount : -tx.amount,
            currency,
            sign: income ? 'always' : 'auto',
            tone: tx.type,
          },
        ],
      };
    }
    case 'transfer':
      return {
        title: description || TRANSACTION_TYPE_LABELS.transfer,
        category: null,
        from,
        to: accountRef(tx.toAccountId, accounts),
        rate: null,
        amounts: [{ cents: tx.amount, currency, sign: 'auto', tone: null }],
      };
    case 'exchange': {
      const toCurrency = accounts.get(tx.toAccountId)?.currency ?? FALLBACK_CURRENCY;
      const rate = implicitRate(
        { currency, amount: tx.amount },
        { currency: toCurrency, amount: tx.toAmount },
      );
      return {
        title: description || TRANSACTION_TYPE_LABELS.exchange,
        category: null,
        from,
        to: accountRef(tx.toAccountId, accounts),
        rate: rate?.label ?? null,
        amounts: [
          { cents: -tx.amount, currency, sign: 'auto', tone: 'expense' },
          { cents: tx.toAmount, currency: toCurrency, sign: 'always', tone: 'income' },
        ],
      };
    }
  }
}
