// Presupuestos mensuales por categoría y moneda (SRS 5.9).

import { isActive, isAlive } from './collections';
import { monthKey } from './dates';
import type { Account, Budget, Category, Cents, Currency, LocalDate, Transaction } from './model';

/** ID fijo: un solo presupuesto por categoría y moneda (ADR 0004). */
export function budgetId(categoryId: string, currency: Currency): string {
  return `${categoryId}_${currency}`;
}

/** Verde hasta 80 %, amarilla de 80 % a 100 %, roja por encima de 100 % (SRS 5.9). */
export type BudgetLevel = 'ok' | 'warning' | 'over';

export interface BudgetProgress {
  spent: Cents;
  limit: Cents;
  /** Porcentaje entero, redondeado hacia abajo (puede pasar de 100). */
  percent: number;
  level: BudgetLevel;
  /** Cuánto se excedió (0 si no se excedió). */
  excess: Cents;
}

export function budgetProgress(limit: Cents, spent: Cents): BudgetProgress {
  // Se compara con enteros (gastado × 100 contra límite × 80) para no depender de un redondeo.
  const spent100 = BigInt(spent) * 100n;
  const limitBig = BigInt(limit);
  const level: BudgetLevel =
    spent100 <= limitBig * 80n ? 'ok' : spent100 <= limitBig * 100n ? 'warning' : 'over';
  return {
    spent,
    limit,
    percent: limit > 0 ? Number(spent100 / limitBig) : 0,
    level,
    excess: Math.max(0, spent - limit),
  };
}

export interface BudgetStatus extends BudgetProgress {
  budget: Budget;
  category: Category;
}

/**
 * Estado de los presupuestos del mes de `today`, en una sola pasada por los movimientos.
 * Se ocultan los presupuestos eliminados y los de categorías archivadas o eliminadas (SRS 5.6).
 * Gastado = gastos de esa categoría, en cuentas de esa moneda, con fecha en el mes (SRS 5.9).
 */
export function computeBudgets(
  budgets: readonly Budget[],
  categories: ReadonlyMap<string, Category>,
  accounts: ReadonlyMap<string, Account>,
  transactions: readonly Transaction[],
  today: LocalDate,
): BudgetStatus[] {
  const month = monthKey(today);
  const spentByKey = new Map<string, Cents>();
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !isAlive(tx) || monthKey(tx.date) !== month) continue;
    // La moneda sale de la cuenta (ADR 0008); sin cuenta conocida, no se sabe la moneda.
    const account = accounts.get(tx.accountId);
    if (!account) continue;
    const key = budgetId(tx.categoryId, account.currency);
    spentByKey.set(key, (spentByKey.get(key) ?? 0) + tx.amount);
  }

  const result: BudgetStatus[] = [];
  for (const budget of budgets) {
    const category = categories.get(budget.categoryId);
    if (!isAlive(budget) || !category || !isActive(category)) continue;
    const spent = spentByKey.get(budgetId(budget.categoryId, budget.currency)) ?? 0;
    result.push({ budget, category, ...budgetProgress(budget.amount, spent) });
  }
  return result;
}
