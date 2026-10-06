import { describe, expect, it } from 'vitest';
import { centsToPlain, csvField, dateToDMY, toCsv } from './csv';
import type { Table } from './exportTables';
import { MAX_CENTS } from './model';

describe('centsToPlain', () => {
  // Centavos → texto que Excel en español lee como número: coma decimal y sin miles.
  it.each([
    [0, '0,00'],
    [5, '0,05'],
    [99, '0,99'],
    [100, '1,00'],
    [123456, '1234,56'],
    [-5, '-0,05'],
    [-123456, '-1234,56'],
    [MAX_CENTS, '999999999999,99'],
  ])('%i → "%s"', (cents, expected) => {
    expect(centsToPlain(cents)).toBe(expected);
  });
});

describe('dateToDMY', () => {
  it('pasa de YYYY-MM-DD a DD/MM/YYYY', () => {
    expect(dateToDMY('2026-10-04')).toBe('04/10/2026');
  });
});

describe('csvField', () => {
  // Un campo con el separador, comillas o saltos de línea va entre comillas dobles (SRS 8.3).
  it.each([
    ['Súper', 'Súper'],
    ['', ''],
    ['Pan; leche', '"Pan; leche"'],
    ['El "chino"', '"El ""chino"""'],
    ['dos\nlíneas', '"dos\nlíneas"'],
  ])('%j → %j', (value, expected) => {
    expect(csvField(value)).toBe(expected);
  });
});

describe('toCsv', () => {
  const table: Table = {
    name: 'prueba',
    title: 'Prueba',
    headers: ['Fecha', 'Descripción', 'Monto'],
    rows: [
      [
        { kind: 'date', date: '2026-10-04' },
        { kind: 'text', value: 'Café; medialunas' },
        { kind: 'money', cents: 250050 },
      ],
    ],
  };

  // El archivo completo: BOM para los acentos, `;` entre campos y `\r\n` entre filas.
  it('escribe el encabezado y las filas con el formato de Excel en español', () => {
    expect(toCsv(table)).toBe(
      '﻿Fecha;Descripción;Monto\r\n04/10/2026;"Café; medialunas";2500,50\r\n',
    );
  });
});
