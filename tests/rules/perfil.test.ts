import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore';
import { describe, it } from 'vitest';
import { NOW, OWNER, useRulesEnv, validProfile, without } from './helpers';

// Perfil del usuario: el documento users/{uid} (SRS 4.1, ADR 0008 y 0011).

const { owner, seed } = useRulesEnv();
const path = `users/${OWNER}`;

describe('crear el perfil', () => {
  it('acepta un perfil válido', async () => {
    await assertSucceeds(setDoc(doc(owner(), path), validProfile()));
  });

  it('acepta la marca de siembra y el ID de la hoja de Sheets', async () => {
    const data = { ...validProfile(), seededAt: NOW, sheetsSpreadsheetId: '1AbC-d_E2' };
    await assertSucceeds(setDoc(doc(owner(), path), data));
  });

  // Cada fila cambia un solo campo por un valor inválido.
  it.each<[string, DocumentData]>([
    ['schemaVersion 0', { schemaVersion: 0 }],
    ['schemaVersion con decimales', { schemaVersion: 1.5 }],
    ['schemaVersion como texto', { schemaVersion: '1' }],
    ['seededAt negativo', { seededAt: -1 }],
    ['seededAt como texto', { seededAt: 'ayer' }],
    ['sheetsSpreadsheetId numérico', { sheetsSpreadsheetId: 123 }],
    ['sheetsSpreadsheetId con espacios', { sheetsSpreadsheetId: 'mi hoja' }],
    ['createdAt en 0', { createdAt: 0 }],
    ['createdAt con decimales', { createdAt: 1.5 }],
    // updatedAt tiene que ser la hora del servidor (ADR 0003), no la del dispositivo.
    ['updatedAt en milisegundos del dispositivo', { updatedAt: NOW }],
    ['updatedAt como timestamp del dispositivo', { updatedAt: Timestamp.fromMillis(NOW) }],
    ['un campo de más', { theme: 'dark' }],
  ])('rechaza %s', async (_label, change) => {
    await assertFails(setDoc(doc(owner(), path), { ...validProfile(), ...change }));
  });

  it.each(['schemaVersion', 'seededAt', 'sheetsSpreadsheetId', 'createdAt', 'updatedAt'])(
    'rechaza un perfil sin %s',
    async (field) => {
      await assertFails(setDoc(doc(owner(), path), without(validProfile(), field)));
    },
  );
});

describe('editar el perfil', () => {
  it('acepta marcar la siembra', async () => {
    await seed(path, validProfile());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { seededAt: NOW, updatedAt: serverTimestamp() }),
    );
  });

  it('acepta subir schemaVersion', async () => {
    await seed(path, validProfile());
    await assertSucceeds(
      updateDoc(doc(owner(), path), { schemaVersion: 2, updatedAt: serverTimestamp() }),
    );
  });

  // Una app vieja no puede "bajar" el esquema (ADR 0011).
  it('rechaza bajar schemaVersion', async () => {
    await seed(path, { ...validProfile(), schemaVersion: 2 });
    await assertFails(
      updateDoc(doc(owner(), path), { schemaVersion: 1, updatedAt: serverTimestamp() }),
    );
  });

  it('rechaza cambiar createdAt', async () => {
    await seed(path, validProfile());
    await assertFails(
      updateDoc(doc(owner(), path), { createdAt: NOW + 1, updatedAt: serverTimestamp() }),
    );
  });

  // Toda edición tiene que renovar updatedAt; si no, el otro dispositivo nunca la vería.
  it('rechaza una edición que no actualiza updatedAt', async () => {
    await seed(path, validProfile());
    await assertFails(updateDoc(doc(owner(), path), { seededAt: NOW }));
  });
});
