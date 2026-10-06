import { describe, expect, it } from 'vitest';
import { errorMessage, type DomainError, type DomainErrorCode } from './errors';

describe('errorMessage', () => {
  // Los mensajes con datos los muestran formateados (SRS 5.5).
  it('arma el mensaje de archivar con el saldo formateado', () => {
    expect(
      errorMessage({ code: 'archive.nonZeroBalance', balance: 2_000_00, currency: 'USD' }),
    ).toBe(
      'Esta cuenta tiene un saldo de US$ 2.000,00. Transferilo a otra cuenta antes de archivarla.',
    );
  });

  it('arma el mensaje de restaurar con el nombre (ADR 0005)', () => {
    expect(errorMessage({ code: 'restore.accountNameTaken', name: 'Efectivo' })).toBe(
      'Ya tenés una cuenta activa llamada Efectivo. Elegí otro nombre para restaurarla.',
    );
  });

  // Un ejemplo de cada código. `satisfies Record<...>` hace que TypeScript avise si falta alguno,
  // y el test verifica que ningún texto quede vacío.
  const examples = {
    'amount.required': { code: 'amount.required' },
    'amount.invalid': { code: 'amount.invalid' },
    'amount.tooManyDecimals': { code: 'amount.tooManyDecimals' },
    'amount.notPositive': { code: 'amount.notPositive' },
    'amount.tooLarge': { code: 'amount.tooLarge' },
    'date.invalid': { code: 'date.invalid' },
    'date.endBeforeStart': { code: 'date.endBeforeStart' },
    'name.required': { code: 'name.required' },
    'name.tooLong': { code: 'name.tooLong', max: 50 },
    'name.duplicateAccount': { code: 'name.duplicateAccount', name: 'Efectivo' },
    'name.duplicateCategory': { code: 'name.duplicateCategory', name: 'Comida' },
    'description.tooLong': { code: 'description.tooLong', max: 200 },
    'account.required': { code: 'account.required' },
    'account.missing': { code: 'account.missing' },
    'account.archived': { code: 'account.archived', name: 'Vieja' },
    'account.sameAsOrigin': { code: 'account.sameAsOrigin' },
    'account.currencyMismatch': { code: 'account.currencyMismatch' },
    'account.sameCurrency': { code: 'account.sameCurrency' },
    'category.required': { code: 'category.required' },
    'category.missing': { code: 'category.missing' },
    'category.archived': { code: 'category.archived', name: 'Ocio' },
    'category.typeMismatch': { code: 'category.typeMismatch' },
    'transaction.lockedByArchivedAccount': {
      code: 'transaction.lockedByArchivedAccount',
      name: 'Vieja',
    },
    'archive.nonZeroBalance': { code: 'archive.nonZeroBalance', balance: 1, currency: 'ARS' },
    'delete.inUse': { code: 'delete.inUse' },
    'category.typeLocked': { code: 'category.typeLocked' },
    'restore.accountNameTaken': { code: 'restore.accountNameTaken', name: 'Efectivo' },
    'restore.categoryNameTaken': { code: 'restore.categoryNameTaken', name: 'Comida' },
    'deletion.pendingWrites': { code: 'deletion.pendingWrites' },
    'deletion.notSynced': { code: 'deletion.notSynced' },
  } as const satisfies { [C in DomainErrorCode]: Extract<DomainError, { code: C }> };

  it.each(Object.values(examples))('$code tiene texto', (error: DomainError) => {
    expect(errorMessage(error).length).toBeGreaterThan(10);
  });
});
