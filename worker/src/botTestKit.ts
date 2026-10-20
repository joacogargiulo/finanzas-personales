// Piezas falsas para probar el bot (bot.ts) y el webhook (whatsapp.ts): una persona vinculada,
// su perfil con cuentas y categorías, y dependencias que solo registran lo que se les pide.
// Solo se usa en los tests.

import { vi } from 'vitest';
import { SCHEMA_VERSION } from '../../src/domain/model';
import { SEED_CATEGORIES } from '../../src/domain/seed';
import { makeAccount, makeCategory } from '../../src/domain/testing/factories';
import type { BotDeps } from './bot';
import type { UserContext } from './firestoreRest';
import { fakeStore, type FakeStore } from './fakeStore';

export const ANA = '5491111111111';
export const ANA_UID = 'ana';
export const ANA_EMAIL = 'familia@example.org';
export const NOW = new Date('2026-10-14T15:00:00Z');
export const TODAY = '2026-10-14';

/** El perfil de Ana: una cuenta en pesos, una en dólares y las categorías iniciales. */
export function anaContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: [
      makeAccount({ id: 'cash', name: 'Efectivo' }),
      makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' }),
    ],
    categories: SEED_CATEGORIES.map((c) => makeCategory({ ...c })),
    ...overrides,
  };
}

/** La respuesta cruda de la IA para "gasté 18 mil en el súper con efectivo". */
export const SUPER_ANSWER = {
  type: 'expense',
  amount: '18000',
  toAmount: null,
  currency: null,
  date: TODAY,
  accountId: 'cash',
  toAccountId: null,
  categoryId: 'seed_comida',
  description: 'Súper',
};

export interface BotKit {
  store: FakeStore;
  quotaStore: FakeStore;
  deps: BotDeps;
  mocks: {
    interpret: ReturnType<typeof vi.fn>;
    transcribe: ReturnType<typeof vi.fn>;
    readContext: ReturnType<typeof vi.fn>;
    createTransaction: ReturnType<typeof vi.fn>;
  };
}

/** Un bot con Ana ya vinculada y todo funcionando; cada test cambia lo que le importa. */
export function botKit(): BotKit {
  const store = fakeStore({
    [`tel:${ANA}`]: ANA_UID,
    [`uid:${ANA_UID}`]: ANA,
    [`email:${ANA_UID}`]: ANA_EMAIL,
  });
  const quotaStore = fakeStore();
  const mocks = {
    interpret: vi.fn((): Promise<unknown> => Promise.resolve(SUPER_ANSWER)),
    transcribe: vi.fn((): Promise<string | null> => Promise.resolve('gasté 18 mil en el súper')),
    readContext: vi.fn((): Promise<UserContext | null> => Promise.resolve(anaContext())),
    createTransaction: vi.fn((): Promise<'created' | 'exists'> => Promise.resolve('created')),
  };
  const deps: BotDeps = {
    store,
    quota: quotaStore,
    dailyLimit: 40,
    isAllowed: (email) => Promise.resolve(email === ANA_EMAIL),
    interpret: mocks.interpret,
    transcribe: mocks.transcribe,
    readContext: mocks.readContext,
    createTransaction: mocks.createTransaction,
    now: () => NOW,
  };
  return { store, quotaStore, deps, mocks };
}
