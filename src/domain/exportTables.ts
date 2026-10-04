// Tablas de la exportación (SRS 8.3 y 8.4, ADR 0024): las mismas filas y columnas para el CSV
// y para Google Sheets. Cada celda dice qué es (texto, monto o fecha) y cada salida la escribe
// a su manera: el CSV como texto para Excel en español, Sheets como número y fecha.

import { computeBalances } from './balances';
import { alive, compareNames, indexById, sortAccounts, sortTransactions } from './collections';
import type {
  Account,
  Category,
  CategoryType,
  Cents,
  LocalDate,
  Transaction,
  TransactionType,
} from './model';

export type Cell =
  | { kind: 'text'; value: string }
  | { kind: 'money'; cents: Cents }
  | { kind: 'date'; date: LocalDate };

export interface Table {
  /** Nombre del archivo CSV y de la pestaña de Sheets. */
  name: string;
  headers: string[];
  rows: Cell[][];
}

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  exchange: 'Cambio',
};

const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  income: 'Ingreso',
  expense: 'Gasto',
};

const text = (value: string): Cell => ({ kind: 'text', value });
const money = (cents: Cents): Cell => ({ kind: 'money', cents });
const EMPTY = text('');

function status(doc: { archivedAt: number | null }): Cell {
  return text(doc.archivedAt === null ? 'Activa' : 'Archivada');
}

/**
 * Movimientos, del más nuevo al más viejo (SRS 5.11). El monto va siempre positivo: el tipo dice
 * si entró o salió. Las columnas de destino solo se llenan en transferencias y cambios.
 * Los nombres se buscan también entre las lápidas: un movimiento puede apuntar a una cuenta
 * eliminada en otro dispositivo.
 */
export function transactionsTable(
  transactions: readonly Transaction[],
  accounts: readonly Account[],
  categories: readonly Category[],
): Table {
  const accountsById = indexById(accounts);
  const categoriesById = indexById(categories);
  const accountName = (id: string) => text(accountsById.get(id)?.name ?? '');
  const currency = (id: string) => text(accountsById.get(id)?.currency ?? '');

  const rows = sortTransactions(alive(transactions)).map((tx): Cell[] => {
    const date: Cell = { kind: 'date', date: tx.date };
    const type = text(TYPE_LABELS[tx.type]);
    const description = text(tx.description);
    switch (tx.type) {
      case 'income':
      case 'expense':
        return [
          date,
          type,
          accountName(tx.accountId),
          EMPTY,
          text(categoriesById.get(tx.categoryId)?.name ?? ''),
          description,
          money(tx.amount),
          currency(tx.accountId),
          EMPTY,
          EMPTY,
        ];
      case 'transfer':
        return [
          date,
          type,
          accountName(tx.accountId),
          accountName(tx.toAccountId),
          EMPTY,
          description,
          money(tx.amount),
          currency(tx.accountId),
          // En una transferencia entra lo mismo que sale (misma moneda).
          money(tx.amount),
          currency(tx.toAccountId),
        ];
      case 'exchange':
        return [
          date,
          type,
          accountName(tx.accountId),
          accountName(tx.toAccountId),
          EMPTY,
          description,
          money(tx.amount),
          currency(tx.accountId),
          money(tx.toAmount),
          currency(tx.toAccountId),
        ];
    }
  });

  return {
    name: 'movimientos',
    headers: [
      'Fecha',
      'Tipo',
      'Cuenta',
      'Cuenta destino',
      'Categoría',
      'Descripción',
      'Monto',
      'Moneda',
      'Monto destino',
      'Moneda destino',
    ],
    rows,
  };
}

/** Cuentas (activas y archivadas) con el saldo calculado desde los movimientos (SRS 5.2). */
export function accountsTable(
  accounts: readonly Account[],
  transactions: readonly Transaction[],
): Table {
  const balances = computeBalances(accounts, transactions);
  return {
    name: 'cuentas',
    headers: ['Nombre', 'Moneda', 'Saldo inicial', 'Saldo actual', 'Estado'],
    rows: sortAccounts(alive(accounts)).map((account) => [
      text(account.name),
      text(account.currency),
      money(account.initialBalance),
      money(balances.get(account.id) ?? account.initialBalance),
      status(account),
    ]),
  };
}

/** Categorías (activas y archivadas), primero las de ingreso y después las de gasto. */
export function categoriesTable(categories: readonly Category[]): Table {
  const sorted = alive(categories).sort((a, b) =>
    a.type === b.type ? compareNames(a.name, b.name) : a.type === 'income' ? -1 : 1,
  );
  return {
    name: 'categorias',
    headers: ['Nombre', 'Tipo', 'Estado'],
    rows: sorted.map((category) => [
      text(category.name),
      text(CATEGORY_TYPE_LABELS[category.type]),
      status(category),
    ]),
  };
}
