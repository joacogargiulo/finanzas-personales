// Respaldo en JSON (SRS 8.1, ADR 0024). Es una copia para guardar: la app no lo vuelve a cargar.

import { alive } from './collections';
import {
  SCHEMA_VERSION,
  type Account,
  type Budget,
  type Category,
  type EpochMs,
  type LocalDate,
  type Recurring,
  type Transaction,
} from './model';

/** Identifica el archivo como un respaldo de esta app. */
export const BACKUP_FORMAT = 'control-finanzas';

export interface BackupData {
  accounts: readonly Account[];
  categories: readonly Category[];
  transactions: readonly Transaction[];
  budgets: readonly Budget[];
  recurring: readonly Recurring[];
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  /** El esquema de los documentos (ADR 0011), para poder leer el archivo en el futuro. */
  schemaVersion: number;
  exportedAt: EpochMs;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  recurring: Recurring[];
}

/**
 * Arma el respaldo con los datos del dispositivo. Incluye los archivados y conserva los IDs;
 * deja afuera las lápidas, que para el usuario ya no existen (ADR 0005).
 */
export function buildBackup(data: BackupData, exportedAt: EpochMs): Backup {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    accounts: alive(data.accounts),
    categories: alive(data.categories),
    transactions: alive(data.transactions),
    budgets: alive(data.budgets),
    recurring: alive(data.recurring),
  };
}

/** `finanzas_2026-10-04.json`. La fecha es la local del dispositivo (`today()`). */
export function exportFileName(date: LocalDate, extension: 'json' | 'zip'): string {
  return `finanzas_${date}.${extension}`;
}
