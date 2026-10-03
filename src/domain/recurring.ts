// Movimientos recurrentes: calendario, pendientes y nextDate (SRS 5.10, ADR 0004 y 0009).
// Los recurrentes nunca se cargan solos: la app muestra los pendientes y el usuario confirma o salta.

import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  daysBetween,
  monthsBetween,
  parseLocalDate,
} from './dates';
import type { DomainError } from './errors';
import type { Account, Category, LocalDate, Recurring } from './model';
import { err, ok, type Result } from './result';
import type { TransactionDraft } from './validation';

/** Lo que define el calendario de un recurrente. */
export type Schedule = Pick<Recurring, 'frequency' | 'startDate'>;

/** La ocurrencia número `n` (0 = `startDate`). */
function occurrence(schedule: Schedule, n: number): LocalDate {
  const { startDate } = schedule;
  switch (schedule.frequency) {
    case 'weekly':
      return addDays(startDate, 7 * n);
    case 'monthly': {
      // Siempre desde startDate con su día como ancla: 31/01 → 28/02 → 31/03 → 30/04.
      const anchorDay = parseLocalDate(startDate)?.day;
      return addMonthsClamped(startDate, n, anchorDay);
    }
    case 'yearly':
      return addYearsClamped(startDate, n);
  }
}

/** Primera ocurrencia estrictamente posterior a `date`. */
export function occurrenceAfter(schedule: Schedule, date: LocalDate): LocalDate {
  if (date < schedule.startDate) return schedule.startDate;
  // Estimación del número de ocurrencia; como mucho hay que avanzar una o dos.
  let n: number;
  switch (schedule.frequency) {
    case 'weekly':
      n = Math.floor(daysBetween(schedule.startDate, date) / 7);
      break;
    case 'monthly':
      n = monthsBetween(schedule.startDate, date);
      break;
    case 'yearly':
      n = Math.floor(monthsBetween(schedule.startDate, date) / 12);
      break;
  }
  let candidate = occurrence(schedule, n);
  while (candidate <= date) {
    n += 1;
    candidate = occurrence(schedule, n);
  }
  return candidate;
}

/** Primera ocurrencia en `date` o después. */
export function occurrenceOnOrAfter(schedule: Schedule, date: LocalDate): LocalDate {
  return occurrenceAfter(schedule, addDays(date, -1));
}

/** Finalizado: la próxima ocurrencia supera `endDate` (SRS 5.10). */
export function isFinished(recurring: Pick<Recurring, 'nextDate' | 'endDate'>): boolean {
  return recurring.endDate !== null && recurring.nextDate > recurring.endDate;
}

/** Existe y no está finalizado: puede generar pendientes. */
export function isRecurringActive(recurring: Recurring): boolean {
  return recurring.deletedAt === null && !isFinished(recurring);
}

/**
 * Ocurrencias pendientes de un recurrente: desde `nextDate` hasta hoy (incluido), sin pasar
 * `endDate`. Si la app no se abrió por un tiempo, aparecen todas por separado.
 */
export function pendingOccurrences(recurring: Recurring, today: LocalDate): LocalDate[] {
  if (recurring.deletedAt !== null) return [];
  const dates: LocalDate[] = [];
  let date = recurring.nextDate;
  while (date <= today && (recurring.endDate === null || date <= recurring.endDate)) {
    dates.push(date);
    date = occurrenceAfter(recurring, date);
  }
  return dates;
}

export interface PendingOccurrence {
  recurring: Recurring;
  date: LocalDate;
}

/** Los pendientes de todos los recurrentes, del más viejo al más nuevo (Dashboard, SRS 6.3). */
export function allPendingOccurrences(
  recurrings: readonly Recurring[],
  today: LocalDate,
): PendingOccurrence[] {
  return recurrings
    .flatMap((recurring) =>
      pendingOccurrences(recurring, today).map((date) => ({ recurring, date })),
    )
    .sort((a, b) =>
      a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.recurring.id < b.recurring.id ? -1 : 1,
    );
}

/**
 * `nextDate` después de confirmar o saltar la ocurrencia `occurrenceDate`: la siguiente a la
 * confirmada, no la siguiente al `nextDate` actual. Así es idempotente: si dos dispositivos
 * confirman la misma ocurrencia, escriben el mismo valor (ADR 0004, TC-14).
 */
export function nextDateAfter(schedule: Schedule, occurrenceDate: LocalDate): LocalDate {
  return occurrenceAfter(schedule, occurrenceDate);
}

/**
 * `nextDate` al editar la frecuencia o `startDate`: la primera fecha del calendario nuevo que sea
 * ≥ al `nextDate` anterior y ≥ al nuevo `startDate`. Lo anterior ya se confirmó o saltó y no
 * vuelve a quedar pendiente (ADR 0009, TC-26).
 */
export function recalculateNextDate(edited: Schedule, previousNextDate: LocalDate): LocalDate {
  return occurrenceOnOrAfter(edited, previousNextDate);
}

/** ID fijo de la ocurrencia: siempre con la fecha de la ocurrencia (ADR 0004). */
export function recurringTransactionId(recurringId: string, occurrenceDate: LocalDate): string {
  return `rec_${recurringId}_${occurrenceDate}`;
}

/**
 * Un pendiente con la cuenta o la categoría archivada (o eliminada) no se puede confirmar:
 * la UI muestra el error con "Editar recurrente" y "Saltar" (ADR 0009).
 */
export function canConfirm(
  recurring: Recurring,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlyMap<string, Category>,
): Result<void, DomainError> {
  const accountIds =
    recurring.type === 'transfer'
      ? [recurring.accountId, recurring.toAccountId]
      : [recurring.accountId];
  for (const id of accountIds) {
    const account = accounts.get(id);
    if (!account || account.deletedAt !== null) return err({ code: 'account.missing' });
    if (account.archivedAt !== null) return err({ code: 'account.archived', name: account.name });
  }
  if (recurring.type !== 'transfer') {
    const category = categories.get(recurring.categoryId);
    if (!category || category.deletedAt !== null) return err({ code: 'category.missing' });
    if (category.archivedAt !== null) {
      return err({ code: 'category.archived', name: category.name });
    }
  }
  return ok(undefined);
}

/** Datos para precargar el modal de transacción al confirmar una ocurrencia (SRS 5.10). */
export function occurrenceDraft(recurring: Recurring, occurrenceDate: LocalDate): TransactionDraft {
  const common = {
    amount: recurring.amount,
    date: occurrenceDate,
    description: recurring.description,
    accountId: recurring.accountId,
  };
  return recurring.type === 'transfer'
    ? { ...common, type: 'transfer', toAccountId: recurring.toAccountId }
    : { ...common, type: recurring.type, categoryId: recurring.categoryId };
}
