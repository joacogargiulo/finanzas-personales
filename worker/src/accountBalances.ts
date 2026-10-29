// Saldos de las cuentas con sumas de Firestore (ADR 0035). Sumar todos los movimientos de una
// cuenta leyéndolos uno por uno gastaría una lectura por movimiento; con consultas de agregación
// son seis sumas por cuenta que cuestan 1 lectura cada 1.000 entradas.
//
// La cuenta es la misma de `computeBalances` (SRS 5.2), desarmada en seis partes:
//   saldo = inicial + ingresos − gastos − transferencias enviadas + transferencias recibidas
//           − cambios enviados + lo recibido en cambios (`toAmount`).

import { selectable } from '../../src/domain/collections';
import type { Account, Cents, Currency } from '../../src/domain/model';
import { MAX_IN_VALUES, type SumFilter } from './firestoreQueries';

/** Suma `field` de los movimientos (no eliminados) que cumplen los filtros. */
export type SumTransactions = (
  filters: readonly SumFilter[],
  field: 'amount' | 'toAmount',
) => Promise<number>;

/** Con más cuentas se pasaría el límite de 50 subpedidos de un Worker en el plan gratis. */
export const MAX_BALANCE_ACCOUNTS = 6;

/** El saldo de una cuenta. */
export async function accountBalanceBySums(account: Account, sum: SumTransactions): Promise<Cents> {
  const { id } = account;
  const of = (type: string, accountField: 'accountId' | 'toAccountId') => [
    { field: 'type', equals: type },
    { field: accountField, equals: id },
  ];
  const [income, expense, transferOut, transferIn, exchangeOut, exchangeIn] = await Promise.all([
    sum(of('income', 'accountId'), 'amount'),
    sum(of('expense', 'accountId'), 'amount'),
    sum(of('transfer', 'accountId'), 'amount'),
    sum(of('transfer', 'toAccountId'), 'amount'),
    sum(of('exchange', 'accountId'), 'amount'),
    sum(of('exchange', 'toAccountId'), 'toAmount'),
  ]);
  return (
    account.initialBalance + income - expense - transferOut + transferIn - exchangeOut + exchangeIn
  );
}

/** Los saldos de varias cuentas, en paralelo. */
export async function accountBalances(
  accounts: readonly Account[],
  sum: SumTransactions,
): Promise<Map<string, Cents>> {
  const entries = await Promise.all(
    accounts.map(async (a) => [a.id, await accountBalanceBySums(a, sum)] as const),
  );
  return new Map(entries);
}

/**
 * El total de cada moneda, sumando todas sus cuentas juntas con filtros `IN`: seis sumas por cada
 * 30 cuentas de una moneda, sin importar cuántas cuentas haya. Sirve cuando son demasiadas para
 * pedir el saldo de cada una (límite de subpedidos). Las transferencias entre cuentas de la misma
 * moneda se compensan solas: salen de una y entran en otra del mismo grupo.
 */
export async function currencyTotals(
  accounts: readonly Account[],
  sum: SumTransactions,
): Promise<Map<Currency, Cents>> {
  const totals = new Map<Currency, Cents>();
  const groups = new Map<Currency, Account[]>();
  for (const account of selectable(accounts)) {
    groups.set(account.currency, [...(groups.get(account.currency) ?? []), account]);
  }
  for (const [currency, group] of groups) {
    let total = group.reduce((acc, a) => acc + a.initialBalance, 0);
    for (let i = 0; i < group.length; i += MAX_IN_VALUES) {
      const ids = group.slice(i, i + MAX_IN_VALUES).map((a) => a.id);
      const side = (type: string, field: 'accountId' | 'toAccountId') => [
        { field: 'type', equals: type },
        { field, oneOf: ids },
      ];
      const [income, expense, transferOut, transferIn, exchangeOut, exchangeIn] = await Promise.all(
        [
          sum(side('income', 'accountId'), 'amount'),
          sum(side('expense', 'accountId'), 'amount'),
          sum(side('transfer', 'accountId'), 'amount'),
          sum(side('transfer', 'toAccountId'), 'amount'),
          sum(side('exchange', 'accountId'), 'amount'),
          sum(side('exchange', 'toAccountId'), 'toAmount'),
        ],
      );
      total += income - expense - transferOut + transferIn - exchangeOut + exchangeIn;
    }
    totals.set(currency, total);
  }
  return totals;
}
