// Movimientos agrupados por día para la lista de Movimientos (ADR 0001, SRS 6.4).

import {
  CURRENCIES,
  type Account,
  type Cents,
  type Currency,
  type LocalDate,
  type Transaction,
} from './model';

export interface DayGroup<T extends Transaction = Transaction> {
  date: LocalDate;
  transactions: T[];
  /**
   * Ingresos − gastos del día, por moneda, en el orden ARS, USD, EUR. Las transferencias y los
   * cambios de moneda no cuentan: mueven plata entre cuentas propias. Sin movimientos que
   * cuenten, la lista queda vacía.
   */
  subtotals: { currency: Currency; amount: Cents }[];
}

/**
 * Agrupa movimientos **ya ordenados** por fecha (descendente), sin cambiar el orden.
 * Un movimiento con una cuenta desconocida no suma al subtotal: no se sabe su moneda.
 */
export function groupByDay<T extends Transaction>(
  transactions: readonly T[],
  accounts: ReadonlyMap<string, Account>,
): DayGroup<T>[] {
  const groups: { group: DayGroup<T>; totals: Map<Currency, Cents> }[] = [];

  for (const tx of transactions) {
    let last = groups.at(-1);
    if (last?.group.date !== tx.date) {
      last = { group: { date: tx.date, transactions: [], subtotals: [] }, totals: new Map() };
      groups.push(last);
    }
    last.group.transactions.push(tx);

    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const currency = accounts.get(tx.accountId)?.currency;
    if (!currency) continue;
    const delta = tx.type === 'income' ? tx.amount : -tx.amount;
    last.totals.set(currency, (last.totals.get(currency) ?? 0) + delta);
  }

  return groups.map(({ group, totals }) => ({
    ...group,
    subtotals: CURRENCIES.filter((c) => totals.has(c)).map((currency) => ({
      currency,
      amount: totals.get(currency) ?? 0,
    })),
  }));
}
