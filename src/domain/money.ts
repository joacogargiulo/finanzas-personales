// Montos: texto → centavos y centavos → texto es-AR (SRS 5.1, ADR 0014).
// Nunca se usa aritmética de punto flotante con montos.

import type { DomainError } from './errors';
import { MAX_CENTS, type Cents, type Currency } from './model';
import { err, ok, type Result } from './result';

const CURRENCY_SYMBOLS: Record<Currency, string> = { ARS: '$', USD: 'US$', EUR: '€' };

/** Signo menos tipográfico (U+2212): los lectores de pantalla lo leen como "menos". */
export const MINUS = '−';

/** Texto que muestra `formatAmount` si el número ya no es exacto (ADR 0014). */
export const OUT_OF_RANGE_TEXT = 'monto fuera de rango';

type AmountError = Extract<
  DomainError,
  {
    code:
      | 'amount.required'
      | 'amount.invalid'
      | 'amount.tooManyDecimals'
      | 'amount.notPositive'
      | 'amount.tooLarge';
  }
>;

interface ParseAmountOptions {
  /** El saldo inicial de una cuenta puede ser 0 (SRS 4.2); el resto de los montos, no. */
  allowZero?: boolean;
}

/**
 * Convierte lo que escribe el usuario en centavos.
 * Acepta a lo sumo un separador decimal (coma o punto) y hasta 2 decimales:
 * `1500`, `1500,5`, `1500.50`, `0,99`. Rechaza `1.500` (podría ser un separador de miles).
 */
export function parseAmount(
  text: string,
  options: ParseAmountOptions = {},
): Result<Cents, AmountError> {
  const value = text.trim();
  if (value === '') return err({ code: 'amount.required' });

  // Más de 2 dígitos después del separador: se rechaza aparte para dar un mensaje más claro.
  if (/^\d+[.,]\d{3,}$/.test(value)) return err({ code: 'amount.tooManyDecimals' });

  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(value);
  if (!match) return err({ code: 'amount.invalid' });

  const [, integerPart = '', decimalPart = ''] = match;
  // BigInt: la parte entera puede tener muchos dígitos y no queremos perder precisión.
  const cents = BigInt(integerPart) * 100n + BigInt(decimalPart.padEnd(2, '0'));

  if (cents > BigInt(MAX_CENTS)) return err({ code: 'amount.tooLarge' });
  if (cents === 0n && options.allowZero !== true) return err({ code: 'amount.notPositive' });
  return ok(Number(cents));
}

interface FormatAmountOptions {
  /**
   * `auto`: signo solo si es negativo (saldos). `always`: también `+` (ingresos en el historial).
   * `never`: sin signo (el color o el contexto ya lo indican).
   */
  sign?: 'auto' | 'always' | 'never';
}

/** `123456` → `$ 1.234,56`, `US$ 1.234,56` o `€ 1.234,56`. Negativos: `− $ 1.234,56`. */
export function formatAmount(
  cents: Cents,
  currency: Currency,
  options: FormatAmountOptions = {},
): string {
  if (!Number.isSafeInteger(cents)) return OUT_OF_RANGE_TEXT;

  const digits = String(Math.abs(cents)).padStart(3, '0');
  const integerPart = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = `${CURRENCY_SYMBOLS[currency]} ${integerPart},${digits.slice(-2)}`;

  const sign = options.sign ?? 'auto';
  if (sign === 'never' || cents === 0) return body;
  if (cents < 0) return `${MINUS} ${body}`;
  return sign === 'always' ? `+ ${body}` : body;
}

/** Símbolo de la moneda (`$`, `US$`, `€`). */
export function currencySymbol(currency: Currency): string {
  return CURRENCY_SYMBOLS[currency];
}

/** División entera con redondeo al más cercano; la mitad se aleja del cero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('División por cero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const rounded = (2n * n + d) / (2n * d);
  return negative ? -rounded : rounded;
}
