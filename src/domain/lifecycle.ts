// Archivar, eliminar y restaurar cuentas y categorías (SRS 5.5, 5.6, ADR 0005 y 0009).
// "¿Se usa?" se responde con los datos que ya están en el dispositivo, sin leer de Firestore.

import { isActive, isAlive } from './collections';
import type { DomainError } from './errors';
import type { Account, Budget, Category, Cents, Recurring, Transaction } from './model';
import { isRecurringActive } from './recurring';
import { err, ok, type Result } from './result';
import { sameName } from './validation';

export interface UserData {
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  recurring: readonly Recurring[];
}

/** Cuántos documentos no eliminados usan una cuenta o una categoría. */
export interface Usage {
  transactions: number;
  budgets: number;
  recurring: number;
}

export function isUnused(usage: Usage): boolean {
  return usage.transactions === 0 && usage.budgets === 0 && usage.recurring === 0;
}

/** Uso de una cuenta: movimientos y recurrentes, como origen o como destino. */
export function accountUsage(accountId: string, data: UserData): Usage {
  const uses = (doc: Transaction | Recurring) =>
    doc.accountId === accountId || ('toAccountId' in doc && doc.toAccountId === accountId);
  return {
    transactions: data.transactions.filter((t) => isAlive(t) && uses(t)).length,
    // Los presupuestos son por categoría y moneda: nunca usan una cuenta.
    budgets: 0,
    recurring: data.recurring.filter((r) => isAlive(r) && uses(r)).length,
  };
}

/** Uso de una categoría: movimientos, presupuestos y recurrentes. */
export function categoryUsage(categoryId: string, data: UserData): Usage {
  const uses = (doc: Transaction | Recurring | Budget) =>
    'categoryId' in doc && doc.categoryId === categoryId;
  return {
    transactions: data.transactions.filter((t) => isAlive(t) && uses(t)).length,
    budgets: data.budgets.filter((b) => isAlive(b) && uses(b)).length,
    recurring: data.recurring.filter((r) => isAlive(r) && uses(r)).length,
  };
}

/** Una cuenta se archiva solo con saldo exactamente 0 (SRS 5.5, TC-06 y TC-07). */
export function canArchiveAccount(account: Account, balance: Cents): Result<void, DomainError> {
  if (balance !== 0) {
    return err({ code: 'archive.nonZeroBalance', balance, currency: account.currency });
  }
  return ok(undefined);
}

/** Eliminar (lápida) solo si nada la usa; si no, la UI ofrece archivar (ADR 0005). */
export function canDelete(usage: Usage): Result<void, DomainError> {
  return isUnused(usage) ? ok(undefined) : err({ code: 'delete.inUse' });
}

/** El tipo de una categoría cambia solo si nada la usa (ADR 0009). */
export function canChangeCategoryType(
  categoryId: string,
  data: UserData,
): Result<void, DomainError> {
  return isUnused(categoryUsage(categoryId, data))
    ? ok(undefined)
    : err({ code: 'category.typeLocked' });
}

/**
 * Restaurar una cuenta archivada: si ya hay una activa con el mismo nombre, el mismo diálogo
 * pide otro nombre (SRS 5.5).
 */
export function canRestoreAccount(
  account: Account,
  accounts: readonly Account[],
): Result<void, DomainError> {
  const taken = accounts.some(
    (a) => a.id !== account.id && isActive(a) && sameName(a.name, account.name),
  );
  return taken ? err({ code: 'restore.accountNameTaken', name: account.name }) : ok(undefined);
}

/** Igual que `canRestoreAccount`, entre las categorías activas del mismo tipo (SRS 5.6). */
export function canRestoreCategory(
  category: Category,
  categories: readonly Category[],
): Result<void, DomainError> {
  const taken = categories.some(
    (c) =>
      c.id !== category.id &&
      c.type === category.type &&
      isActive(c) &&
      sameName(c.name, category.name),
  );
  return taken ? err({ code: 'restore.categoryNameTaken', name: category.name }) : ok(undefined);
}

/**
 * Recurrentes activos (no eliminados ni finalizados) que usan una cuenta o categoría.
 * Al archivarla, la UI advierte que sus pendientes no se van a poder confirmar (ADR 0009).
 */
export function activeRecurringUsing(id: string, recurring: readonly Recurring[]): Recurring[] {
  return recurring.filter(
    (r) =>
      isRecurringActive(r) &&
      (r.accountId === id ||
        (r.type === 'transfer' && r.toAccountId === id) ||
        (r.type !== 'transfer' && r.categoryId === id)),
  );
}
