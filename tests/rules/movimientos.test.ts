import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { describe, it } from 'vitest';
import {
  NOW,
  OWNER,
  useRulesEnv,
  validExchange,
  validExpense,
  validTransfer,
  without,
} from './helpers';

// Movimientos: users/{uid}/transactions/{id} (SRS 4.4). Es una unión discriminada por `type`
// (ADR 0007): cada tipo tiene su lista exacta de campos, y los que no le corresponden no existen.

const { owner, seed } = useRulesEnv();
const path = `users/${OWNER}/transactions/tx1`;

const validIncome = (): DocumentData => ({
  ...validExpense(),
  type: 'income',
  categoryId: 'seed_salario',
});

describe('campos de cada tipo de movimiento', () => {
  it.each<[string, () => DocumentData]>([
    ['un gasto', validExpense],
    ['un ingreso', validIncome],
    ['una transferencia', validTransfer],
    ['un cambio de moneda', validExchange],
  ])('acepta %s válido', async (_label, valid) => {
    await assertSucceeds(setDoc(doc(owner(), path), valid()));
  });

  // recurringId es opcional en todos los tipos: aparece si el movimiento salió de un recurrente.
  it.each<[string, () => DocumentData]>([
    ['un gasto', validExpense],
    ['una transferencia', validTransfer],
    ['un cambio de moneda', validExchange],
  ])('acepta %s generado por un recurrente', async (_label, valid) => {
    const id = 'rec_r1_2026-10-03';
    const data = { ...valid(), recurringId: 'r1' };
    await assertSucceeds(setDoc(doc(owner(), `users/${OWNER}/transactions/${id}`), data));
  });

  // Campos que sobran: un campo de otro tipo no puede "colarse".
  it.each<[string, DocumentData]>([
    ['un gasto con cuenta destino', { ...validExpense(), toAccountId: 'acc_usd' }],
    ['un ingreso con monto destino', { ...validIncome(), toAmount: 100 }],
    ['una transferencia con categoría', { ...validTransfer(), categoryId: 'seed_comida' }],
    ['una transferencia con monto destino', { ...validTransfer(), toAmount: 100 }],
    ['un cambio con categoría', { ...validExchange(), categoryId: 'seed_comida' }],
    // La moneda sale de la cuenta, no se guarda en el movimiento (ADR 0008).
    ['un gasto con moneda', { ...validExpense(), currency: 'ARS' }],
  ])('rechaza %s', async (_label, data) => {
    await assertFails(setDoc(doc(owner(), path), data));
  });

  // Campos que faltan, por cada tipo.
  const required: [string, () => DocumentData, string[]][] = [
    [
      'gasto',
      validExpense,
      ['type', 'amount', 'date', 'description', 'accountId', 'categoryId', 'source'],
    ],
    ['transferencia', validTransfer, ['toAccountId']],
    ['cambio de moneda', validExchange, ['toAccountId', 'toAmount']],
  ];
  describe.each(required)('%s', (_label, valid, fields) => {
    it.each([...fields, 'createdAt', 'updatedAt', 'deletedAt'])('rechaza sin %s', async (field) => {
      await assertFails(setDoc(doc(owner(), path), without(valid(), field)));
    });
  });
});

describe('valores de cada campo', () => {
  it.each<[string, DocumentData]>([
    ['el monto mínimo (1 centavo)', { amount: 1 }],
    ['el monto máximo', { amount: 99_999_999_999_999 }],
    ['una descripción vacía', { description: '' }],
    ['una descripción de 200 caracteres', { description: 'ñ'.repeat(200) }],
    ['una fecha futura', { date: '2030-12-31' }],
    ['origen voz', { source: 'voice' }],
    ['origen WhatsApp', { source: 'whatsapp' }],
  ])('acepta %s', async (_label, change) => {
    await assertSucceeds(setDoc(doc(owner(), path), { ...validExpense(), ...change }));
  });

  it.each<[string, DocumentData]>([
    ['un tipo que no existe', { type: 'refund' }],
    ['monto 0', { amount: 0 }],
    ['monto negativo', { amount: -500 }],
    // Los montos son centavos enteros (CLAUDE.md, regla 1).
    ['monto con decimales', { amount: 500.5 }],
    ['monto mayor al máximo', { amount: 100_000_000_000_000 }],
    ['monto como texto', { amount: '500' }],
    ['mes 13', { date: '2026-13-01' }],
    ['día 32', { date: '2026-10-32' }],
    ['fecha sin ceros', { date: '2026-1-5' }],
    ['fecha en formato argentino', { date: '03/10/2026' }],
    ['una descripción de 201 caracteres', { description: 'a'.repeat(201) }],
    ['un origen que no existe', { source: 'sms' }],
    ['una cuenta vacía', { accountId: '' }],
    ['una cuenta con barra', { accountId: 'a/b' }],
    ['recurringId numérico', { recurringId: 7 }],
  ])('rechaza %s', async (_label, change) => {
    await assertFails(setDoc(doc(owner(), path), { ...validExpense(), ...change }));
  });

  it('rechaza un cambio de moneda con monto destino 0', async () => {
    await assertFails(setDoc(doc(owner(), path), { ...validExchange(), toAmount: 0 }));
  });

  it.each<[string, () => DocumentData]>([
    ['una transferencia', validTransfer],
    ['un cambio de moneda', validExchange],
  ])('rechaza %s a la misma cuenta', async (_label, valid) => {
    const data = valid() as { accountId: string };
    await assertFails(setDoc(doc(owner(), path), { ...data, toAccountId: data.accountId }));
  });
});

describe('editar un movimiento', () => {
  it('acepta cambiar el monto, la fecha y la descripción', async () => {
    await seed(path, validExpense());
    await assertSucceeds(
      updateDoc(doc(owner(), path), {
        amount: 70_000,
        date: '2026-10-02',
        description: 'Verdulería',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  // Al cambiar el tipo se quitan los campos que dejan de aplicar (ADR 0007, SRS 6.7).
  it('acepta pasar de gasto a transferencia quitando la categoría', async () => {
    await seed(path, validExpense());
    await assertSucceeds(
      updateDoc(doc(owner(), path), {
        type: 'transfer',
        toAccountId: 'acc_sueldo',
        categoryId: deleteField(),
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('rechaza pasar de gasto a transferencia sin quitar la categoría', async () => {
    await seed(path, validExpense());
    await assertFails(
      updateDoc(doc(owner(), path), {
        type: 'transfer',
        toAccountId: 'acc_sueldo',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('acepta eliminarlo (lápida)', async () => {
    await seed(path, validExpense());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { deletedAt: NOW, updatedAt: serverTimestamp() }),
    );
  });

  it.each<[string, DocumentData]>([
    ['cambiar el origen', { source: 'voice' }],
    ['cambiar createdAt', { createdAt: NOW + 1 }],
  ])('rechaza %s', async (_label, change) => {
    await seed(path, validExpense());
    await assertFails(updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }));
  });

  it('rechaza una edición que no actualiza updatedAt', async () => {
    await seed(path, validExpense());
    await assertFails(updateDoc(doc(owner(), path), { amount: 70_000 }));
  });
});
