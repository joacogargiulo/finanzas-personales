import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { describe, it } from 'vitest';
import {
  NOW,
  OWNER,
  useRulesEnv,
  validRecurringExpense,
  validRecurringTransfer,
  without,
} from './helpers';

// Recurrentes: users/{uid}/recurring/{id} (SRS 4.6). Unión discriminada como los movimientos,
// pero sin cambio de moneda.

const { owner, seed } = useRulesEnv();
const path = `users/${OWNER}/recurring/rec1`;

describe('crear un recurrente', () => {
  it.each<[string, DocumentData]>([
    ['un gasto mensual', validRecurringExpense()],
    ['un ingreso', { ...validRecurringExpense(), type: 'income', categoryId: 'seed_salario' }],
    ['una transferencia con fecha de fin', validRecurringTransfer()],
    ['uno semanal', { ...validRecurringExpense(), frequency: 'weekly' }],
    ['uno anual', { ...validRecurringExpense(), frequency: 'yearly' }],
    // nextDate igual a startDate: todavía no se confirmó ninguna ocurrencia.
    ['uno recién creado', { ...validRecurringExpense(), nextDate: '2026-01-31' }],
    // nextDate después de endDate: el recurrente terminó.
    [
      'uno finalizado',
      { ...validRecurringTransfer(), endDate: '2026-06-30', nextDate: '2026-07-05' },
    ],
  ])('acepta %s', async (_label, data) => {
    await assertSucceeds(setDoc(doc(owner(), path), data));
  });

  it.each<[string, DocumentData]>([
    // No hay recurrentes de cambio de moneda.
    ['tipo exchange', { ...validRecurringTransfer(), type: 'exchange', toAmount: 100 }],
    ['una transferencia con categoría', { ...validRecurringTransfer(), categoryId: 'seed_comida' }],
    ['un gasto con cuenta destino', { ...validRecurringExpense(), toAccountId: 'acc_usd' }],
    [
      'una transferencia a la misma cuenta',
      { ...validRecurringTransfer(), toAccountId: 'acc_sueldo' },
    ],
    ['frecuencia diaria', { ...validRecurringExpense(), frequency: 'daily' }],
    ['monto 0', { ...validRecurringExpense(), amount: 0 }],
    ['startDate inválida', { ...validRecurringExpense(), startDate: '2026-02-30x' }],
    ['nextDate anterior a startDate', { ...validRecurringExpense(), nextDate: '2025-12-31' }],
    ['endDate anterior a startDate', { ...validRecurringExpense(), endDate: '2025-12-31' }],
    ['endDate como texto vacío', { ...validRecurringExpense(), endDate: '' }],
    ['un campo de más', { ...validRecurringExpense(), source: 'app' }],
  ])('rechaza %s', async (_label, data) => {
    await assertFails(setDoc(doc(owner(), path), data));
  });

  it.each([
    'type',
    'amount',
    'accountId',
    'categoryId',
    'description',
    'frequency',
    'startDate',
    'nextDate',
    'endDate',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ])('rechaza un gasto recurrente sin %s', async (field) => {
    await assertFails(setDoc(doc(owner(), path), without(validRecurringExpense(), field)));
  });

  it('rechaza una transferencia recurrente sin cuenta destino', async () => {
    await assertFails(setDoc(doc(owner(), path), without(validRecurringTransfer(), 'toAccountId')));
  });
});

describe('editar un recurrente', () => {
  it.each<[string, DocumentData]>([
    // Confirmar o saltar una ocurrencia avanza nextDate (ADR 0004).
    ['avanzar nextDate', { nextDate: '2026-11-30' }],
    ['cambiar la frecuencia', { frequency: 'weekly' }],
    ['cambiar el monto', { amount: 1_800_000 }],
    ['ponerle fecha de fin', { endDate: '2026-12-31' }],
    ['eliminarlo (lápida)', { deletedAt: NOW }],
  ])('acepta %s', async (_label, change) => {
    await seed(path, validRecurringExpense());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }),
    );
  });

  it('rechaza cambiar createdAt', async () => {
    await seed(path, validRecurringExpense());
    await assertFails(
      updateDoc(doc(owner(), path), { createdAt: NOW + 1, updatedAt: serverTimestamp() }),
    );
  });
});
