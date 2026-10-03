import { describe, expect, it } from 'vitest';
import {
  amountKeyFromKeyboard,
  amountToInput,
  formatAmountInput,
  parseAmountInput,
  pressAmountKey,
  type AmountKey,
} from './amountInput';
import { parseAmount } from './money';

/** Aprieta varias teclas seguidas desde un texto vacío. */
function type(...keys: AmountKey[]): string {
  return keys.reduce(pressAmountKey, '');
}

// El teclado arma el monto como texto, tecla por tecla, sin pasar nunca por un decimal.
describe('pressAmountKey', () => {
  it('agrega dígitos y la coma', () => {
    expect(type('1', '2', '5', '0', '0', 'decimal', '5')).toBe('12500,5');
  });

  it('borra el último carácter', () => {
    expect(pressAmountKey('12,5', 'backspace')).toBe('12,');
    expect(pressAmountKey('12,', 'backspace')).toBe('12');
    expect(pressAmountKey('', 'backspace')).toBe('');
  });

  it('empieza con "0," si la primera tecla es la coma', () => {
    expect(type('decimal', '9', '9')).toBe('0,99');
  });

  it('no acepta un segundo separador', () => {
    expect(type('1', 'decimal', '5', 'decimal')).toBe('1,5');
  });

  it('no acepta más de 2 decimales (TC-17: "1.500" no se puede escribir)', () => {
    expect(type('1', 'decimal', '5', '0', '0')).toBe('1,50');
  });

  it('no deja ceros a la izquierda', () => {
    expect(type('0', '0', '5')).toBe('5');
    expect(type('0')).toBe('0');
  });

  it('no pasa de 12 dígitos enteros (máximo 999.999.999.999,99)', () => {
    const twelveNines: AmountKey[] = Array<AmountKey>(12).fill('9');
    const text = type(...twelveNines, '9', 'decimal', '9', '9');
    expect(text).toBe('999999999999,99');
    expect(parseAmount(text)).toEqual({ ok: true, value: 99_999_999_999_999 });
  });
});

// Lo que arma el teclado se convierte a centavos con las reglas de parseAmount (SRS 5.1).
describe('parseAmountInput', () => {
  it('convierte el texto del teclado a centavos', () => {
    expect(parseAmountInput(type('1', '5', '0', '0', 'decimal', '5'))).toEqual({
      ok: true,
      value: 150050,
    });
  });

  it('ignora una coma al final', () => {
    expect(parseAmountInput('1500,')).toEqual({ ok: true, value: 150000 });
  });

  it('rechaza el monto vacío o en cero', () => {
    expect(parseAmountInput('')).toEqual({ ok: false, error: { code: 'amount.required' } });
    expect(parseAmountInput('0,')).toEqual({ ok: false, error: { code: 'amount.notPositive' } });
  });
});

// En la compu se puede escribir con el teclado físico.
describe('amountKeyFromKeyboard', () => {
  it('traduce dígitos, coma, punto y borrar', () => {
    expect(amountKeyFromKeyboard('7')).toBe('7');
    expect(amountKeyFromKeyboard(',')).toBe('decimal');
    expect(amountKeyFromKeyboard('.')).toBe('decimal');
    expect(amountKeyFromKeyboard('Backspace')).toBe('backspace');
  });

  it('ignora el resto de las teclas', () => {
    expect(amountKeyFromKeyboard('a')).toBeNull();
    expect(amountKeyFromKeyboard('Enter')).toBeNull();
    expect(amountKeyFromKeyboard('-')).toBeNull();
  });
});

describe('formatAmountInput', () => {
  it('agrega el separador de miles mientras se escribe', () => {
    expect(formatAmountInput('12500,5')).toBe('12.500,5');
    expect(formatAmountInput('1234567')).toBe('1.234.567');
    expect(formatAmountInput('999,')).toBe('999,');
  });

  it('muestra 0 si está vacío', () => {
    expect(formatAmountInput('')).toBe('0');
  });
});

// Al editar un movimiento, el monto guardado vuelve al teclado como texto.
describe('amountToInput', () => {
  it('omite los centavos si son cero', () => {
    expect(amountToInput(150000)).toBe('1500');
  });

  it('muestra los dos decimales si hay centavos', () => {
    expect(amountToInput(150050)).toBe('1500,50');
    expect(amountToInput(5)).toBe('0,05');
  });

  it('ida y vuelta con parseAmount', () => {
    for (const cents of [1, 99, 100, 150050, 99_999_999_999_999]) {
      expect(parseAmount(amountToInput(cents))).toEqual({ ok: true, value: cents });
    }
  });
});
