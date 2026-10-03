// Saldo de las cuentas (SRS 5.2). Se calcula siempre; nunca se guarda.

import { isAlive } from './collections';
import type { Account, Cents, Transaction } from './model';

/**
 * Saldo de cada cuenta en una sola pasada por los movimientos (O(n)), para que ande fluido
 * con 10.000 movimientos (SRS 10).
 *
 * - Ignora los movimientos eliminados (lápidas).
 * - Incluye todas las cuentas recibidas, también las archivadas y eliminadas.
 * - Un movimiento que apunta a una cuenta desconocida suma igual en esa clave (SRS 5.3,
 *   tolerancia al leer): si la cuenta llega después por la sincronización, el saldo ya es correcto.
 */
export function computeBalances(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): Map<string, Cents> {
  const balances = new Map<string, Cents>(accounts.map((a) => [a.id, a.initialBalance]));
  const add = (accountId: string, delta: Cents) => {
    balances.set(accountId, (balances.get(accountId) ?? 0) + delta);
  };

  for (const tx of transactions) {
    if (!isAlive(tx)) continue;
    switch (tx.type) {
      case 'income':
        add(tx.accountId, tx.amount);
        break;
      case 'expense':
        add(tx.accountId, -tx.amount);
        break;
      case 'transfer':
        add(tx.accountId, -tx.amount);
        add(tx.toAccountId, tx.amount);
        break;
      case 'exchange':
        // Sale `amount` en la moneda de origen y entra `toAmount` en la de destino.
        add(tx.accountId, -tx.amount);
        add(tx.toAccountId, tx.toAmount);
        break;
    }
  }
  return balances;
}

/** Saldo de una sola cuenta. Para varias, usar `computeBalances` (una sola pasada). */
export function accountBalance(account: Account, transactions: readonly Transaction[]): Cents {
  return computeBalances([account], transactions).get(account.id) ?? account.initialBalance;
}
