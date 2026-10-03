// Estadísticas por período y moneda (SRS 6.5).
// Solo ingresos y gastos: las transferencias y los cambios de moneda no cuentan.
// Las categorías archivadas sí se incluyen.

import { isAlive } from './collections';
import { addMonthsClamped, endOfMonth, monthKey, startOfMonth } from './dates';
import type { Account, Cents, Currency, LocalDate, Transaction } from './model';

export const PERIOD_PRESETS = [
  'thisMonth',
  'last3',
  'last6',
  'last12',
  'thisYear',
  'custom',
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/** "Últimos 6 meses" por defecto (SRS 6.5). */
export const DEFAULT_PERIOD: PeriodPreset = 'last6';

export interface DateRange {
  from: LocalDate;
  to: LocalDate;
}

/**
 * Rango de fechas de un período, en meses completos. "Últimos 3 meses" = este mes y los
 * 2 anteriores. "Personalizado" usa el rango recibido.
 */
export function periodRange(preset: PeriodPreset, today: LocalDate, custom?: DateRange): DateRange {
  const lastMonths = (n: number) => ({
    from: startOfMonth(addMonthsClamped(today, -(n - 1))),
    to: endOfMonth(today),
  });
  switch (preset) {
    case 'thisMonth':
      return lastMonths(1);
    case 'last3':
      return lastMonths(3);
    case 'last6':
      return lastMonths(6);
    case 'last12':
      return lastMonths(12);
    case 'thisYear':
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case 'custom':
      if (!custom) throw new Error('El período personalizado necesita un rango');
      return custom;
  }
}

/** Los meses (`YYYY-MM`) que toca un rango, en orden. */
export function monthsInRange({ from, to }: DateRange): string[] {
  const months: string[] = [];
  for (let date = startOfMonth(from); date <= to; date = addMonthsClamped(date, 1)) {
    months.push(monthKey(date));
  }
  return months;
}

export interface MonthTotals {
  month: string;
  income: Cents;
  expense: Cents;
}

export interface CategoryTotal {
  categoryId: string;
  total: Cents;
  /** Fracción del total del gráfico, de 0 a 1 (para el porcentaje de la torta). */
  share: number;
}

export interface Stats {
  /** Gráfico 1: un elemento por mes del período, aunque no tenga movimientos. */
  monthly: MonthTotals[];
  /** Gráfico 2, de mayor a menor. Incluye categorías archivadas o desconocidas. */
  expenseByCategory: CategoryTotal[];
  /** Gráfico 3, de mayor a menor. */
  incomeByCategory: CategoryTotal[];
  totalIncome: Cents;
  totalExpense: Cents;
  /** No hay ingresos ni gastos en el período (estado vacío). */
  isEmpty: boolean;
}

function byCategory(totals: Map<string, Cents>, sum: Cents): CategoryTotal[] {
  return [...totals]
    .map(([categoryId, total]) => ({ categoryId, total, share: sum > 0 ? total / sum : 0 }))
    .sort((a, b) => b.total - a.total || (a.categoryId < b.categoryId ? -1 : 1));
}

/** Calcula los tres gráficos en una sola pasada por los movimientos. */
export function computeStats(
  transactions: readonly Transaction[],
  accounts: ReadonlyMap<string, Account>,
  currency: Currency,
  range: DateRange,
): Stats {
  const monthly = new Map<string, MonthTotals>(
    monthsInRange(range).map((month) => [month, { month, income: 0, expense: 0 }]),
  );
  const expenses = new Map<string, Cents>();
  const incomes = new Map<string, Cents>();
  let totalIncome = 0;
  let totalExpense = 0;

  for (const tx of transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    if (!isAlive(tx) || tx.date < range.from || tx.date > range.to) continue;
    // Solo cuentas de la moneda elegida; sin cuenta conocida no se sabe la moneda.
    if (accounts.get(tx.accountId)?.currency !== currency) continue;

    const month = monthly.get(monthKey(tx.date));
    const target = tx.type === 'income' ? incomes : expenses;
    target.set(tx.categoryId, (target.get(tx.categoryId) ?? 0) + tx.amount);
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      if (month) month.income += tx.amount;
    } else {
      totalExpense += tx.amount;
      if (month) month.expense += tx.amount;
    }
  }

  return {
    monthly: [...monthly.values()],
    expenseByCategory: byCategory(expenses, totalExpense),
    incomeByCategory: byCategory(incomes, totalIncome),
    totalIncome,
    totalExpense,
    isEmpty: totalIncome === 0 && totalExpense === 0,
  };
}
