// Teclado numérico propio del panel de movimientos (ADR 0001). El monto se arma como texto
// (`"12500,5"`) tecla por tecla y al guardar se convierte con `parseAmount` (SRS 5.1): nunca
// pasa por un número decimal.
//
// El texto usa siempre coma como separador decimal. El teclado no deja escribir lo que
// `parseAmount` rechazaría por forma: un segundo separador, más de 2 decimales o más dígitos
// que el máximo.

import type { Cents } from './model';
import { parseAmount } from './money';

export type AmountKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'decimal' | 'backspace';

/** Dígitos de la parte entera: el máximo es 999.999.999.999,99 (SRS 5.1). */
const MAX_INTEGER_DIGITS = 12;
const MAX_DECIMALS = 2;

/** El texto después de apretar una tecla. Si la tecla no aplica, devuelve el mismo texto. */
export function pressAmountKey(text: string, key: AmountKey): string {
  if (key === 'backspace') return text.slice(0, -1);

  const [integerPart = '', decimalPart] = text.split(',');
  if (key === 'decimal') {
    if (decimalPart !== undefined) return text;
    return `${integerPart === '' ? '0' : integerPart},`;
  }

  // Un dígito.
  if (decimalPart !== undefined) {
    return decimalPart.length < MAX_DECIMALS ? text + key : text;
  }
  // Sin ceros a la izquierda: "0" seguido de "5" es "5".
  if (integerPart === '0') return key;
  return integerPart.length < MAX_INTEGER_DIGITS ? text + key : text;
}

/** Traduce una tecla del teclado físico (escritorio). Punto y coma valen como separador. */
export function amountKeyFromKeyboard(key: string): AmountKey | null {
  if (/^[0-9]$/.test(key)) return key as AmountKey;
  if (key === ',' || key === '.') return 'decimal';
  if (key === 'Backspace') return 'backspace';
  return null;
}

/** Para mostrar mientras se escribe: `"12500,5"` → `"12.500,5"`; vacío → `"0"`. */
export function formatAmountInput(text: string): string {
  if (text === '') return '0';
  const [integerPart = '', decimalPart] = text.split(',');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimalPart === undefined ? grouped : `${grouped},${decimalPart}`;
}

/** Para editar un monto guardado: `150000` → `"1500"`, `150050` → `"1500,50"`. */
export function amountToInput(cents: Cents): string {
  const digits = String(Math.abs(cents)).padStart(3, '0');
  const integerPart = digits.slice(0, -2);
  const decimalPart = digits.slice(-2);
  return decimalPart === '00' ? integerPart : `${integerPart},${decimalPart}`;
}

/** Convierte a centavos lo que armó el teclado. Una coma al final (`"1500,"`) no cuenta. */
export function parseAmountInput(text: string): ReturnType<typeof parseAmount> {
  return parseAmount(text.endsWith(',') ? text.slice(0, -1) : text);
}
