import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';

// Estos tests corren contra el emulador de Firestore con las reglas de firestore.rules.
// En la Fase 0 las reglas niegan todo; en la Fase 2 se reemplazan por las reales.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-finanzas',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

describe('reglas iniciales: nadie accede a nada', () => {
  // Tres tipos de cliente: el dueño de los datos, otro usuario con sesión y alguien sin sesión.
  const clients = [
    ['el dueño', () => env.authenticatedContext('ana').firestore()],
    ['otro usuario', () => env.authenticatedContext('beto').firestore()],
    ['un usuario sin sesión', () => env.unauthenticatedContext().firestore()],
  ] as const;

  describe.each(clients)('%s', (_name, getDb) => {
    it('no puede leer users/ana', async () => {
      await assertFails(getDoc(doc(getDb(), 'users/ana')));
    });

    it('no puede escribir users/ana', async () => {
      await assertFails(setDoc(doc(getDb(), 'users/ana'), { schemaVersion: 1 }));
    });
  });
});
