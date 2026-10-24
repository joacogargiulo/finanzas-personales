// Saldos de las cuentas con sumas de Firestore (ADR 0035). Sumar todos los movimientos de una
// cuenta leyéndolos uno por uno gastaría una lectura por movimiento; con consultas de agregación
// son seis sumas por cuenta que cuestan 1 lectura cada 1.000 entradas.
//
// La cuenta es la misma de `computeBalances` (SRS 5.2), desarmada en seis partes:
//   saldo = inicial + ingresos − gastos − transferencias enviadas + transferencias recibidas
//           − cambios enviados + lo recibido en cambios (`toAmount`).

import type { Account, Cents } from '../../src/domain/model';
import type { EqualFilter } from './firestoreQueries';

/** Suma `field` de los movimientos (no eliminados) que cumplen los filtros. */
export type SumTransactions = (
  filters: readonly EqualFilter[],
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
