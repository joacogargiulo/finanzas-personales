import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_KINDS,
  CATEGORY_TYPES,
  CURRENCIES,
  FREQUENCIES,
  MAX_CENTS,
  SCHEMA_VERSION,
  TRANSACTION_SOURCES,
  TRANSACTION_TYPES,
} from './model';

// Invariantes del modelo: si alguien cambia estas constantes por error, el test avisa.

describe('MAX_CENTS', () => {
  // Los montos son enteros en centavos (CLAUDE.md, regla 1). Por encima de
  // Number.MAX_SAFE_INTEGER, JavaScript pierde precisión y la suma deja de ser exacta.
  it('es un entero seguro', () => {
    expect(Number.isSafeInteger(MAX_CENTS)).toBe(true);
  });

  it('equivale a $ 999.999.999.999,99 (SRS 5.1)', () => {
    expect(MAX_CENTS).toBe(999_999_999_999 * 100 + 99);
  });
});

describe('SCHEMA_VERSION', () => {
  // ADR 0011: la versión del esquema es un entero que solo sube.
  it('es un entero mayor o igual a 1', () => {
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe('listas de valores permitidos', () => {
  // Estas listas se usan para validar datos y armar selectores: no pueden tener repetidos.
  it.each([
    ['CURRENCIES', CURRENCIES],
    ['ACCOUNT_KINDS', ACCOUNT_KINDS],
    ['CATEGORY_TYPES', CATEGORY_TYPES],
    ['TRANSACTION_TYPES', TRANSACTION_TYPES],
    ['TRANSACTION_SOURCES', TRANSACTION_SOURCES],
    ['FREQUENCIES', FREQUENCIES],
  ])('%s no tiene valores repetidos', (_name, values) => {
    expect(new Set(values).size).toBe(values.length);
  });
});
