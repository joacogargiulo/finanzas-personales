import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { NOW, OWNER, useRulesEnv, validCategory, without } from './helpers';

// Categorías: users/{uid}/categories/{id} (SRS 4.3, ADR 0008).

const { owner, seed } = useRulesEnv();
const path = `users/${OWNER}/categories/seed_comida`;

describe('crear una categoría', () => {
  it.each<[string, DocumentData]>([
    ['una categoría de gasto', {}],
    ['una categoría de ingreso', { type: 'income', name: 'Salario' }],
    ['un nombre de 40 caracteres', { name: 'a'.repeat(40) }],
    ['un nombre de 40 letras con tilde', { name: 'é'.repeat(40) }],
    ['claves de ícono y color con guiones y números', { icon: 'credit-card', color: 'teal-2' }],
    ['una categoría archivada', { archivedAt: NOW }],
  ])('acepta %s', async (_label, change) => {
    await assertSucceeds(setDoc(doc(owner(), path), { ...validCategory(), ...change }));
  });

  it.each<[string, DocumentData]>([
    ['un nombre vacío', { name: '' }],
    ['un nombre de 41 caracteres', { name: 'a'.repeat(41) }],
    ['un nombre con espacio al final', { name: 'Comida ' }],
    // Las categorías son de ingreso o de gasto; no hay categorías de transferencia.
    ['tipo transfer', { type: 'transfer' }],
    // Íconos y colores son claves de una lista, no valores libres (ADR 0008).
    ['un ícono con mayúsculas', { icon: 'Food' }],
    ['un ícono de 31 caracteres', { icon: 'a'.repeat(31) }],
    ['un ícono vacío', { icon: '' }],
    ['un color hexadecimal', { color: '#ff0000' }],
    ['un campo de más', { budget: 100 }],
  ])('rechaza %s', async (_label, change) => {
    await assertFails(setDoc(doc(owner(), path), { ...validCategory(), ...change }));
  });

  it.each(['name', 'type', 'icon', 'color', 'archivedAt', 'createdAt', 'updatedAt', 'deletedAt'])(
    'rechaza una categoría sin %s',
    async (field) => {
      await assertFails(setDoc(doc(owner(), path), without(validCategory(), field)));
    },
  );
});

describe('editar una categoría', () => {
  // Las reglas permiten cambiar el tipo; el dominio lo bloquea si la categoría se usa
  // (ADR 0009), porque eso depende de otros documentos.
  it.each<[string, DocumentData]>([
    ['renombrarla', { name: 'Supermercado' }],
    ['cambiar el tipo', { type: 'income' }],
    ['cambiar ícono y color', { icon: 'cart', color: 'red' }],
    ['archivarla', { archivedAt: NOW }],
    ['restaurarla', { archivedAt: null }],
    ['eliminarla (lápida)', { deletedAt: NOW }],
  ])('acepta %s', async (_label, change) => {
    await seed(path, { ...validCategory(), archivedAt: NOW - 1 });
    await assertSucceeds(
      updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }),
    );
  });

  it('rechaza cambiar createdAt', async () => {
    await seed(path, validCategory());
    await assertFails(
      updateDoc(doc(owner(), path), { createdAt: NOW + 1, updatedAt: serverTimestamp() }),
    );
  });
});
