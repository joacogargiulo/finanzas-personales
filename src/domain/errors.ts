// Errores del dominio como códigos con datos, y su texto en español (ADR 0014).

import type { Cents, Currency } from './model';
import { formatAmount } from './money';

export type DomainError =
  // Montos (SRS 5.1)
  | { code: 'amount.required' }
  | { code: 'amount.invalid' }
  | { code: 'amount.tooManyDecimals' }
  | { code: 'amount.notPositive' }
  | { code: 'amount.tooLarge' }
  // Fechas
  | { code: 'date.invalid' }
  | { code: 'date.endBeforeStart' }
  // Textos
  | { code: 'name.required' }
  | { code: 'name.tooLong'; max: number }
  | { code: 'name.duplicateAccount'; name: string }
  | { code: 'name.duplicateCategory'; name: string }
  | { code: 'description.tooLong'; max: number }
  // Cuentas y categorías de un movimiento (SRS 5.3)
  | { code: 'account.required' }
  | { code: 'account.missing' }
  | { code: 'account.archived'; name: string }
  | { code: 'account.sameAsOrigin' }
  | { code: 'account.currencyMismatch' }
  | { code: 'account.sameCurrency' }
  | { code: 'category.required' }
  | { code: 'category.missing' }
  | { code: 'category.archived'; name: string }
  | { code: 'category.typeMismatch' }
  | { code: 'transaction.lockedByArchivedAccount'; name: string }
  // Archivar, eliminar y restaurar (SRS 5.5, 5.6, ADR 0005 y 0009)
  | { code: 'archive.nonZeroBalance'; balance: Cents; currency: Currency }
  | { code: 'delete.inUse' }
  | { code: 'category.typeLocked' }
  | { code: 'restore.accountNameTaken'; name: string }
  | { code: 'restore.categoryNameTaken'; name: string }
  // Borrar mi cuenta (ADR 0006 y 0030)
  | { code: 'deletion.pendingWrites' }
  | { code: 'deletion.notSynced' };

export type DomainErrorCode = DomainError['code'];

/** Texto en español rioplatense para mostrar al usuario. */
export function errorMessage(error: DomainError): string {
  switch (error.code) {
    case 'amount.required':
      return 'Ingresá un monto.';
    case 'amount.invalid':
      return 'Ingresá un número válido, por ejemplo 1500 o 1500,50.';
    case 'amount.tooManyDecimals':
      return 'Usá como máximo 2 decimales y no escribas separador de miles.';
    case 'amount.notPositive':
      return 'El monto tiene que ser mayor a cero.';
    case 'amount.tooLarge':
      return 'El monto máximo es 999.999.999.999,99.';
    case 'date.invalid':
      return 'Ingresá una fecha válida.';
    case 'date.endBeforeStart':
      return 'La fecha de fin tiene que ser igual o posterior a la de inicio.';
    case 'name.required':
      return 'Ingresá un nombre.';
    case 'name.tooLong':
      return `El nombre puede tener hasta ${String(error.max)} caracteres.`;
    case 'name.duplicateAccount':
      return `Ya tenés una cuenta activa llamada ${error.name}.`;
    case 'name.duplicateCategory':
      return `Ya tenés una categoría activa llamada ${error.name}.`;
    case 'description.tooLong':
      return `La descripción puede tener hasta ${String(error.max)} caracteres.`;
    case 'account.required':
      return 'Elegí una cuenta.';
    case 'account.missing':
      return 'La cuenta no existe.';
    case 'account.archived':
      return `La cuenta ${error.name} está archivada.`;
    case 'account.sameAsOrigin':
      return 'La cuenta destino tiene que ser distinta de la de origen.';
    case 'account.currencyMismatch':
      return 'Las dos cuentas tienen que tener la misma moneda. Para cambiar de moneda, usá Cambio.';
    case 'account.sameCurrency':
      return 'Las dos cuentas tienen que tener distinta moneda. Para la misma moneda, usá Transferencia.';
    case 'category.required':
      return 'Elegí una categoría.';
    case 'category.missing':
      return 'La categoría no existe.';
    case 'category.archived':
      return `La categoría ${error.name} está archivada.`;
    case 'category.typeMismatch':
      return 'La categoría no corresponde al tipo de movimiento.';
    case 'transaction.lockedByArchivedAccount':
      return `Este movimiento usa la cuenta archivada ${error.name}. Para modificarlo, restaurá la cuenta.`;
    case 'archive.nonZeroBalance':
      return `Esta cuenta tiene un saldo de ${formatAmount(error.balance, error.currency)}. Transferilo a otra cuenta antes de archivarla.`;
    case 'delete.inUse':
      return 'No se puede eliminar porque tiene movimientos, presupuestos o recurrentes. Podés archivarla.';
    case 'category.typeLocked':
      return 'No se puede cambiar el tipo porque la categoría tiene movimientos, presupuestos o recurrentes.';
    case 'restore.accountNameTaken':
      return `Ya tenés una cuenta activa llamada ${error.name}. Elegí otro nombre para restaurarla.`;
    case 'restore.categoryNameTaken':
      return `Ya tenés una categoría activa llamada ${error.name}. Elegí otro nombre para restaurarla.`;
    case 'deletion.pendingWrites':
      return 'Tenés cambios que todavía no se subieron. Esperá a que se suban para borrar la cuenta.';
    case 'deletion.notSynced':
      return 'Necesitás conexión para borrar la cuenta. Esperá a que la app termine de sincronizar.';
  }
}
