// Escrituras en Firestore (SRS 3.3, ADR 0003, 0004 y 0007).
//
// Reglas de este archivo:
// - Ninguna función espera (`await`) a Firestore. Sin conexión, esa promesa no se resuelve hasta
//   volver a tener señal; la UI se entera del cambio por el listener a la caché (ADR 0016).
// - Las funciones reciben datos ya validados por el dominio (TransactionFields, etc.): validar es
//   trabajo de quien llama, y los tipos obligan a hacerlo.
// - `set()` para crear y `update()` solo con los campos que cambiaron (ADR 0004).
// - Eliminar es marcar `deletedAt` (lápida). El borrado físico existe solo en "Borrar mi cuenta".
// - Si el servidor rechaza una escritura, se avisa con `onError` en vez de perderla en silencio.

import { FirebaseError } from 'firebase/app';
import {
  deleteField,
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import { budgetId } from '../domain/budgets';
import type {
  Account,
  Budget,
  Category,
  LocalDate,
  Recurring,
  Transaction,
  TransactionSource,
} from '../domain/model';
import { nextDateAfter, recalculateNextDate, recurringTransactionId } from '../domain/recurring';
import type { BudgetDraft, RecurringFields, TransactionFields } from '../domain/validation';
import { collectionRef, docRef, profileRef, type UserCollection } from './paths';

export type AccountFields = Pick<Account, 'name' | 'currency' | 'initialBalance' | 'kind'>;
export type AccountChanges = Partial<Pick<Account, 'name' | 'kind'>>;
export type CategoryFields = Pick<Category, 'name' | 'type' | 'icon' | 'color'>;
export type CategoryChanges = Partial<CategoryFields>;

export interface WriteError {
  /** Qué se intentó hacer, por ejemplo "crear accounts/abc123". */
  action: string;
  error: unknown;
}

export interface WriterOptions {
  /** `false` si un dispositivo con una versión más nueva subió el esquema (ADR 0011). */
  canWrite: () => boolean;
  /** El servidor rechazó una escritura (por ejemplo, por las reglas de seguridad). */
  onError: (error: WriteError) => void;
  /** Reloj para `createdAt`, `archivedAt` y `deletedAt`; se reemplaza en los tests. */
  now?: () => number;
}

/** Campos que dependen del tipo de movimiento o recurrente (ADR 0007). */
const TYPE_SPECIFIC_FIELDS = ['categoryId', 'toAccountId', 'toAmount'] as const;

/**
 * Lo que cambió entre `before` y `after`, listo para `update()`. Los campos de `removable` que
 * estaban en `before` y ya no están en `after` se quitan con `deleteField()`.
 */
export function changedFields(
  before: object,
  after: object,
  removable: readonly string[] = [],
): DocumentData {
  const previous = new Map(Object.entries(before) as [string, unknown][]);
  const changes: DocumentData = {};
  for (const [key, value] of Object.entries(after) as [string, unknown][]) {
    if (previous.get(key) !== value) changes[key] = value;
  }
  for (const key of removable) {
    if (previous.has(key) && !(key in after)) changes[key] = deleteField();
  }
  return changes;
}

export function createWriter(db: Firestore, uid: string, options: WriterOptions) {
  const now = options.now ?? Date.now;

  function ensureCanWrite(): void {
    // La UI deshabilita la carga cuando las escrituras están bloqueadas; llegar acá es un error
    // de programación.
    if (!options.canWrite()) {
      throw new Error('Escrituras bloqueadas: hay una versión más nueva de la app (ADR 0011)');
    }
  }

  function report(action: string, write: Promise<void>): void {
    // Sin await: la promesa recién se resuelve cuando el servidor confirma.
    write.catch((error: unknown) => {
      options.onError({ action, error });
    });
  }

  /** Crea un documento con los campos comunes (SRS 4.0) y devuelve su ID. */
  function create(name: UserCollection, fields: object): string {
    ensureCanWrite();
    // El ID se genera en el cliente, así funciona sin conexión (SRS 3.3).
    const ref = doc(collectionRef(db, uid, name));
    report(
      `crear ${name}/${ref.id}`,
      setDoc(ref, { ...fields, createdAt: now(), updatedAt: serverTimestamp(), deletedAt: null }),
    );
    return ref.id;
  }

  function update(name: UserCollection, id: string, changes: DocumentData): void {
    ensureCanWrite();
    if (Object.keys(changes).length === 0) return;
    report(
      `editar ${name}/${id}`,
      updateDoc(docRef(db, uid, name, id), { ...changes, updatedAt: serverTimestamp() }),
    );
  }

  function tombstone(name: UserCollection, id: string): void {
    update(name, id, { deletedAt: now() });
  }

  return {
    // ── Cuentas (SRS 4.2) ────────────────────────────────────────────────────
    createAccount(fields: AccountFields): string {
      return create('accounts', { ...fields, archivedAt: null });
    },
    updateAccount(id: string, changes: AccountChanges): void {
      update('accounts', id, changes);
    },
    archiveAccount(id: string): void {
      update('accounts', id, { archivedAt: now() });
    },
    /** `name` solo si hubo que renombrarla porque el nombre ya estaba en uso (ADR 0005). */
    restoreAccount(id: string, name?: string): void {
      update(
        'accounts',
        id,
        name === undefined ? { archivedAt: null } : { archivedAt: null, name },
      );
    },
    deleteAccount(id: string): void {
      tombstone('accounts', id);
    },

    // ── Categorías (SRS 4.3) ─────────────────────────────────────────────────
    createCategory(fields: CategoryFields): string {
      return create('categories', { ...fields, archivedAt: null });
    },
    updateCategory(id: string, changes: CategoryChanges): void {
      update('categories', id, changes);
    },
    archiveCategory(id: string): void {
      update('categories', id, { archivedAt: now() });
    },
    restoreCategory(id: string, name?: string): void {
      update(
        'categories',
        id,
        name === undefined ? { archivedAt: null } : { archivedAt: null, name },
      );
    },
    deleteCategory(id: string): void {
      tombstone('categories', id);
    },

    // ── Movimientos (SRS 4.4) ────────────────────────────────────────────────
    createTransaction(fields: TransactionFields, source: TransactionSource = 'app'): string {
      return create('transactions', { ...fields, source });
    },
    /** Si cambió el tipo, quita los campos que dejan de aplicar (ADR 0007, SRS 6.7). */
    updateTransaction(original: Transaction, fields: TransactionFields): void {
      update('transactions', original.id, changedFields(original, fields, TYPE_SPECIFIC_FIELDS));
    },
    deleteTransaction(id: string): void {
      tombstone('transactions', id);
    },

    // ── Presupuestos (SRS 4.5) ───────────────────────────────────────────────
    /**
     * Crea, edita o revive el presupuesto de una categoría y moneda (ID fijo, ADR 0004).
     * `existing` es el documento con ese ID que ya está en el store, aunque sea una lápida.
     */
    saveBudget(draft: BudgetDraft, existing: Budget | undefined): void {
      const id = budgetId(draft.categoryId, draft.currency);
      if (existing && existing.deletedAt === null) {
        update('budgets', id, { amount: draft.amount });
        return;
      }
      ensureCanWrite();
      // Revivir una lápida es pisar el documento entero, conservando su createdAt (inmutable).
      report(
        `guardar budgets/${id}`,
        setDoc(docRef(db, uid, 'budgets', id), {
          ...draft,
          createdAt: existing?.createdAt ?? now(),
          updatedAt: serverTimestamp(),
          deletedAt: null,
        }),
      );
    },
    deleteBudget(id: string): void {
      tombstone('budgets', id);
    },

    // ── Recurrentes (SRS 4.6) ────────────────────────────────────────────────
    createRecurring(fields: RecurringFields): string {
      return create('recurring', { ...fields, nextDate: fields.startDate });
    },
    /** Si cambian la frecuencia o `startDate`, recalcula `nextDate` sin repetir ocurrencias (ADR 0009). */
    updateRecurring(original: Recurring, fields: RecurringFields): void {
      const changes = changedFields(original, fields, TYPE_SPECIFIC_FIELDS);
      if ('frequency' in changes || 'startDate' in changes) {
        const nextDate = recalculateNextDate(fields, original.nextDate);
        if (nextDate !== original.nextDate) changes['nextDate'] = nextDate;
      }
      update('recurring', original.id, changes);
    },
    deleteRecurring(id: string): void {
      tombstone('recurring', id);
    },

    /**
     * Confirma una ocurrencia (SRS 5.10). En un solo lote, que se aplica entero o no se aplica:
     * - crea el movimiento con el ID fijo `rec_{recurringId}_{fecha}` (la fecha de la ocurrencia,
     *   aunque el usuario haya cambiado la del movimiento);
     * - pasa `nextDate` a la ocurrencia siguiente a la confirmada (idempotente, ADR 0004).
     */
    confirmOccurrence(
      recurring: Recurring,
      occurrenceDate: LocalDate,
      fields: TransactionFields,
    ): string {
      ensureCanWrite();
      const id = recurringTransactionId(recurring.id, occurrenceDate);
      const transactionRef = docRef(db, uid, 'transactions', id);
      const batch = writeBatch(db);
      batch.set(transactionRef, {
        ...fields,
        source: 'app',
        recurringId: recurring.id,
        createdAt: now(),
        updatedAt: serverTimestamp(),
        deletedAt: null,
      });
      batch.update(docRef(db, uid, 'recurring', recurring.id), {
        nextDate: nextDateAfter(recurring, occurrenceDate),
        updatedAt: serverTimestamp(),
      });
      const action = `confirmar transactions/${id}`;
      batch.commit().catch(async (error: unknown) => {
        // Otro dispositivo ya confirmó esta ocurrencia (TC-14): el movimiento existe con otro
        // createdAt, que es inmutable, y las reglas rechazan el lote entero. Es el resultado
        // correcto (queda un solo movimiento y el nextDate es el mismo), así que no es un error.
        // Se confirma leyendo el documento del servidor (ADR 0004, nota de la Fase 5).
        if (error instanceof FirebaseError && error.code === 'permission-denied') {
          try {
            if ((await getDocFromServer(transactionRef)).exists()) return;
          } catch {
            // Si no se pudo leer, se informa el error original.
          }
        }
        options.onError({ action, error });
      });
      return id;
    },
    /** Saltea una ocurrencia: solo avanza `nextDate`, con el mismo cálculo que confirmar. */
    skipOccurrence(recurring: Recurring, occurrenceDate: LocalDate): void {
      update('recurring', recurring.id, { nextDate: nextDateAfter(recurring, occurrenceDate) });
    },

    // ── Perfil (SRS 4.1) ─────────────────────────────────────────────────────
    /** La hoja de la exportación a Sheets, para actualizar la misma la próxima vez (SRS 8.4). */
    setSheetsSpreadsheetId(spreadsheetId: string): void {
      ensureCanWrite();
      report(
        'editar el perfil',
        updateDoc(profileRef(db, uid), {
          sheetsSpreadsheetId: spreadsheetId,
          updatedAt: serverTimestamp(),
        }),
      );
    },
  };
}

export type Writer = ReturnType<typeof createWriter>;
