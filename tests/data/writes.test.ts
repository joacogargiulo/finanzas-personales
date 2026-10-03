import {
  getDocFromServer,
  serverTimestamp,
  updateDoc,
  waitForPendingWrites,
  type DocumentData,
} from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import type { Budget, Recurring, Transaction } from '../../src/domain/model';
import type { RecurringFields, TransactionFields } from '../../src/domain/validation';
import { docRef, type UserCollection } from '../../src/data/paths';
import { createWriter } from '../../src/data/writes';
import { createClient, OWNER, until, useDataEnv, writerFor } from './helpers';

// Las escrituras de src/data/writes.ts contra las reglas reales: cada documento que arma la app
// tiene que ser aceptado por el servidor. Si una regla y el código no coinciden, la escritura
// se rechaza y el test lo detecta en `errors`.

useDataEnv();

/** Espera a que el servidor confirme todo y devuelve el documento tal como quedó allá. */
async function onServer(
  db: ReturnType<typeof createClient>,
  name: UserCollection,
  id: string,
): Promise<DocumentData | undefined> {
  await waitForPendingWrites(db);
  return (await getDocFromServer(docRef(db, OWNER, name, id))).data();
}

/** Lo que la app tendría en el store después de crear un documento (`extra` pisa lo demás). */
function asStored<T>(fields: object, extra: Partial<T> & { id: string }): T {
  return { ...fields, createdAt: 1, updatedAt: 1, deletedAt: null, ...extra } as T;
}

describe('cuentas', () => {
  it('crear, editar, archivar, restaurar y eliminar', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);

    const id = writer.createAccount({
      name: 'Efectivo',
      currency: 'ARS',
      initialBalance: 200_000,
      kind: 'cash',
    });
    expect(await onServer(db, 'accounts', id)).toMatchObject({
      name: 'Efectivo',
      archivedAt: null,
    });

    writer.updateAccount(id, { name: 'Billetera', kind: 'wallet' });
    writer.archiveAccount(id);
    expect(await onServer(db, 'accounts', id)).toMatchObject({ name: 'Billetera', kind: 'wallet' });

    // Restaurar con otro nombre, porque el original ya estaba en uso (ADR 0005).
    writer.restoreAccount(id, 'Billetera 2');
    expect(await onServer(db, 'accounts', id)).toMatchObject({
      name: 'Billetera 2',
      archivedAt: null,
    });

    writer.deleteAccount(id);
    expect((await onServer(db, 'accounts', id))?.['deletedAt']).toEqual(expect.any(Number));
    expect(errors).toEqual([]);
  });
});

describe('categorías', () => {
  it('crear, editar, archivar, restaurar y eliminar', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);

    const id = writer.createCategory({
      name: 'Mascotas',
      type: 'expense',
      icon: 'paw',
      color: 'brown',
    });
    writer.updateCategory(id, { name: 'Mascota', color: 'orange' });
    writer.archiveCategory(id);
    writer.restoreCategory(id);
    writer.deleteCategory(id);

    expect(await onServer(db, 'categories', id)).toMatchObject({
      name: 'Mascota',
      color: 'orange',
      archivedAt: null,
      deletedAt: expect.any(Number) as unknown,
    });
    expect(errors).toEqual([]);
  });
});

describe('movimientos', () => {
  const expense: TransactionFields = {
    type: 'expense',
    amount: 50_000,
    date: '2026-10-03',
    description: 'Súper',
    accountId: 'acc_efectivo',
    categoryId: 'seed_comida',
  };

  it('crea cada tipo con sus campos exactos', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);

    const ids = [
      writer.createTransaction(expense),
      writer.createTransaction({ ...expense, type: 'income', categoryId: 'seed_salario' }, 'voice'),
      writer.createTransaction({
        type: 'transfer',
        amount: 1_000,
        date: '2026-10-03',
        description: '',
        accountId: 'acc_sueldo',
        toAccountId: 'acc_efectivo',
      }),
      writer.createTransaction({
        type: 'exchange',
        amount: 13_000_000,
        toAmount: 10_000,
        date: '2026-10-03',
        description: '',
        accountId: 'acc_efectivo',
        toAccountId: 'acc_usd',
      }),
    ];

    for (const id of ids) expect(await onServer(db, 'transactions', id)).toBeDefined();
    expect((await onServer(db, 'transactions', ids[1] ?? ''))?.['source']).toBe('voice');
    expect(errors).toEqual([]);
  });

  // Al cambiar el tipo, los campos que dejan de aplicar se quitan (ADR 0007, SRS 6.7).
  it('al cambiar el tipo quita los campos que dejan de aplicar', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);
    const id = writer.createTransaction(expense);
    let stored = asStored<Transaction>(expense, { id, source: 'app' });

    const transfer: TransactionFields = {
      type: 'transfer',
      amount: 50_000,
      date: '2026-10-03',
      description: 'Súper',
      accountId: 'acc_efectivo',
      toAccountId: 'acc_banco',
    };
    writer.updateTransaction(stored, transfer);
    const asTransfer = await onServer(db, 'transactions', id);
    expect(asTransfer).toMatchObject({ type: 'transfer', toAccountId: 'acc_banco' });
    expect(asTransfer).not.toHaveProperty('categoryId');

    stored = asStored<Transaction>(transfer, { id, source: 'app' });
    const exchange: TransactionFields = { ...transfer, type: 'exchange', toAmount: 40 };
    writer.updateTransaction(stored, exchange);
    expect(await onServer(db, 'transactions', id)).toMatchObject({
      type: 'exchange',
      toAmount: 40,
    });

    stored = asStored<Transaction>(exchange, { id, source: 'app' });
    writer.updateTransaction(stored, expense);
    const backToExpense = await onServer(db, 'transactions', id);
    expect(backToExpense).toMatchObject({ type: 'expense', categoryId: 'seed_comida' });
    expect(backToExpense).not.toHaveProperty('toAccountId');
    expect(backToExpense).not.toHaveProperty('toAmount');
    expect(errors).toEqual([]);
  });

  it('eliminar marca la lápida', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);
    const id = writer.createTransaction(expense);

    writer.deleteTransaction(id);

    expect((await onServer(db, 'transactions', id))?.['deletedAt']).toEqual(expect.any(Number));
    expect(errors).toEqual([]);
  });
});

describe('presupuestos', () => {
  it('crear, editar, eliminar y revivir con el mismo ID', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);
    const draft = { categoryId: 'seed_comida', currency: 'ARS', amount: 10_000_000 } as const;
    const id = 'seed_comida_ARS';

    writer.saveBudget(draft, undefined);
    const created = await onServer(db, 'budgets', id);
    const createdAt = created?.['createdAt'] as number;
    const stored = asStored<Budget>(draft, { id, createdAt });

    writer.saveBudget({ ...draft, amount: 20_000_000 }, stored);
    expect(await onServer(db, 'budgets', id)).toMatchObject({ amount: 20_000_000 });

    writer.deleteBudget(id);
    await onServer(db, 'budgets', id);

    // Volver a crearlo revive la lápida y conserva su createdAt (inmutable en las reglas).
    writer.saveBudget({ ...draft, amount: 5_000_000 }, { ...stored, deletedAt: 123 });
    expect(await onServer(db, 'budgets', id)).toMatchObject({
      amount: 5_000_000,
      deletedAt: null,
      createdAt,
    });
    expect(errors).toEqual([]);
  });
});

describe('recurrentes', () => {
  const internet: RecurringFields = {
    type: 'expense',
    amount: 1_500_000,
    accountId: 'acc_sueldo',
    categoryId: 'seed_servicios',
    description: 'Internet',
    frequency: 'monthly',
    startDate: '2026-01-31',
    endDate: null,
  };

  it('al crearlo, la próxima ocurrencia es la fecha de inicio', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);

    const id = writer.createRecurring(internet);

    expect((await onServer(db, 'recurring', id))?.['nextDate']).toBe('2026-01-31');
    expect(errors).toEqual([]);
  });

  // ADR 0009: el nuevo nextDate es la primera fecha del calendario nuevo que no sea anterior
  // al nextDate de antes. Así no vuelve a quedar pendiente algo ya confirmado.
  it('al cambiar la frecuencia recalcula nextDate sin repetir ocurrencias', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);
    const id = writer.createRecurring(internet);
    // Simula que ya se confirmaron enero y febrero (confirmar llega en la Fase 5).
    await updateDoc(docRef(db, OWNER, 'recurring', id), {
      nextDate: '2026-03-31',
      updatedAt: serverTimestamp(),
    });
    const stored = asStored<Recurring>(internet, { id, nextDate: '2026-03-31' });

    writer.updateRecurring(stored, { ...internet, frequency: 'weekly' });

    // Semanal desde el sábado 31/01: ... 28/03, 04/04. La primera que no es anterior al 31/03.
    expect(await onServer(db, 'recurring', id)).toMatchObject({
      frequency: 'weekly',
      nextDate: '2026-04-04',
    });
    expect(errors).toEqual([]);
  });

  it('cambiar solo el monto no toca nextDate', async () => {
    const db = createClient(OWNER);
    const { writer } = writerFor(db);
    const id = writer.createRecurring(internet);
    const stored = asStored<Recurring>(internet, { id, nextDate: '2026-01-31' });

    writer.updateRecurring(stored, { ...internet, amount: 1_800_000 });

    expect(await onServer(db, 'recurring', id)).toMatchObject({
      amount: 1_800_000,
      nextDate: '2026-01-31',
    });
  });
});

describe('errores y bloqueos', () => {
  // Si el servidor rechaza una escritura, la app se entera (no se pierde en silencio).
  it('reporta una escritura rechazada por las reglas', async () => {
    const db = createClient(OWNER);
    const { writer, errors } = writerFor(db);

    // Un monto con decimales "a la fuerza": el dominio nunca lo produciría.
    const invalid = { type: 'expense', amount: 10.5 } as unknown as TransactionFields;
    writer.createTransaction(invalid);

    await until(() => errors.length === 1, 'el error del servidor');
    expect(errors[0]?.action).toMatch(/^crear transactions\//);
  });

  it('con un esquema más nuevo, no escribe (ADR 0011)', () => {
    const db = createClient(OWNER);
    const writer = createWriter(db, OWNER, { canWrite: () => false, onError: () => undefined });

    expect(() =>
      writer.createAccount({ name: 'Efectivo', currency: 'ARS', initialBalance: 0, kind: 'cash' }),
    ).toThrow(/bloqueadas/);
  });
});
