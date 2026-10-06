import { describe, expect, it } from 'vitest';
import { findAmount, parseDigits, readNumber } from './numbers';
import { tokenize } from './tokens';

const norms = (text: string) => tokenize(text).map((t) => t.norm);

/** El número que empieza en la primera palabra, en pesos (para leer los tests más fácil). */
function pesos(text: string): number | null {
  const n = readNumber(norms(text), 0);
  return n ? Number(n.cents) / 100 : null;
}

describe('parseDigits', () => {
  // Así escribe los números el dictado de Chrome en es-AR: el punto separa miles.
  it.each([
    ['18000', 18_000_00],
    ['18.000', 18_000_00],
    ['1.000.000', 1_000_000_00],
    ['2.500,50', 2_500_50],
    ['1,5', 1_50],
    ['1.5', 1_50],
    ['5k', 5_000_00],
    ['$18.000', 18_000_00],
    // En Android, el dictado a veces escribe los miles con coma, como en inglés.
    ['$38,700', 38_700_00],
    ['1,500', 1_500_00],
    ['1,234,567.50', 1_234_567_50],
  ])('"%s" → %i centavos', (token, cents) => {
    expect(parseDigits(token)?.cents).toBe(BigInt(cents));
  });

  it('reconoce el símbolo pegado', () => {
    expect(parseDigits('us$20')?.currency).toBe('USD');
  });

  it.each(['abc', '1,5000', '1.50.0', '1,500,5', ''])('"%s" no es un número', (token) => {
    expect(parseDigits(token)).toBeNull();
  });
});

describe('readNumber: palabras', () => {
  // Las combinaciones típicas de un monto dicho en voz alta.
  it.each([
    ['quinientos', 500],
    ['treinta y cinco', 35],
    ['ciento veinte', 120],
    ['mil', 1000],
    ['mil quinientos', 1500],
    ['dieciocho mil', 18_000],
    ['dos mil quinientos', 2500],
    ['ciento veinte mil', 120_000],
    ['un millón', 1_000_000],
    ['un millón doscientos mil', 1_200_000],
    ['dos millones', 2_000_000],
    ['18 mil', 18_000],
    ['1,5 millones', 1_500_000],
    ['2 mil 500', 2500],
  ])('"%s" → %i', (text, value) => {
    expect(pesos(text)).toBe(value);
  });

  // Lunfardo: luca = mil, palo = millón.
  it.each([
    ['una luca', 1000],
    ['dos lucas', 2000],
    ['18 lucas', 18_000],
    ['dos lucas y media', 2500],
    ['un palo', 1_000_000],
    ['un palo y medio', 1_500_000],
  ])('"%s" → %i', (text, value) => {
    expect(pesos(text)).toBe(value);
  });

  // "con" + número hasta 99 son centavos.
  it('mil con cincuenta → 1000,50', () => {
    expect(readNumber(norms('mil con cincuenta'), 0)?.cents).toBe(1_000_50n);
    expect(readNumber(norms('mil con cincuenta centavos'), 0)?.end).toBe(4);
  });

  // "un" y "una" solos son artículos, no el número 1.
  it('"una farmacia" no es un número', () => {
    expect(pesos('una farmacia')).toBeNull();
  });

  // Dos números seguidos no se suman: se lee solo el primero.
  it('se detiene entre dos números', () => {
    expect(pesos('300 2')).toBe(300);
  });
});

describe('findAmount', () => {
  // Si hay varios números, el monto es el más grande.
  it('elige el número más grande', () => {
    expect(findAmount(norms('pagué 2 cafés 3000'), [])?.cents).toBe(3_000_00);
  });

  // La moneda puede venir antes (símbolo) o después (palabra).
  it.each([
    ['$ 500', 'ARS'],
    ['50 dólares', 'USD'],
    ['20 euros', 'EUR'],
    ['US$ 20', 'USD'],
    ['500', null],
  ])('"%s" → moneda %s', (text, currency) => {
    expect(findAmount(norms(text), [])?.currency).toBe(currency);
  });

  // Los tokens ya usados (por ejemplo, por una fecha) no se tienen en cuenta.
  it('ignora tokens usados', () => {
    expect(findAmount(norms('el 5 gasté 300'), [true, true])?.cents).toBe(300_00);
  });

  it('sin números devuelve null', () => {
    expect(findAmount(norms('gasté en el súper'), [])).toBeNull();
  });
});
