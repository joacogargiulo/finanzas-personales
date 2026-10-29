// Las consultas que el bot de WhatsApp sabe responder (ADR 0035): qué se pregunta, de qué período
// y cómo se escribe la respuesta. La IA solo elige la consulta; los números los calculan
// `computeBalances` y `computeStats` y se escriben acá, nunca en el modelo.

import { addDays, endOfMonth, startOfMonth, startOfWeek, addMonthsClamped } from './dates';
import type { Account, Category, Cents, Currency, LocalDate } from './model';
import { formatAmount } from './money';
import type { DateRange, Stats } from './stats';

export const QUERY_KINDS = [
  'accounts', // cuáles son mis cuentas
  'balance', // cuánta plata tengo / cuánto me queda en una cuenta
  'spending', // cuánto gasté
  'income', // cuánto gané
  'summary', // cómo vengo (ingresos, gastos y diferencia)
  'byCategory', // en qué gasté más
] as const;
export type QueryKind = (typeof QUERY_KINDS)[number];

export const QUERY_PERIODS = ['today', 'yesterday', 'week', 'month', 'lastMonth', 'year'] as const;
export type QueryPeriod = (typeof QUERY_PERIODS)[number];

export interface BotQuery {
  kind: QueryKind;
  /** Solo para `balance`, `spending`, `income` y `summary`: limita a una cuenta. */
  accountId: string | null;
  /** Solo para `spending` y `income`: limita a una categoría. */
  categoryId: string | null;
  period: QueryPeriod;
}

/** Si la consulta necesita un período (las demás no lo usan). */
export function usesPeriod(kind: QueryKind): boolean {
  return kind !== 'accounts' && kind !== 'balance';
}

/** Desde cuándo hasta cuándo se cuenta cada período (siempre hasta hoy, salvo ayer y mes pasado). */
export function queryRange(period: QueryPeriod, today: LocalDate): DateRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'week':
      return { from: startOfWeek(today), to: today };
    case 'month':
      return { from: startOfMonth(today), to: today };
    case 'lastMonth': {
      const previous = addMonthsClamped(today, -1);
      return { from: startOfMonth(previous), to: endOfMonth(previous) };
    }
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

const PERIOD_LABELS: Record<QueryPeriod, string> = {
  today: 'hoy',
  yesterday: 'ayer',
  week: 'esta semana',
  month: 'este mes',
  lastMonth: 'el mes pasado',
  year: 'este año',
};

export function periodLabel(period: QueryPeriod): string {
  return PERIOD_LABELS[period];
}

const CURRENCY_NAMES: Record<Currency, string> = {
  ARS: 'pesos',
  USD: 'dólares',
  EUR: 'euros',
};

const money = (cents: Cents, currency: Currency) => formatAmount(cents, currency, { sign: 'auto' });

// ── Respuestas ────────────────────────────────────────────────────────────────

/** "Tus cuentas:" con la moneda de cada una. */
export function accountsReply(accounts: readonly Account[]): string {
  if (accounts.length === 0) return 'Todavía no tenés cuentas. Creá una desde la app.';
  const lines = accounts.map((a) => `• ${a.name} (${CURRENCY_NAMES[a.currency]})`);
  return `Tus cuentas:\n${lines.join('\n')}`;
}

export interface AccountBalance {
  account: Account;
  balance: Cents;
}

/**
 * Saldos de las cuentas. Con una sola cuenta, una frase; con varias, una línea por cuenta y el
 * total por moneda (solo si esa moneda tiene más de una cuenta).
 */
export function balancesReply(rows: readonly AccountBalance[]): string {
  if (rows.length === 0) return 'No encontré cuentas para mostrarte.';
  const [only] = rows;
  if (rows.length === 1 && only) {
    return `En ${only.account.name} tenés ${money(only.balance, only.account.currency)}.`;
  }
  const lines = rows.map((r) => `• ${r.account.name}: ${money(r.balance, r.account.currency)}`);
  const totals = new Map<Currency, { sum: Cents; count: number }>();
  for (const { account, balance } of rows) {
    const total = totals.get(account.currency) ?? { sum: 0, count: 0 };
    totals.set(account.currency, { sum: total.sum + balance, count: total.count + 1 });
  }
  const totalLines = [...totals]
    .filter(([, t]) => t.count > 1)
    .map(([currency, t]) => `Total en ${CURRENCY_NAMES[currency]}: ${money(t.sum, currency)}`);
  return [...lines, ...(totalLines.length > 0 ? ['', ...totalLines] : [])].join('\n');
}

/**
 * El total de cada moneda, cuando hay demasiadas cuentas para mostrar el saldo de cada una.
 * Invita a preguntar por una cuenta para ver el detalle.
 */
export function totalsReply(totals: ReadonlyMap<Currency, Cents>, accountCount: number): string {
  const lines = [...totals].map(
    ([currency, total]) => `• Total en ${CURRENCY_NAMES[currency]}: ${money(total, currency)}`,
  );
  return [
    `Tenés ${String(accountCount)} cuentas, demasiadas para mostrarlas todas juntas. En total:`,
    ...lines,
    '',
    'Para ver una en particular, preguntame por ella: «cuánto tengo en Efectivo».',
  ].join('\n');
}

/** Los totales de un período en una moneda. */
export interface CurrencyStats {
  currency: Currency;
  stats: Stats;
}

/** El nombre de la cuenta o categoría a la que se limitó la consulta, para decirlo en la respuesta. */
export interface QueryScope {
  accountName: string | null;
  categoryName: string | null;
}

const MAX_CATEGORY_LINES = 5;

/**
 * La respuesta de una consulta de período, una línea (o bloque) por moneda que tenga movimientos.
 * `categories` traduce los IDs de `computeStats` a nombres.
 */
export function periodReply(
  query: BotQuery,
  results: readonly CurrencyStats[],
  categories: ReadonlyMap<string, Category>,
  scope: QueryScope,
): string {
  const when = periodLabel(query.period);
  const where = scope.accountName ? ` en ${scope.accountName}` : '';
  const withData = results.filter((r) => !r.stats.isEmpty);
  const none = (what: string) => `No tenés ${what}${where} ${when}.`;

  if (withData.length === 0) {
    return none(
      query.kind === 'income' ? 'ingresos' : query.kind === 'summary' ? 'movimientos' : 'gastos',
    );
  }

  const blocks = withData.map(({ currency, stats }) => {
    const unit = withData.length > 1 ? ` (${CURRENCY_NAMES[currency]})` : '';
    switch (query.kind) {
      case 'spending': {
        const category = scope.categoryName ? ` en ${scope.categoryName}` : '';
        return `Gastaste ${money(stats.totalExpense, currency)}${category}${where} ${when}${unit}.`;
      }
      case 'income': {
        const category = scope.categoryName ? ` de ${scope.categoryName}` : '';
        return `Ingresaron ${money(stats.totalIncome, currency)}${category}${where} ${when}${unit}.`;
      }
      case 'summary': {
        const diff = stats.totalIncome - stats.totalExpense;
        return [
          `Resumen ${when}${where}${unit}:`,
          `• Ingresos: ${money(stats.totalIncome, currency)}`,
          `• Gastos: ${money(stats.totalExpense, currency)}`,
          `• Diferencia: ${money(diff, currency)}`,
        ].join('\n');
      }
      case 'byCategory': {
        const rows = stats.expenseByCategory.slice(0, MAX_CATEGORY_LINES).map((c) => {
          const name = categories.get(c.categoryId)?.name ?? 'Sin categoría';
          return `• ${name}: ${money(c.total, currency)} (${String(Math.round(c.share * 100))}%)`;
        });
        return [`Gastos${where} ${when}${unit}, de mayor a menor:`, ...rows].join('\n');
      }
      default:
        return '';
    }
  });
  return blocks.join('\n\n');
}
