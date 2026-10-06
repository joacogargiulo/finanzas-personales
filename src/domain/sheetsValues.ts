// Las tablas de la exportación traducidas a pedidos de la API de Google Sheets (SRS 8.4,
// ADR 0025). Son funciones puras: la capa data solo las manda por la red.

import { daysBetween } from './dates';
import type { Cell, Table } from './exportTables';
import type { Cents, LocalDate } from './model';

/** Sheets cuenta las fechas como días desde el 30/12/1899 (igual que Excel). */
const SHEETS_EPOCH: LocalDate = '1899-12-30';

/** `2026-10-04` → `46299`. Con días enteros, sin zona horaria. */
export function dateToSheetsSerial(date: LocalDate): number {
  return daysBetween(SHEETS_EPOCH, date);
}

/**
 * `123456` → `1234.56`. Es el único lugar donde un monto se vuelve decimal: es una salida, como
 * mostrarlo en pantalla, y la app no lo vuelve a leer ni lo suma (regla 1 de CLAUDE.md).
 */
export function centsToSheetsNumber(cents: Cents): number {
  return cents / 100;
}

/** Un pedido de `spreadsheets.batchUpdate`. La forma exacta la define la API de Google. */
export type SheetsRequest = Record<string, unknown>;

/** Lo que importa de una pestaña que ya existe. */
export interface SheetGrid {
  sheetId: number;
  rowCount: number;
}

const DATE_FORMAT = { type: 'DATE', pattern: 'dd/mm/yyyy' };
// Número y no moneda: cada fila puede tener otra moneda, y lo dice la columna Moneda.
// El separador de miles y el decimal los pone la configuración regional de la hoja (es_AR).
const MONEY_FORMAT = { type: 'NUMBER', pattern: '#,##0.00' };

function cellData(cell: Cell): Record<string, unknown> {
  switch (cell.kind) {
    case 'text':
      // Una celda sin valor borra lo que había. `stringValue` nunca se interpreta como fórmula.
      return cell.value === '' ? {} : { userEnteredValue: { stringValue: cell.value } };
    case 'money':
      return { userEnteredValue: { numberValue: centsToSheetsNumber(cell.cents) } };
    case 'date':
      return { userEnteredValue: { numberValue: dateToSheetsSerial(cell.date) } };
  }
}

/**
 * Los pedidos que dejan la pestaña igual a la tabla. Van todos en un mismo `batchUpdate`, que
 * Google aplica entero o no aplica: la hoja nunca queda vacía ni a medias.
 *
 * 1. Agranda la grilla si la tabla tiene más filas que la pestaña.
 * 2. Escribe el encabezado y los datos desde A1.
 * 3. Da formato por columna (fechas y montos) y pone el encabezado en negrita. Por columna y no
 *    por celda, para que el pedido no pese varios MB con 10.000 movimientos.
 * 4. Deja la grilla con las filas justas (así desaparecen las filas viejas de abajo) y fija el
 *    encabezado. Sheets no deja fijar todas las filas: con solo el encabezado, no se fija.
 */
export function sheetRequests(table: Table, grid: SheetGrid): SheetsRequest[] {
  const { sheetId } = grid;
  const rowCount = table.rows.length + 1;
  const requests: SheetsRequest[] = [];

  if (rowCount > grid.rowCount) {
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { rowCount } },
        fields: 'gridProperties.rowCount',
      },
    });
  }

  requests.push({
    updateCells: {
      start: { sheetId, rowIndex: 0, columnIndex: 0 },
      rows: [
        { values: table.headers.map((header) => cellData({ kind: 'text', value: header })) },
        ...table.rows.map((row) => ({ values: row.map(cellData) })),
      ],
      fields: 'userEnteredValue',
    },
  });

  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true } } },
      fields: 'userEnteredFormat.textFormat.bold',
    },
  });

  // El tipo de cada columna sale de la primera fila con valor en esa columna.
  if (table.rows.length > 0) {
    table.headers.forEach((_, column) => {
      const kind = table.rows.find((row) => row[column]?.kind !== 'text')?.[column]?.kind;
      if (kind !== 'money' && kind !== 'date') return;
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 1,
            endRowIndex: rowCount,
            startColumnIndex: column,
            endColumnIndex: column + 1,
          },
          cell: {
            userEnteredFormat: { numberFormat: kind === 'date' ? DATE_FORMAT : MONEY_FORMAT },
          },
          fields: 'userEnteredFormat.numberFormat',
        },
      });
    });
  }

  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: { rowCount, frozenRowCount: rowCount > 1 ? 1 : 0 },
      },
      fields: 'gridProperties.rowCount,gridProperties.frozenRowCount',
    },
  });

  return requests;
}
