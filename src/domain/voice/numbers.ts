// Montos dictados, en cifras o en palabras (ADR 0015). Todo se calcula en centavos con BigInt.

import { MAX_CENTS, type Cents, type Currency } from '../model';

/** Valor de las palabras de 0 a 999. "un", "uno" y "una" se tratan aparte (pueden ser artículos). */
const WORDS: Readonly<Record<string, number>> = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  dieciseis: 16,
  diecisiete: 17,
  dieciocho: 18,
  diecinueve: 19,
  veinte: 20,
  veintiun: 21,
  veintiuno: 21,
  veintiuna: 21,
  veintidos: 22,
  veintitres: 23,
  veinticuatro: 24,
  veinticinco: 25,
  veintiseis: 26,
  veintisiete: 27,
  veintiocho: 28,
  veintinueve: 29,
  treinta: 30,
  cuarenta: 40,
  cincuenta: 50,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
  cien: 100,
  ciento: 100,
  doscientos: 200,
  doscientas: 200,
  trescientos: 300,
  trescientas: 300,
  cuatrocientos: 400,
  cuatrocientas: 400,
  quinientos: 500,
  quinientas: 500,
  seiscientos: 600,
  seiscientas: 600,
  setecientos: 700,
  setecientas: 700,
  ochocientos: 800,
  ochocientas: 800,
  novecientos: 900,
  novecientas: 900,
};

const ONE_WORDS: ReadonlySet<string> = new Set(['un', 'uno', 'una']);
/** "luca" = mil pesos; "palo" = un millón (lunfardo). */
const THOUSANDS: ReadonlySet<string> = new Set(['mil', 'luca', 'lucas']);
const MILLIONS: ReadonlySet<string> = new Set(['millon', 'millones', 'palo', 'palos']);

/** Palabras de moneda que pueden ir después del número. */
export const CURRENCY_WORDS: Readonly<Record<string, Currency>> = {
  peso: 'ARS',
  pesos: 'ARS',
  mangos: 'ARS',
  ars: 'ARS',
  dolar: 'USD',
  dolares: 'USD',
  verdes: 'USD',
  usd: 'USD',
  euro: 'EUR',
  euros: 'EUR',
  eur: 'EUR',
};

/** Símbolos que pueden ir antes del número, solos o pegados: "$ 500", "$500", "US$ 20". */
const CURRENCY_PREFIXES: Readonly<Record<string, Currency>> = {
  $: 'ARS',
  us$: 'USD',
  u$s: 'USD',
  '€': 'EUR',
};

function isMultiplier(word: string | undefined): boolean {
  return word !== undefined && (THOUSANDS.has(word) || MILLIONS.has(word));
}

interface Digits {
  cents: bigint;
  currency: Currency | null;
}

/**
 * Un número en cifras, como lo escribe el dictado: "18.000" (punto de miles), "2.500,50",
 * "1,5", "5k", "$18.000". Distinto de `parseAmount`, que no acepta separador de miles.
 */
export function parseDigits(token: string): Digits | null {
  let text = token;
  let currency: Currency | null = null;
  for (const [prefix, value] of Object.entries(CURRENCY_PREFIXES)) {
    if (text.startsWith(prefix) && text.length > prefix.length) {
      text = text.slice(prefix.length);
      currency = value;
      break;
    }
  }
  const thousands = text.endsWith('k');
  if (thousands) text = text.slice(0, -1);

  const grouped = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(text);
  const plain = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(text);
  const match = grouped ?? plain;
  if (!match) return null;
  const integerPart = (match[1] ?? '').replaceAll('.', '');
  const decimalPart = match[2] ?? '';
  const cents = BigInt(integerPart) * 100n + BigInt(decimalPart.padEnd(2, '0'));
  return { cents: thousands ? cents * 1000n : cents, currency };
}

export interface NumberMatch {
  cents: bigint;
  /** Posición siguiente al último token del número. */
  end: number;
  /** Tenía "mil", "millón", "luca" o "palo". */
  hasMultiplier: boolean;
  currency: Currency | null;
}

/**
 * Lee un número que empieza en `start`, combinando cifras y palabras:
 * "dos mil quinientos", "18 mil", "un millón doscientos mil", "dos lucas y media",
 * "mil con cincuenta" (centavos). `used` marca tokens que ya usó otra parte del parser.
 */
export function readNumber(
  norms: readonly string[],
  start: number,
  used: readonly boolean[] = [],
): NumberMatch | null {
  let total = 0n;
  let current = 0n;
  let lastMultiplier = 0n;
  let last: 'digit' | 'word' | 'multiplier' | null = null;
  let currency: Currency | null = null;
  let i = start;

  while (i < norms.length && used[i] !== true) {
    const token = norms[i] ?? '';
    const next = norms[i + 1];

    const digits = parseDigits(token);
    if (digits) {
      if (last === 'digit' || last === 'word') break; // dos números seguidos
      current += digits.cents;
      currency ??= digits.currency;
      last = 'digit';
      i += 1;
      continue;
    }

    const word = WORDS[token];
    if (word !== undefined) {
      if (last === 'digit') break;
      // "un", "una": número solo si viene un multiplicador ("un millón"); si no, es un artículo.
      if (ONE_WORDS.has(token) && last === null && !isMultiplier(next)) break;
      current += BigInt(word) * 100n;
      last = 'word';
      i += 1;
      continue;
    }

    if (token === 'y' && last !== null && next !== undefined) {
      // "un palo y medio", "dos lucas y media": la mitad del último multiplicador.
      if ((next === 'medio' || next === 'media') && last === 'multiplier') {
        total += lastMultiplier * 50n;
        i += 2;
        continue;
      }
      // "treinta y cinco"
      const unit = WORDS[next];
      if (last === 'word' && unit !== undefined && unit < 10) {
        i += 1;
        continue;
      }
      break;
    }

    // "mil" solo vale como número ("gasté mil"); "luca" necesita un número antes ("una luca").
    if (THOUSANDS.has(token) && (last !== null || token === 'mil')) {
      current = (current === 0n ? 100n : current) * 1000n;
      total += current;
      current = 0n;
      lastMultiplier = 1000n;
      last = 'multiplier';
      i += 1;
      continue;
    }

    if (MILLIONS.has(token) && last !== null) {
      const base = total + current;
      total = (base === 0n ? 100n : base) * 1_000_000n;
      current = 0n;
      lastMultiplier = 1_000_000n;
      last = 'multiplier';
      i += 1;
      continue;
    }

    // "mil con cincuenta": lo que sigue a "con" son centavos (hasta 99).
    if (token === 'con' && last !== null) {
      const decimals = readNumber(norms, i + 1, used);
      if (
        decimals &&
        !decimals.hasMultiplier &&
        decimals.cents % 100n === 0n &&
        decimals.cents < 100_00n
      ) {
        current += decimals.cents / 100n;
        i = decimals.end;
        if (norms[i] === 'centavos') i += 1;
      }
      break;
    }

    break;
  }

  if (last === null) return null;
  return { cents: total + current, end: i, hasMultiplier: lastMultiplier > 0n, currency };
}

export interface AmountMatch {
  cents: Cents;
  start: number;
  end: number;
  currency: Currency | null;
}

/**
 * El monto de la frase: entre todos los números que no usó otra parte del parser,
 * el más grande ("2 cafés 3000" → 3000). Incluye el símbolo o la palabra de moneda.
 */
export function findAmount(norms: readonly string[], used: readonly boolean[]): AmountMatch | null {
  let best: AmountMatch | null = null;
  let i = 0;
  while (i < norms.length) {
    if (used[i] === true) {
      i += 1;
      continue;
    }
    const prefix = CURRENCY_PREFIXES[norms[i] ?? ''];
    const numberStart = prefix ? i + 1 : i;
    const number = readNumber(norms, numberStart, used);
    if (!number) {
      i += 1;
      continue;
    }
    let end = number.end;
    let currency = prefix ?? number.currency;
    const suffix = CURRENCY_WORDS[norms[end] ?? ''];
    if (suffix && used[end] !== true) {
      currency ??= suffix;
      end += 1;
    }
    const valid = number.cents > 0n && number.cents <= BigInt(MAX_CENTS);
    if (valid && (!best || number.cents > BigInt(best.cents))) {
      best = { cents: Number(number.cents), start: i, end, currency };
    }
    i = end;
  }
  return best;
}
