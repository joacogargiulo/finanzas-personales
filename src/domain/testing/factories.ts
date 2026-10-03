// Fábricas de datos para los tests: crean documentos válidos con valores por defecto,
// y cada test cambia solo lo que le importa: `makeAccount({ currency: 'USD' })`.
// No se usan en la app.

import type {
  Account,
  Budget,
  Category,
  ExchangeTransaction,
  IncomeExpenseRecurring,
  IncomeExpenseTransaction,
  TransferRecurring,
  TransferTransaction,
} from '../model';

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${String(counter)}`;
}

const base = () => ({
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  deletedAt: null,
});

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: nextId('acc'),
    name: 'Efectivo',
    currency: 'ARS',
    initialBalance: 0,
    kind: 'cash',
    archivedAt: null,
    ...base(),
    ...overrides,
  };
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: nextId('cat'),
    name: 'Comida',
    type: 'expense',
    icon: 'food',
    color: 'orange',
    archivedAt: null,
    ...base(),
    ...overrides,
  };
}

/** Cambios a un movimiento; la cuenta siempre hay que indicarla. */
type TxOverrides<T> = Partial<T> & { accountId: string };

export function makeExpense(
  overrides: TxOverrides<IncomeExpenseTransaction> & { categoryId: string },
): IncomeExpenseTransaction {
  return {
    id: nextId('tx'),
    type: 'expense',
    amount: 100_00,
    date: '2026-10-01',
    description: '',
    source: 'app',
    ...base(),
    ...overrides,
  };
}

export function makeIncome(
  overrides: TxOverrides<IncomeExpenseTransaction> & { categoryId: string },
): IncomeExpenseTransaction {
  return makeExpense({ type: 'income', ...overrides });
}

export function makeTransfer(
  overrides: TxOverrides<TransferTransaction> & { toAccountId: string },
): TransferTransaction {
  return {
    id: nextId('tx'),
    type: 'transfer',
    amount: 100_00,
    date: '2026-10-01',
    description: '',
    source: 'app',
    ...base(),
    ...overrides,
  };
}

export function makeExchange(
  overrides: TxOverrides<ExchangeTransaction> & { toAccountId: string },
): ExchangeTransaction {
  return {
    id: nextId('tx'),
    type: 'exchange',
    amount: 130_000_00,
    toAmount: 100_00,
    date: '2026-10-01',
    description: '',
    source: 'app',
    ...base(),
    ...overrides,
  };
}

export function makeBudget(overrides: Partial<Budget> & { categoryId: string }): Budget {
  const currency = overrides.currency ?? 'ARS';
  return {
    id: `${overrides.categoryId}_${currency}`,
    currency,
    amount: 100_000_00,
    ...base(),
    ...overrides,
  };
}

export function makeRecurring(
  overrides: Partial<IncomeExpenseRecurring> & { accountId: string; categoryId: string },
): IncomeExpenseRecurring {
  const startDate = overrides.startDate ?? '2026-01-31';
  return {
    id: nextId('rec'),
    type: 'expense',
    amount: 10_000_00,
    description: 'Alquiler',
    frequency: 'monthly',
    startDate,
    nextDate: startDate,
    endDate: null,
    ...base(),
    ...overrides,
  };
}

export function makeTransferRecurring(
  overrides: Partial<TransferRecurring> & { accountId: string; toAccountId: string },
): TransferRecurring {
  const startDate = overrides.startDate ?? '2026-01-31';
  return {
    id: nextId('rec'),
    type: 'transfer',
    amount: 10_000_00,
    description: 'Ahorro',
    frequency: 'monthly',
    startDate,
    nextDate: startDate,
    endDate: null,
    ...base(),
    ...overrides,
  };
}
