// Cotización implícita de un cambio de moneda (SRS 5.4).

import type { Cents, Currency } from './model';
import { divRound, formatAmount } from './money';

export interface ImplicitRate {
  /** Moneda de la que se cotiza 1 unidad (USD o EUR). */
  base: Currency;
  /** Moneda en la que se expresa el precio (ARS, o EUR si es USD ↔ EUR). */
  quote: Currency;
  /** Precio de 1 unidad de `base`, en centavos de `quote`, redondeado. */
  rate: Cents;
  /** Texto para mostrar: `1 USD = $ 1.300,00`. */
  label: string;
}

interface Side {
  currency: Currency;
  amount: Cents;
}

/**
 * Si una de las monedas es ARS: pesos por unidad de la otra. Si es USD ↔ EUR: euros por 1 USD.
 * Devuelve `null` si las monedas son iguales o algún monto no es positivo
 * (por ejemplo, mientras el usuario todavía está escribiendo).
 */
export function implicitRate(from: Side, to: Side): ImplicitRate | null {
  if (from.currency === to.currency || from.amount <= 0 || to.amount <= 0) return null;

  let base: Side;
  let quote: Side;
  if (from.currency === 'ARS' || to.currency === 'ARS') {
    [quote, base] = from.currency === 'ARS' ? [from, to] : [to, from];
  } else {
    [base, quote] = from.currency === 'USD' ? [from, to] : [to, from];
  }

  // Precio de 1 unidad (100 centavos) de base: quote.amount × 100 / base.amount, con enteros.
  const rate = Number(divRound(BigInt(quote.amount) * 100n, BigInt(base.amount)));
  return {
    base: base.currency,
    quote: quote.currency,
    rate,
    label: `1 ${base.currency} = ${formatAmount(rate, quote.currency)}`,
  };
}
