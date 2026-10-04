import { describe, expect, it } from 'vitest';
import { indexById } from './collections';
import type { Frequency } from './model';
import {
  allPendingOccurrences,
  canConfirm,
  isFinished,
  nextDateAfter,
  occurrenceAfter,
  occurrenceDraft,
  parseOccurrenceId,
  pendingOccurrences,
  recalculateNextDate,
  recurringTransactionId,
} from './recurring';
import {
  makeAccount,
  makeCategory,
  makeRecurring,
  makeTransferRecurring,
} from './testing/factories';

/** Las primeras `count` ocurrencias, avanzando de a una. */
function firstOccurrences(frequency: Frequency, startDate: string, count: number): string[] {
  const schedule = { frequency, startDate };
  const dates = [startDate];
  while (dates.length < count) dates.push(occurrenceAfter(schedule, dates.at(-1) ?? startDate));
  return dates;
}

describe('calendario de ocurrencias (SRS 5.10)', () => {
  it('semanal: cada 7 días', () => {
    expect(firstOccurrences('weekly', '2026-12-24', 3)).toEqual([
      '2026-12-24',
      '2026-12-31',
      '2027-01-07',
    ]);
  });

  // TC-13: el día 31 cae en el último día de los meses más cortos, sin "arrastrarlo".
  it('TC-13: mensual desde el 31/01', () => {
    expect(firstOccurrences('monthly', '2026-01-31', 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
    expect(firstOccurrences('monthly', '2028-01-31', 2)).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('anual: el 29/02 cae en 28/02 los años no bisiestos', () => {
    expect(firstOccurrences('yearly', '2024-02-29', 5)).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });

  // occurrenceAfter funciona desde cualquier fecha, no solo desde otra ocurrencia.
  it('occurrenceAfter desde una fecha cualquiera', () => {
    const monthly = { frequency: 'monthly' as const, startDate: '2026-01-31' };
    expect(occurrenceAfter(monthly, '2025-06-01')).toBe('2026-01-31');
    expect(occurrenceAfter(monthly, '2026-03-15')).toBe('2026-03-31');
    expect(occurrenceAfter(monthly, '2026-03-31')).toBe('2026-04-30');
    const weekly = { frequency: 'weekly' as const, startDate: '2026-10-01' };
    expect(occurrenceAfter(weekly, '2026-10-07')).toBe('2026-10-08');
    expect(occurrenceAfter(weekly, '2026-10-08')).toBe('2026-10-15');
  });
});

describe('pendientes', () => {
  // Una ocurrencia es pendiente si su fecha es ≤ hoy; se listan todas por separado.
  it('lista varias ocurrencias atrasadas', () => {
    const r = makeRecurring({ accountId: 'a', categoryId: 'c', startDate: '2026-01-31' });
    expect(pendingOccurrences(r, '2026-04-29')).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(pendingOccurrences(r, '2026-01-30')).toEqual([]);
  });

  // endDate corta el calendario y, una vez superado, el recurrente queda finalizado.
  it('respeta endDate y detecta el fin', () => {
    const r = makeRecurring({
      accountId: 'a',
      categoryId: 'c',
      startDate: '2026-01-31',
      endDate: '2026-03-01',
    });
    expect(pendingOccurrences(r, '2026-12-31')).toEqual(['2026-01-31', '2026-02-28']);
    expect(isFinished(r)).toBe(false);
    expect(isFinished({ ...r, nextDate: '2026-03-31' })).toBe(true);
  });

  it('un recurrente eliminado no tiene pendientes', () => {
    const r = makeRecurring({ accountId: 'a', categoryId: 'c', deletedAt: 1 });
    expect(pendingOccurrences(r, '2030-01-01')).toEqual([]);
  });

  it('allPendingOccurrences ordena por fecha', () => {
    const a = makeRecurring({ accountId: 'a', categoryId: 'c', startDate: '2026-03-10' });
    const b = makeRecurring({ accountId: 'a', categoryId: 'c', startDate: '2026-03-05' });
    const pending = allPendingOccurrences([a, b], '2026-03-10');
    expect(pending.map((p) => [p.recurring.id, p.date])).toEqual([
      [b.id, '2026-03-05'],
      [a.id, '2026-03-10'],
    ]);
  });
});

describe('confirmar y saltar (ADR 0004)', () => {
  const r = makeRecurring({
    id: 'r1',
    accountId: 'a',
    categoryId: 'c',
    startDate: '2026-01-31',
    nextDate: '2026-02-28',
  });

  // nextDate pasa a ser la siguiente a la confirmada, aunque haya más pendientes atrasados.
  it('nextDate es la ocurrencia siguiente a la confirmada', () => {
    expect(nextDateAfter(r, '2026-02-28')).toBe('2026-03-31');
  });

  // TC-14: dos dispositivos que confirman la misma ocurrencia escriben el mismo ID y el mismo
  // nextDate, así que queda una sola transacción.
  it('TC-14: confirmar dos veces da el mismo resultado', () => {
    const first = {
      id: recurringTransactionId(r.id, '2026-02-28'),
      next: nextDateAfter(r, '2026-02-28'),
    };
    const updated = { ...r, nextDate: first.next };
    const second = {
      id: recurringTransactionId(r.id, '2026-02-28'),
      next: nextDateAfter(updated, '2026-02-28'),
    };
    expect(second).toEqual(first);
    expect(first.id).toBe('rec_r1_2026-02-28');
  });

  // El panel "Confirmar" recibe el ID fijo en la dirección y tiene que recuperar de qué
  // recurrente y de qué fecha es. Los IDs de Firestore pueden tener "_", así que se corta por
  // la fecha del final.
  it('parseOccurrenceId recupera el recurrente y la fecha', () => {
    expect(parseOccurrenceId('rec_r1_2026-02-28')).toEqual({
      recurringId: 'r1',
      date: '2026-02-28',
    });
    expect(parseOccurrenceId(recurringTransactionId('a_b', '2026-01-31'))).toEqual({
      recurringId: 'a_b',
      date: '2026-01-31',
    });
    expect(parseOccurrenceId('r1_2026-02-28')).toBeNull();
    expect(parseOccurrenceId('rec_r1_2026-02-30')).toBeNull();
    expect(parseOccurrenceId('rec__2026-02-28')).toBeNull();
  });

  // El modal se precarga con los datos del recurrente y la fecha de la ocurrencia.
  it('occurrenceDraft', () => {
    expect(occurrenceDraft(r, '2026-02-28')).toEqual({
      type: 'expense',
      amount: r.amount,
      date: '2026-02-28',
      description: 'Alquiler',
      accountId: 'a',
      categoryId: 'c',
    });
    const t = makeTransferRecurring({ accountId: 'a', toAccountId: 'b' });
    expect(occurrenceDraft(t, '2026-01-31')).toMatchObject({ type: 'transfer', toAccountId: 'b' });
  });
});

describe('editar la frecuencia o startDate (ADR 0009)', () => {
  // TC-26: se confirmó la ocurrencia de hoy (nextDate ya es el mes que viene) y se pasa a
  // semanal: la de hoy no vuelve a quedar pendiente.
  it('TC-26: de mensual a semanal sin repetir la ocurrencia confirmada', () => {
    const today = '2026-10-03';
    const r = makeRecurring({ accountId: 'a', categoryId: 'c', startDate: '2026-09-03' });
    const afterConfirm = nextDateAfter(r, today); // 2026-11-03
    const next = recalculateNextDate({ frequency: 'weekly', startDate: r.startDate }, afterConfirm);
    expect(next).toBe('2026-11-05');
    expect(next > today).toBe(true);
  });

  // startDate hacia atrás: el nuevo nextDate igual queda ≥ al anterior.
  it('startDate hacia atrás', () => {
    const next = recalculateNextDate(
      { frequency: 'monthly', startDate: '2026-01-15' },
      '2026-06-20',
    );
    expect(next).toBe('2026-07-15');
  });

  // startDate hacia adelante: el nuevo nextDate es el nuevo startDate.
  it('startDate hacia adelante', () => {
    const next = recalculateNextDate(
      { frequency: 'monthly', startDate: '2026-09-10' },
      '2026-06-20',
    );
    expect(next).toBe('2026-09-10');
  });

  // Si nextDate cae justo en el calendario nuevo, se mantiene (todavía no se confirmó).
  it('mantiene nextDate si coincide con el calendario nuevo', () => {
    const next = recalculateNextDate(
      { frequency: 'weekly', startDate: '2026-10-01' },
      '2026-10-15',
    );
    expect(next).toBe('2026-10-15');
  });
});

describe('canConfirm (ADR 0009)', () => {
  const cash = makeAccount({ name: 'Efectivo' });
  const old = makeAccount({ name: 'Vieja', archivedAt: 1 });
  const food = makeCategory({ name: 'Comida' });
  const oldCat = makeCategory({ name: 'Ocio', archivedAt: 1 });
  const accounts = indexById([cash, old]);
  const categories = indexById([food, oldCat]);

  // Con la cuenta o la categoría archivada, el pendiente no se puede confirmar.
  it.each([
    ['todo activo', makeRecurring({ accountId: cash.id, categoryId: food.id }), null],
    [
      'cuenta archivada',
      makeRecurring({ accountId: old.id, categoryId: food.id }),
      { code: 'account.archived', name: 'Vieja' },
    ],
    [
      'categoría archivada',
      makeRecurring({ accountId: cash.id, categoryId: oldCat.id }),
      { code: 'category.archived', name: 'Ocio' },
    ],
    [
      'destino archivado',
      makeTransferRecurring({ accountId: cash.id, toAccountId: old.id }),
      { code: 'account.archived', name: 'Vieja' },
    ],
    [
      'cuenta inexistente',
      makeRecurring({ accountId: 'nada', categoryId: food.id }),
      { code: 'account.missing' },
    ],
  ])('%s', (_label, recurring, error) => {
    const result = canConfirm(recurring, accounts, categories);
    expect(result.ok ? null : result.error).toEqual(error);
  });
});
