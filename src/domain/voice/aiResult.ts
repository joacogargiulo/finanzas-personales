// La respuesta de la IA, convertida en el mismo resultado que el parser de reglas (ADR 0031).
//
// Nunca se confía en la IA sin revisar: puede inventar IDs, elegir una categoría del otro tipo
// o devolver un monto con formato raro. Lo que no cierra queda vacío y en `missing`, y el panel
// lo marca para revisar, igual que con el parser.

import { selectable } from '../collections';
import { CURRENCIES, type Account, type Cents, type Currency, type LocalDate } from '../model';
import { isValidLocalDate } from '../dates';
import { parseAmount } from '../money';
import { DESCRIPTION_MAX } from '../validation';
import {
  missingFields,
  type ParsedPhrase,
  type PhraseContext,
  type VoiceTransactionType,
} from './parsePhrase';

const TYPES: readonly VoiceTransactionType[] = ['income', 'expense', 'transfer', 'exchange'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * El monto llega como texto ("18000", "2500,50"). Si la IA puso separador de miles ("18.000" o
 * "18,000"), se quita; si mandó un número en vez de texto, se usa su forma escrita. Después pasa por
 * `parseAmount`, el mismo que usa el formulario: nunca se hacen cuentas con decimales.
 */
function toCents(value: unknown): Cents | null {
  let text: string;
  if (typeof value === 'string') text = value.trim().replace(/^\$\s*/, '');
  else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
  else return null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) text = text.replace(/\./g, '');
  // Miles con coma, como en inglés ("38,700" o "1,234.50"): se quitan las comas.
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(text)) text = text.replace(/,/g, '');
  const result = parseAmount(text);
  return result.ok ? result.value : null;
}

/** Un ID que está entre los dados, o `null`. */
function pick<T extends { id: string }>(value: unknown, options: readonly T[]): T | null {
  return typeof value === 'string' ? (options.find((o) => o.id === value) ?? null) : null;
}

/** Fecha válida y no futura; si no, hoy (lo mismo que hace el parser si no se dijo una fecha). */
function toDate(value: unknown, today: LocalDate): LocalDate {
  return typeof value === 'string' && isValidLocalDate(value) && value <= today ? value : today;
}

/**
 * Convierte la respuesta cruda del Worker. `null` si no tiene forma de respuesta: en ese caso
 * se interpreta con el parser de reglas.
 */
export function parseAiResult(raw: unknown, ctx: PhraseContext): ParsedPhrase | null {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!isRecord(data)) return null;

  const type = TYPES.find((t) => t === data['type']) ?? null;
  const currency: Currency | null = CURRENCIES.find((c) => c === data['currency']) ?? null;
  const accounts = selectable(ctx.accounts);
  const twoAccounts = type === 'transfer' || type === 'exchange';

  let account = pick(data['accountId'], accounts);
  // Cuenta implícita, como en el parser: la única de la moneda nombrada, o la única que hay.
  if (!account && !twoAccounts) {
    const candidates = currency ? accounts.filter((a) => a.currency === currency) : accounts;
    if (candidates.length === 1) account = candidates[0] ?? null;
  }

  // Destino: distinto del origen; misma moneda para transferir y distinta para cambiar.
  let toAccount: Account | null = twoAccounts ? pick(data['toAccountId'], accounts) : null;
  if (toAccount && account) {
    const sameCurrency = toAccount.currency === account.currency;
    if (toAccount.id === account.id || (type === 'transfer') !== sameCurrency) toAccount = null;
  }

  // Categoría solo en gastos e ingresos, y del mismo tipo que el movimiento.
  const category =
    type === 'income' || type === 'expense'
      ? pick(
          data['categoryId'],
          selectable(ctx.categories).filter((c) => c.type === type),
        )
      : null;

  const description =
    typeof data['description'] === 'string'
      ? data['description'].trim().slice(0, DESCRIPTION_MAX).trim()
      : '';

  const phrase = {
    type,
    amount: toCents(data['amount']),
    toAmount: type === 'exchange' ? toCents(data['toAmount']) : null,
    accountId: account?.id ?? null,
    toAccountId: toAccount?.id ?? null,
    categoryId: category?.id ?? null,
  };
  return {
    ...phrase,
    currency,
    date: toDate(data['date'], ctx.today),
    description,
    missing: missingFields(phrase),
    unsupported: null,
  };
}
