// Archivos de la exportación (SRS 8.1 y 8.3, ADR 0024): el respaldo JSON y el ZIP con los CSV.
// El contenido lo arma el dominio; acá solo se empaqueta en un Blob para descargarlo.

import { strToU8, zipSync } from 'fflate';
import type { Backup } from '../domain/backup';
import { toCsv } from '../domain/csv';
import type { Table } from '../domain/exportTables';

/** El respaldo con sangría de 2 espacios, para que se pueda leer al abrirlo. */
export function jsonBlob(backup: Backup): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

/**
 * Un ZIP con un CSV por tabla (`cuentas.csv`, `categorias.csv`, `movimientos.csv`): descargar
 * varios archivos sueltos a la vez suele bloquearlo el navegador (SRS 8.3).
 */
export function csvZipBlob(tables: readonly Table[]): Blob {
  const files = Object.fromEntries(
    tables.map((table) => [`${table.name}.csv`, strToU8(toCsv(table))]),
  );
  return new Blob([zipSync(files)], { type: 'application/zip' });
}
