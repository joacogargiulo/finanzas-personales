import { describe, expect, it } from 'vitest';
import type { Table } from './exportTables';
import {
  centsToSheetsNumber,
  dateToSheetsSerial,
  sheetRequests,
  type SheetsRequest,
} from './sheetsValues';

describe('dateToSheetsSerial', () => {
  // Sheets guarda una fecha como la cantidad de días desde el 30/12/1899.
  it.each([
    ['1899-12-30', 0],
    ['1900-03-01', 61],
    ['2024-02-29', 45351],
    ['2024-03-01', 45352],
    ['2026-10-04', 46299],
  ])('%s → %i', (date, serial) => {
    expect(dateToSheetsSerial(date)).toBe(serial);
  });
});

describe('centsToSheetsNumber', () => {
  it.each([
    [0, 0],
    [5, 0.05],
    [123456, 1234.56],
    [-50000, -500],
  ])('%i centavos → %d', (cents, value) => {
    expect(centsToSheetsNumber(cents)).toBe(value);
  });
});

describe('sheetRequests', () => {
  const table: Table = {
    name: 'movimientos',
    title: 'Movimientos',
    headers: ['Fecha', 'Descripción', 'Monto', 'Monto destino'],
    rows: [
      [
        { kind: 'date', date: '2026-10-04' },
        { kind: 'text', value: '=SUMA(A1)' },
        { kind: 'money', cents: 250050 },
        { kind: 'text', value: '' },
      ],
      [
        { kind: 'date', date: '2026-10-03' },
        { kind: 'text', value: '' },
        { kind: 'money', cents: 100 },
        { kind: 'money', cents: 100 },
      ],
    ],
  };

  const ofType = (requests: SheetsRequest[], type: string) =>
    requests.filter((request) => type in request).map((request) => request[type]);

  // Los valores: texto, números y fechas como número; las celdas vacías van sin valor (se borran).
  it('escribe el encabezado y las filas desde A1', () => {
    const [update] = ofType(sheetRequests(table, { sheetId: 7, rowCount: 1000 }), 'updateCells');
    expect(update).toEqual({
      start: { sheetId: 7, rowIndex: 0, columnIndex: 0 },
      rows: [
        {
          values: [
            { userEnteredValue: { stringValue: 'Fecha' } },
            { userEnteredValue: { stringValue: 'Descripción' } },
            { userEnteredValue: { stringValue: 'Monto' } },
            { userEnteredValue: { stringValue: 'Monto destino' } },
          ],
        },
        {
          values: [
            { userEnteredValue: { numberValue: 46299 } },
            // Como texto: Sheets no lo ejecuta como fórmula.
            { userEnteredValue: { stringValue: '=SUMA(A1)' } },
            { userEnteredValue: { numberValue: 2500.5 } },
            {},
          ],
        },
        {
          values: [
            { userEnteredValue: { numberValue: 46298 } },
            {},
            { userEnteredValue: { numberValue: 1 } },
            { userEnteredValue: { numberValue: 1 } },
          ],
        },
      ],
      fields: 'userEnteredValue',
    });
  });

  // El formato va por columna: fecha en la 0, número en la 2 y en la 3 (que tiene celdas vacías).
  it('da formato a las columnas de fechas y montos', () => {
    const formats = ofType(sheetRequests(table, { sheetId: 7, rowCount: 1000 }), 'repeatCell')
      .map((request) => request as { range: { startColumnIndex?: number }; cell: unknown })
      .filter((request) => request.range.startColumnIndex !== undefined)
      .map((request) => [request.range.startColumnIndex, JSON.stringify(request.cell)]);
    expect(formats).toEqual([
      [0, expect.stringContaining('dd/mm/yyyy')],
      [2, expect.stringContaining('#,##0.00')],
      [3, expect.stringContaining('#,##0.00')],
    ]);
  });

  // Al final la grilla queda con las filas justas: así se borran las filas viejas de abajo.
  it('achica la pestaña a las filas de la tabla y fija el encabezado', () => {
    const requests = sheetRequests(table, { sheetId: 7, rowCount: 1000 });
    const resizes = ofType(requests, 'updateSheetProperties');
    expect(resizes).toEqual([
      {
        properties: { sheetId: 7, gridProperties: { rowCount: 3, frozenRowCount: 1 } },
        fields: 'gridProperties.rowCount,gridProperties.frozenRowCount',
      },
    ]);
    expect(Object.keys(requests.at(-1) ?? {})).toEqual(['updateSheetProperties']);
  });

  // Si la pestaña tiene menos filas que la tabla, primero se agranda para poder escribir.
  it('agranda la pestaña antes de escribir si no alcanzan las filas', () => {
    const requests = sheetRequests(table, { sheetId: 7, rowCount: 1 });
    expect(Object.keys(requests[0] ?? {})).toEqual(['updateSheetProperties']);
    expect(requests[0]).toMatchObject({
      updateSheetProperties: { properties: { gridProperties: { rowCount: 3 } } },
    });
  });

  // Sheets no deja fijar todas las filas: con solo el encabezado, no se fija ninguna.
  it('sin datos no fija el encabezado ni da formato a columnas', () => {
    const empty: Table = { ...table, rows: [] };
    const requests = sheetRequests(empty, { sheetId: 7, rowCount: 1000 });
    expect(requests.at(-1)).toMatchObject({
      updateSheetProperties: { properties: { gridProperties: { rowCount: 1, frozenRowCount: 0 } } },
    });
    expect(ofType(requests, 'repeatCell')).toHaveLength(1);
  });
});
