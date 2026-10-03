import { describe, expect, it } from 'vitest';
import { MAX_CENTS } from './model';
import { divRound, formatAmount, MINUS, OUT_OF_RANGE_TEXT, parseAmount } from './money';

describe('parseAmount', () => {
  // Los ejemplos válidos de SRS 5.1 y TC-17: texto → centavos enteros.
  it.each([
    ['1500', 150000],
    ['1500,5', 150050],
    ['1500.50', 150050],
    ['1500,50', 150050],
    ['0,99', 99],
    ['0.01', 1],
    ['  250  ', 25000],
    ['007', 700],
  ])('"%s" → %i centavos', (text, cents) => {
    expect(parseAmount(text)).toEqual({ ok: true, value: cents });
  });

  // Los inválidos de SRS 5.1, cada uno con su código de error.
  it.each([
    ['', 'amount.required'],
    ['   ', 'amount.required'],
    ['1.500', 'amount.tooManyDecimals'],
    ['1,500', 'amount.tooManyDecimals'],
    ['1,5,0', 'amount.invalid'],
    ['1.500,50', 'amount.invalid'],
    ['abc', 'amount.invalid'],
    ['-100', 'amount.invalid'],
    [',5', 'amount.invalid'],
    ['1e3', 'amount.invalid'],
    ['0', 'amount.notPositive'],
    ['0,00', 'amount.notPositive'],
  ])('"%s" → %s', (text, code) => {
    expect(parseAmount(text)).toEqual({ ok: false, error: { code } });
  });

  // El máximo es 999.999.999.999,99; un centavo más se rechaza.
  it('acepta el máximo y rechaza un centavo más', () => {
    expect(parseAmount('999999999999,99')).toEqual({ ok: true, value: MAX_CENTS });
    expect(parseAmount('1000000000000')).toEqual({
      ok: false,
      error: { code: 'amount.tooLarge' },
    });
  });

  // No hay punto flotante: 0,1 + 0,2 en float da 0,30000000000000004, acá da 30 exacto.
  it('es exacto donde el punto flotante falla', () => {
    const a = parseAmount('0,1');
    const b = parseAmount('0,2');
    expect(a.ok && b.ok && a.value + b.value).toBe(30);
  });

  // El saldo inicial de una cuenta puede ser 0 (SRS 4.2).
  it('acepta 0 con allowZero', () => {
    expect(parseAmount('0', { allowZero: true })).toEqual({ ok: true, value: 0 });
  });
});

describe('formatAmount', () => {
  // Formato es-AR de SRS 5.1 para las tres monedas.
  it.each([
    [123456, 'ARS', '$ 1.234,56'],
    [123456, 'USD', 'US$ 1.234,56'],
    [123456, 'EUR', '€ 1.234,56'],
    [0, 'ARS', '$ 0,00'],
    [5, 'ARS', '$ 0,05'],
    [100, 'ARS', '$ 1,00'],
    [23000000, 'ARS', '$ 230.000,00'],
    [MAX_CENTS, 'ARS', '$ 999.999.999.999,99'],
  ] as const)('%i %s → "%s"', (cents, currency, text) => {
    expect(formatAmount(cents, currency)).toBe(text);
  });

  // Signos: negativo siempre con "−"; "+" solo si se pide.
  it('maneja el signo', () => {
    expect(formatAmount(-150000, 'ARS')).toBe(`${MINUS} $ 1.500,00`);
    expect(formatAmount(150000, 'ARS', { sign: 'always' })).toBe('+ $ 1.500,00');
    expect(formatAmount(-150000, 'ARS', { sign: 'never' })).toBe('$ 1.500,00');
    expect(formatAmount(0, 'ARS', { sign: 'always' })).toBe('$ 0,00');
  });

  // Un número que ya no es exacto no se muestra (ADR 0014).
  it('no muestra montos fuera de rango', () => {
    expect(formatAmount(Number.MAX_SAFE_INTEGER + 2, 'ARS')).toBe(OUT_OF_RANGE_TEXT);
    expect(formatAmount(1.5, 'ARS')).toBe(OUT_OF_RANGE_TEXT);
  });
});

describe('divRound', () => {
  // Redondeo al más cercano; la mitad se aleja del cero.
  it.each([
    [10n, 4n, 3n],
    [9n, 4n, 2n],
    [-10n, 4n, -3n],
    [-9n, 4n, -2n],
    [1n, 3n, 0n],
    [2n, 3n, 1n],
  ])('%s / %s → %s', (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected);
  });
});
