// Tipos del modelo de datos (Fase M). Solo tipos, sin lógica.
// Fuente: SRS 3.1 sección 4 y ADRs 0002 a 0012.
// La capa domain no importa Firebase: `updatedAt` llega acá como milisegundos,
// convertido por src/data/ desde el timestamp del servidor (estimado si la escritura está pendiente).

/** Monto entero en centavos. `$ 1.234,56` → `123456`. */
export type Cents = number;

/** Fecha calendario local en formato `YYYY-MM-DD`. */
export type LocalDate = string;

/** Milisegundos epoch. */
export type EpochMs = number;

export const CURRENCIES = ['ARS', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ACCOUNT_KINDS = ['cash', 'bank', 'wallet', 'investment', 'other'] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const CATEGORY_TYPES = ['income', 'expense'] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'exchange'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_SOURCES = ['app', 'voice', 'whatsapp'] as const;
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];

export const FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/** Versión del esquema que conoce este build de la app (ADR 0011). */
export const SCHEMA_VERSION = 1;

/** Máximo de cualquier monto: 999.999.999.999,99 (SRS 5.1). */
export const MAX_CENTS: Cents = 99_999_999_999_999;

/** Campos que tienen todos los documentos de las colecciones del usuario. */
interface BaseDoc {
  id: string;
  createdAt: EpochMs;
  /** Hora del servidor; se usa como cursor de sincronización (ADR 0003). */
  updatedAt: EpochMs;
  /** Lápida: `null` = existe; con valor = eliminado e invisible (ADR 0005). */
  deletedAt: EpochMs | null;
}

/** `users/{uid}` (ADR 0008). */
export interface Profile {
  schemaVersion: number;
  seededAt: EpochMs | null;
  sheetsSpreadsheetId: string | null;
  createdAt: EpochMs;
  updatedAt: EpochMs;
}

/** `users/{uid}/accounts/{id}`. El saldo no se guarda: se calcula (SRS 5.2). */
export interface Account extends BaseDoc {
  /** 1–50 caracteres, sin espacios al inicio ni al final. */
  name: string;
  /** Inmutable. */
  currency: Currency;
  /** ≥ 0. Inmutable. */
  initialBalance: Cents;
  kind: AccountKind;
  /** `null` = activa (ADR 0005). */
  archivedAt: EpochMs | null;
}

/** `users/{uid}/categories/{id}`. */
export interface Category extends BaseDoc {
  /** 1–40 caracteres. */
  name: string;
  /** Solo modificable si ningún movimiento, presupuesto ni recurrente la usa (ADR 0009). */
  type: CategoryType;
  /** Clave de una lista fija de íconos (ADR 0008). */
  icon: string;
  /** Clave de una paleta fija (ADR 0008). */
  color: string;
  archivedAt: EpochMs | null;
}

interface BaseTransaction extends BaseDoc {
  /** > 0, en la moneda de `accountId`. */
  amount: Cents;
  date: LocalDate;
  /** Puede ser `''`; máximo 200 caracteres. */
  description: string;
  /** Cuenta principal u origen. */
  accountId: string;
  /** Inmutable. */
  source: TransactionSource;
  /** Solo si se generó desde un recurrente (ID `rec_{recurringId}_{fecha}`, ADR 0004). */
  recurringId?: string;
}

export interface IncomeExpenseTransaction extends BaseTransaction {
  type: 'income' | 'expense';
  categoryId: string;
}

export interface TransferTransaction extends BaseTransaction {
  type: 'transfer';
  /** Misma moneda que `accountId`. */
  toAccountId: string;
}

export interface ExchangeTransaction extends BaseTransaction {
  type: 'exchange';
  /** Distinta moneda que `accountId`. */
  toAccountId: string;
  /** > 0, en la moneda de `toAccountId`. */
  toAmount: Cents;
}

/** `users/{uid}/transactions/{id}`. Unión discriminada por `type` (ADR 0007). */
export type Transaction = IncomeExpenseTransaction | TransferTransaction | ExchangeTransaction;

/** `users/{uid}/budgets/{categoryId}_{currency}`. */
export interface Budget extends BaseDoc {
  /** Categoría de tipo `expense`. Inmutable (forma parte del ID). */
  categoryId: string;
  /** Inmutable (forma parte del ID). */
  currency: Currency;
  /** Límite mensual, > 0. */
  amount: Cents;
}

interface BaseRecurring extends BaseDoc {
  /** Monto sugerido, > 0. */
  amount: Cents;
  accountId: string;
  description: string;
  frequency: Frequency;
  startDate: LocalDate;
  /** Próxima ocurrencia pendiente. */
  nextDate: LocalDate;
  endDate: LocalDate | null;
}

export interface IncomeExpenseRecurring extends BaseRecurring {
  type: 'income' | 'expense';
  categoryId: string;
}

export interface TransferRecurring extends BaseRecurring {
  type: 'transfer';
  toAccountId: string;
}

/** `users/{uid}/recurring/{id}`. No hay recurrentes de cambio de moneda. */
export type Recurring = IncomeExpenseRecurring | TransferRecurring;

/** Cotizaciones en `localStorage`, clave `exchangeRates` (no en Firestore). Decimales: no son montos. */
export interface ExchangeRates {
  USD_ARS: number;
  EUR_ARS: number;
  fetchedAt: EpochMs;
}
