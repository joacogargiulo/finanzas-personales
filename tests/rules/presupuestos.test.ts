import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { NOW, OWNER, useRulesEnv, validBudget, without } from './helpers';

// Presupuestos: users/{uid}/budgets/{categoryId}_{currency} (SRS 4.5, ADR 0004).
// El ID fijo hace que haya un solo presupuesto por categoría y moneda, aunque se cree
// desde dos dispositivos a la vez.

const { owner, seed } = useRulesEnv();
const budgetsPath = `users/${OWNER}/budgets`;
const path = `${budgetsPath}/seed_comida_ARS`;

describe('crear un presupuesto', () => {
  it('acepta un presupuesto válido', async () => {
    await assertSucceeds(setDoc(doc(owner(), path), validBudget()));
  });

  it('acepta el mismo categoryId en otra moneda', async () => {
    await assertSucceeds(
      setDoc(doc(owner(), `${budgetsPath}/seed_comida_USD`), { ...validBudget(), currency: 'USD' }),
    );
  });

  it.each<[string, string, DocumentData]>([
    ['un ID de otra categoría', 'seed_ocio_ARS', validBudget()],
    ['un ID de otra moneda', 'seed_comida_USD', validBudget()],
    ['un ID aleatorio', 'x7Gk2', validBudget()],
  ])('rechaza %s', async (_label, id, data) => {
    await assertFails(setDoc(doc(owner(), `${budgetsPath}/${id}`), data));
  });

  it.each<[string, DocumentData]>([
    ['monto 0', { amount: 0 }],
    ['monto con decimales', { amount: 10.5 }],
    ['un campo de más', { period: 'monthly' }],
  ])('rechaza %s', async (_label, change) => {
    await assertFails(setDoc(doc(owner(), path), { ...validBudget(), ...change }));
  });

  it.each(['categoryId', 'currency', 'amount', 'createdAt', 'updatedAt', 'deletedAt'])(
    'rechaza un presupuesto sin %s',
    async (field) => {
      await assertFails(setDoc(doc(owner(), path), without(validBudget(), field)));
    },
  );
});

describe('editar un presupuesto', () => {
  it.each<[string, DocumentData]>([
    ['cambiar el límite', { amount: 20_000_000 }],
    ['eliminarlo (lápida)', { deletedAt: NOW }],
  ])('acepta %s', async (_label, change) => {
    await seed(path, validBudget());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }),
    );
  });

  // Volver a crear un presupuesto eliminado lo "revive" con el mismo ID (ADR 0004).
  it('acepta revivir un presupuesto eliminado', async () => {
    await seed(path, { ...validBudget(), deletedAt: NOW });
    await assertSucceeds(setDoc(doc(owner(), path), { ...validBudget(), amount: 5_000_000 }));
  });

  it.each<[string, DocumentData]>([
    ['cambiar la categoría', { categoryId: 'seed_ocio' }],
    ['cambiar la moneda', { currency: 'USD' }],
    ['cambiar createdAt', { createdAt: NOW + 1 }],
  ])('rechaza %s', async (_label, change) => {
    await seed(path, validBudget());
    await assertFails(updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }));
  });
});
