// CSV pensado para Excel en español (SRS 8.3, ADR 0024): separador `;`, decimales con coma,
// UTF-8 con BOM (sin el BOM, Excel lee mal los acentos) y fin de línea `\r\n`.

import type { Cell, Table } from './exportTables';
import type { Cents, LocalDate } from './model';

const SEPARATOR = ';';
const NEWLINE = '\r\n';
/** Marca de orden de bytes: le avisa a Excel que el archivo está en UTF-8. */
const BOM = '﻿';

/**
 * `123456` → `1234,56`; `-5` → `-0,05`. Sin separador de miles ni símbolo, así Excel lo toma
 * como número. Se arma con texto, sin dividir por 100 (regla 1: nada de punto flotante).
 */
export function centsToPlain(cents: Cents): string {
  const digits = String(Math.abs(cents)).padStart(3, '0');
  const body = `${digits.slice(0, -2)},${digits.slice(-2)}`;
  return cents < 0 ? `-${body}` : body;
}

/** `2026-10-04` → `04/10/2026`. */
export function dateToDMY(date: LocalDate): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** Entre comillas si tiene `;`, comillas o saltos de línea; las comillas se duplican. */
export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function cellText(cell: Cell): string {
  switch (cell.kind) {
    case 'text':
      return cell.value;
    case 'money':
      return centsToPlain(cell.cents);
    case 'date':
      return dateToDMY(cell.date);
  }
}

/** La tabla completa como texto CSV, con el BOM al principio. */
export function toCsv(table: Table): string {
  const lines = [table.headers, ...table.rows.map((row) => row.map(cellText))].map((fields) =>
    fields.map(csvField).join(SEPARATOR),
  );
  return BOM + lines.join(NEWLINE) + NEWLINE;
}
