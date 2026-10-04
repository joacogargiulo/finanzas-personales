import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, buildBackup, exportFileName } from './backup';
import { SCHEMA_VERSION } from './model';
import {
  makeAccount,
  makeBudget,
  makeCategory,
  makeExpense,
  makeRecurring,
} from './testing/factories';

describe('buildBackup', () => {
  const account = makeAccount({ id: 'acc-activa' });
  const archived = makeAccount({ id: 'acc-archivada', archivedAt: 1_700_000_100_000 });
  const deleted = makeAccount({ id: 'acc-eliminada', deletedAt: 1_700_000_200_000 });
  const category = makeCategory({ id: 'cat-comida' });
  const expense = makeExpense({ id: 'tx-1', accountId: account.id, categoryId: category.id });
  const deletedExpense = makeExpense({
    accountId: account.id,
    categoryId: category.id,
    deletedAt: 1_700_000_300_000,
  });
  const backup = buildBackup(
    {
      accounts: [account, archived, deleted],
      categories: [category],
      transactions: [expense, deletedExpense],
      budgets: [makeBudget({ categoryId: category.id })],
      recurring: [makeRecurring({ accountId: account.id, categoryId: category.id })],
    },
    1_759_600_000_000,
  );

  // El encabezado identifica el archivo y su esquema (SRS 8.1).
  it('lleva el formato, la versión del esquema y la hora de exportación', () => {
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.exportedAt).toBe(1_759_600_000_000);
  });

  // Lo archivado se puede restaurar en la app, así que se respalda; lo eliminado, no.
  it('incluye los archivados y deja afuera las lápidas', () => {
    expect(backup.accounts.map((a) => a.id)).toEqual(['acc-activa', 'acc-archivada']);
    expect(backup.transactions).toEqual([expense]);
  });

  it('conserva los documentos completos, con sus IDs', () => {
    expect(backup.categories).toEqual([category]);
    expect(backup.budgets[0]?.id).toBe('cat-comida_ARS');
    expect(backup.recurring).toHaveLength(1);
  });
});

describe('exportFileName', () => {
  it('usa la fecha local y la extensión', () => {
    expect(exportFileName('2026-10-04', 'json')).toBe('finanzas_2026-10-04.json');
    expect(exportFileName('2026-10-04', 'zip')).toBe('finanzas_2026-10-04.zip');
  });
});
