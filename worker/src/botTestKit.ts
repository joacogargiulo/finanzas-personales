// Piezas falsas para probar el bot (bot.ts) y el webhook (whatsapp.ts): una persona vinculada,
// su perfil con cuentas, categorías y movimientos, y dependencias que solo registran lo que se les
// pide. Solo se usa en los tests.

import { vi } from 'vitest';
import { SCHEMA_VERSION, type Transaction } from '../../src/domain/model';
import { SEED_CATEGORIES } from '../../src/domain/seed';
import {
  makeAccount,
  makeCategory,
  makeExpense,
  makeIncome,
} from '../../src/domain/testing/factories';
import type { BotDeps } from './bot';
import type { TransactionsInRange } from './firestoreQueries';
import type { UserContext } from './firestoreRest';
import { fakeStore, type FakeStore } from './fakeStore';

export const ANA = '5491111111111';
export const ANA_UID = 'ana';
export const ANA_EMAIL = 'familia@example.org';
export const NOW = new Date('2026-10-14T15:00:00Z'); // miércoles 14 de octubre, 12:00 en Argentina
export const TODAY = '2026-10-14';

/** El perfil de Ana: dos cuentas en pesos, una en dólares y las categorías iniciales. */
export function anaContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: [
      makeAccount({ id: 'cash', name: 'Efectivo', initialBalance: 100_000 }),
      makeAccount({ id: 'mp', name: 'Mercado Pago', kind: 'wallet' }),
      makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD', initialBalance: 5_000 }),
    ],
    categories: SEED_CATEGORIES.map((c) => makeCategory({ ...c })),
    ...overrides,
  };
}

/** Los movimientos de Ana (octubre de 2026). */
export function anaTransactions(): Transaction[] {
  return [
    makeIncome({
      accountId: 'cash',
      categoryId: 'seed_salario',
      amount: 2_000_000,
      date: '2026-10-01',
    }),
    makeExpense({
      accountId: 'cash',
      categoryId: 'seed_comida',
      amount: 600_000,
      date: '2026-10-05',
    }),
    makeExpense({
      accountId: 'cash',
      categoryId: 'seed_ocio',
      amount: 400_000,
      date: '2026-10-14',
    }),
    makeExpense({ accountId: 'usd', categoryId: 'seed_comida', amount: 2_500, date: '2026-10-07' }),
    makeExpense({
      accountId: 'cash',
      categoryId: 'seed_comida',
      amount: 90_000,
      date: '2026-09-20',
    }),
  ];
}

/** Una respuesta completa de la IA: cada test cambia solo lo que le importa. */
export function aiAnswer(overrides: Record<string, unknown> = {}) {
  return {
    intent: 'movement',
    type: 'expense',
    amount: '18000',
    toAmount: null,
    currency: null,
    date: TODAY,
    accountId: 'cash',
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
    queryKind: null,
    queryPeriod: null,
    reply: '',
    ...overrides,
  };
}

/** La IA entendió "gasté 18 mil en el súper con efectivo". */
export const SUPER_ANSWER = aiAnswer();

export interface BotKit {
  store: FakeStore;
  quotaStore: FakeStore;
  deps: BotDeps;
  /** Los movimientos que "hay" en Firestore: las sumas y los rangos salen de acá. */
  transactions: Transaction[];
  mocks: {
    interpret: ReturnType<typeof vi.fn>;
    transcribe: ReturnType<typeof vi.fn>;
    readContext: ReturnType<typeof vi.fn>;
    createTransaction: ReturnType<typeof vi.fn>;
    sumTransactions: ReturnType<typeof vi.fn>;
    readTransactions: ReturnType<typeof vi.fn>;
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
  const transactions = anaTransactions();
  const field = (tx: Transaction, name: string) => (tx as unknown as Record<string, unknown>)[name];

  const mocks = {
    interpret: vi.fn((): Promise<unknown> => Promise.resolve(SUPER_ANSWER)),
    transcribe: vi.fn((): Promise<string | null> => Promise.resolve('gasté 18 mil en el súper')),
    readContext: vi.fn((): Promise<UserContext | null> => Promise.resolve(anaContext())),
    createTransaction: vi.fn((): Promise<'created' | 'exists'> => Promise.resolve('created')),
    // Una "suma de Firestore" sobre la lista, como la haría una consulta de agregación.
    sumTransactions: vi.fn(
      (
        _uid: string,
        filters: readonly { field: string; equals: string }[],
        name: 'amount' | 'toAmount',
      ): Promise<number> =>
        Promise.resolve(
          transactions
            .filter((tx) => tx.deletedAt === null)
            .filter((tx) => filters.every((f) => field(tx, f.field) === f.equals))
            .reduce((sum, tx) => sum + Number(field(tx, name) ?? 0), 0),
        ),
    ),
    readTransactions: vi.fn(
      (_uid: string, range: { from: string; to: string }): Promise<TransactionsInRange> =>
        Promise.resolve({
          transactions: transactions.filter((tx) => tx.date >= range.from && tx.date <= range.to),
          truncated: false,
        }),
    ),
  };
  const deps: BotDeps = {
    store,
    quota: quotaStore,
    dailyLimit: 100,
    isAllowed: (email) => Promise.resolve(email === ANA_EMAIL),
    interpret: mocks.interpret,
    transcribe: mocks.transcribe,
    readContext: mocks.readContext,
    createTransaction: mocks.createTransaction,
    sumTransactions: mocks.sumTransactions,
    readTransactions: mocks.readTransactions,
    now: () => NOW,
  };
  return { store, quotaStore, deps, transactions, mocks };
}
