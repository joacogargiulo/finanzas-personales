import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc, type DocumentData } from 'firebase/firestore';
import { describe, it } from 'vitest';
import { NOW, OWNER, useRulesEnv, validAccount, without } from './helpers';

// Cuentas: users/{uid}/accounts/{id} (SRS 4.2).

const { owner, seed } = useRulesEnv();
const path = `users/${OWNER}/accounts/acc_efectivo`;

describe('crear una cuenta', () => {
  it.each<[string, DocumentData]>([
    ['una cuenta válida', {}],
    ['saldo inicial 0', { initialBalance: 0 }],
    ['saldo inicial máximo', { initialBalance: 99_999_999_999_999 }],
    ['moneda USD', { currency: 'USD' }],
    ['moneda EUR', { currency: 'EUR' }],
    ['tipo banco', { kind: 'bank' }],
    ['tipo billetera', { kind: 'wallet' }],
    ['tipo inversión', { kind: 'investment' }],
    ['tipo otro', { kind: 'other' }],
    ['una cuenta archivada', { archivedAt: NOW }],
    ['una lápida', { deletedAt: NOW }],
    ['un nombre de 50 caracteres', { name: 'a'.repeat(50) }],
    // El dominio cuenta el largo con `.length` de JavaScript (unidades UTF-16). Estos nombres
    // son válidos para el dominio, así que las reglas también tienen que aceptarlos.
    ['un nombre de 50 letras con tilde', { name: 'á'.repeat(50) }],
    ['un nombre de 25 emojis (50 para JavaScript)', { name: '💰'.repeat(25) }],
    ['un nombre con espacios en el medio', { name: 'Caja de ahorro' }],
  ])('acepta %s', async (_label, change) => {
    await assertSucceeds(setDoc(doc(owner(), path), { ...validAccount(), ...change }));
  });

  it.each<[string, DocumentData]>([
    ['un nombre vacío', { name: '' }],
    ['un nombre de 51 caracteres', { name: 'a'.repeat(51) }],
    ['un espacio al inicio del nombre', { name: ' Efectivo' }],
    ['un espacio al final del nombre', { name: 'Efectivo ' }],
    ['un nombre numérico', { name: 123 }],
    ['una moneda que no está en la lista', { currency: 'BRL' }],
    ['saldo inicial negativo', { initialBalance: -1 }],
    ['saldo inicial con decimales', { initialBalance: 1.5 }],
    ['saldo inicial mayor al máximo', { initialBalance: 100_000_000_000_000 }],
    ['saldo inicial como texto', { initialBalance: '100' }],
    ['un tipo que no está en la lista', { kind: 'card' }],
    ['archivedAt como texto', { archivedAt: 'hoy' }],
    ['deletedAt en 0', { deletedAt: 0 }],
    // El saldo se calcula, nunca se guarda (CLAUDE.md, regla 2).
    ['un campo balance', { balance: 0 }],
  ])('rechaza %s', async (_label, change) => {
    await assertFails(setDoc(doc(owner(), path), { ...validAccount(), ...change }));
  });

  it.each([
    'name',
    'currency',
    'initialBalance',
    'kind',
    'archivedAt',
    'createdAt',
    'updatedAt',
    'deletedAt',
  ])('rechaza una cuenta sin %s', async (field) => {
    await assertFails(setDoc(doc(owner(), path), without(validAccount(), field)));
  });
});

describe('editar una cuenta', () => {
  it.each<[string, DocumentData]>([
    ['renombrarla', { name: 'Billetera' }],
    ['cambiar el tipo', { kind: 'wallet' }],
    ['archivarla', { archivedAt: NOW }],
    ['eliminarla (lápida)', { deletedAt: NOW }],
  ])('acepta %s', async (_label, change) => {
    await seed(path, validAccount());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }),
    );
  });

  it.each<[string, DocumentData]>([
    ['cambiar la moneda', { currency: 'USD' }],
    ['cambiar el saldo inicial', { initialBalance: 0 }],
    ['cambiar createdAt', { createdAt: NOW + 1 }],
  ])('rechaza %s', async (_label, change) => {
    await seed(path, validAccount());
    await assertFails(updateDoc(doc(owner(), path), { ...change, updatedAt: serverTimestamp() }));
  });

  it('rechaza una edición que no actualiza updatedAt', async () => {
    await seed(path, validAccount());
    await assertFails(updateDoc(doc(owner(), path), { name: 'Billetera' }));
  });
});
