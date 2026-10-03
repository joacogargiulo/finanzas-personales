// Consolidación patrimonial: totales por moneda y total estimado en ARS (SRS 5.7).

import { isActive } from './collections';
import type { Account, Cents, Currency, EpochMs, ExchangeRates } from './model';
import { divRound } from './money';

/** Una cotización con más de 24 horas se muestra como "desactualizada" (SRS 5.7). */
export const STALE_RATES_MS = 24 * 60 * 60 * 1000;

/** Escala para pasar la cotización (decimal) a entero: millonésimas. */
const RATE_SCALE = 1_000_000n;

type ForeignCurrency = Exclude<Currency, 'ARS'>;

export interface Consolidation {
  /** Suma de saldos de las cuentas activas de cada moneda. */
  byCurrency: Record<Currency, Cents>;
  /** ARS + cada moneda extranjera convertida, si tiene cotización. */
  totalArs: Cents;
  /** Monedas con saldo que no se sumaron por falta de cotización ("No incluye US$ X"). */
  missing: { currency: ForeignCurrency; amount: Cents }[];
  /** Hay cotizaciones, pero tienen más de 24 horas. */
  ratesStale: boolean;
  /** Cuentas archivadas que quedaron con saldo por una carrera entre dispositivos (TC-25). */
  archivedWithBalance: Account[];
}

/** Cotización usable de una moneda: un número finito y positivo (SRS 5.8), o `null`. */
export function rateFor(currency: ForeignCurrency, rates: ExchangeRates | null): number | null {
  if (!rates) return null;
  const rate = currency === 'USD' ? rates.USD_ARS : rates.EUR_ARS;
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

/**
 * Convierte centavos de otra moneda a centavos de ARS con enteros (ADR 0014):
 * la cotización se escala a millonésimas, y nunca se multiplican centavos por un decimal.
 */
export function toArs(cents: Cents, rate: number): Cents {
  const scaledRate = BigInt(Math.round(rate * Number(RATE_SCALE)));
  return Number(divRound(BigInt(cents) * scaledRate, RATE_SCALE));
}

/** Equivalente en ARS de un saldo, o `null` si es ARS o no hay cotización (SRS 5.7, último punto). */
export function equivalentArs(
  cents: Cents,
  currency: Currency,
  rates: ExchangeRates | null,
): Cents | null {
  if (currency === 'ARS') return null;
  const rate = rateFor(currency, rates);
  return rate === null ? null : toArs(cents, rate);
}

export function consolidate(
  accounts: readonly Account[],
  balances: ReadonlyMap<string, Cents>,
  rates: ExchangeRates | null,
  now: EpochMs,
): Consolidation {
  const byCurrency: Record<Currency, Cents> = { ARS: 0, USD: 0, EUR: 0 };
  const archivedWithBalance: Account[] = [];

  for (const account of accounts) {
    if (account.deletedAt !== null) continue;
    const balance = balances.get(account.id) ?? account.initialBalance;
    if (isActive(account)) {
      byCurrency[account.currency] += balance;
    } else if (balance !== 0) {
      archivedWithBalance.push(account);
    }
  }

  let totalArs = byCurrency.ARS;
  const missing: Consolidation['missing'] = [];
  for (const currency of ['USD', 'EUR'] as const) {
    const amount = byCurrency[currency];
    if (amount === 0) continue;
    const rate = rateFor(currency, rates);
    if (rate === null) missing.push({ currency, amount });
    else totalArs += toArs(amount, rate);
  }

  return {
    byCurrency,
    totalArs,
    missing,
    ratesStale: rates !== null && now - rates.fetchedAt > STALE_RATES_MS,
    archivedWithBalance,
  };
}
