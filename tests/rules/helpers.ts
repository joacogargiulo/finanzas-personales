import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, type DocumentData } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach } from 'vitest';

// Utilidades compartidas por los tests de reglas. Cada archivo de test llama a `useRulesEnv()`,
// que levanta un entorno con las reglas de firestore.rules y vacía la base antes de cada test.

/** Dueño de los datos en todos los tests. */
export const OWNER = 'ana';
/** Otro usuario con sesión iniciada. */
export const OTHER = 'beto';

/** Un instante fijo para `createdAt`, `archivedAt` y `deletedAt` (milisegundos epoch). */
export const NOW = 1_759_500_000_000;

/** La base de datos que da el paquete de testing (se usa con las funciones de firebase/firestore). */
type TestFirestore = ReturnType<RulesTestContext['firestore']>;

export interface RulesClients {
  /** Base de datos vista por el dueño (con sesión de `OWNER`). */
  owner: () => TestFirestore;
  /** Base de datos vista por otro usuario con sesión. */
  other: () => TestFirestore;
  /** Base de datos vista por alguien sin sesión. */
  anonymous: () => TestFirestore;
  /** Escribe un documento salteando las reglas, para preparar el escenario de un test. */
  seed: (path: string, data: DocumentData) => Promise<void>;
}

export function useRulesEnv(): RulesClients {
  let env: RulesTestEnvironment | undefined;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-finanzas',
      firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await getEnv().clearFirestore();
  });

  afterAll(async () => {
    await env?.cleanup();
  });

  function getEnv(): RulesTestEnvironment {
    if (!env) throw new Error('El entorno de reglas todavía no se inicializó');
    return env;
  }

  return {
    owner: () => getEnv().authenticatedContext(OWNER).firestore(),
    other: () => getEnv().authenticatedContext(OTHER).firestore(),
    anonymous: () => getEnv().unauthenticatedContext().firestore(),
    seed: (path, data) =>
      getEnv().withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), path), data);
      }),
  };
}

/** Copia de `data` sin los campos indicados (para probar campos faltantes). */
export function without(data: DocumentData, ...keys: string[]): DocumentData {
  return Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));
}

// ── Documentos válidos ────────────────────────────────────────────────────────
// Cada test parte de uno de estos y cambia un solo campo, así queda claro qué se prueba.

export function validProfile(): DocumentData {
  return {
    schemaVersion: 1,
    seededAt: null,
    sheetsSpreadsheetId: null,
    createdAt: NOW,
    updatedAt: serverTimestamp(),
  };
}

function common(): DocumentData {
  return { createdAt: NOW, updatedAt: serverTimestamp(), deletedAt: null };
}

export function validAccount(): DocumentData {
  return {
    name: 'Efectivo',
    currency: 'ARS',
    initialBalance: 200_000,
    kind: 'cash',
    archivedAt: null,
    ...common(),
  };
}

export function validCategory(): DocumentData {
  return {
    name: 'Comida',
    type: 'expense',
    icon: 'food',
    color: 'orange',
    archivedAt: null,
    ...common(),
  };
}

export function validExpense(): DocumentData {
  return {
    type: 'expense',
    amount: 50_000,
    date: '2026-10-03',
    description: 'Súper',
    accountId: 'acc_efectivo',
    categoryId: 'seed_comida',
    source: 'app',
    ...common(),
  };
}

export function validTransfer(): DocumentData {
  return {
    type: 'transfer',
    amount: 100_000,
    date: '2026-10-03',
    description: '',
    accountId: 'acc_sueldo',
    toAccountId: 'acc_efectivo',
    source: 'app',
    ...common(),
  };
}

export function validExchange(): DocumentData {
  return {
    type: 'exchange',
    amount: 13_000_000,
    toAmount: 10_000,
    date: '2026-10-03',
    description: 'Compra de dólares',
    accountId: 'acc_efectivo',
    toAccountId: 'acc_usd',
    source: 'app',
    ...common(),
  };
}

export function validBudget(): DocumentData {
  return { categoryId: 'seed_comida', currency: 'ARS', amount: 10_000_000, ...common() };
}

export function validRecurringExpense(): DocumentData {
  return {
    type: 'expense',
    amount: 1_500_000,
    accountId: 'acc_sueldo',
    categoryId: 'seed_servicios',
    description: 'Internet',
    frequency: 'monthly',
    startDate: '2026-01-31',
    nextDate: '2026-10-31',
    endDate: null,
    ...common(),
  };
}

export function validRecurringTransfer(): DocumentData {
  return {
    type: 'transfer',
    amount: 5_000_000,
    accountId: 'acc_sueldo',
    toAccountId: 'acc_ahorro',
    description: 'Ahorro mensual',
    frequency: 'monthly',
    startDate: '2026-01-05',
    nextDate: '2026-11-05',
    endDate: '2026-12-31',
    ...common(),
  };
}
