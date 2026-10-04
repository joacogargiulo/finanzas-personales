import { describe, expect, it } from 'vitest';
import { accountsTable, categoriesTable, transactionsTable, type Cell } from './exportTables';
import {
  makeAccount,
  makeCategory,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from './testing/factories';

const text = (value: string): Cell => ({ kind: 'text', value });
const money = (cents: number): Cell => ({ kind: 'money', cents });
const date = (value: string): Cell => ({ kind: 'date', date: value });
const EMPTY = text('');

const cash = makeAccount({ id: 'cash', name: 'Efectivo', initialBalance: 1000_00 });
const bank = makeAccount({ id: 'bank', name: 'Banco', kind: 'bank' });
const dollars = makeAccount({ id: 'usd', name: 'Dólares', currency: 'USD' });
const food = makeCategory({ id: 'food', name: 'Comida' });
const salary = makeCategory({ id: 'salary', name: 'Sueldo', type: 'income' });

describe('transactionsTable', () => {
  // Cada tipo de movimiento llena solo las columnas que le corresponden (SRS 8.3).
  it('arma una fila por tipo de movimiento', () => {
    const table = transactionsTable(
      [
        makeExpense({
          accountId: 'cash',
          categoryId: 'food',
          amount: 1500_50,
          description: 'Súper',
          date: '2026-10-04',
        }),
        makeTransfer({ accountId: 'cash', toAccountId: 'bank', date: '2026-10-03' }),
        makeExchange({ accountId: 'bank', toAccountId: 'usd', date: '2026-10-02' }),
      ],
      [cash, bank, dollars],
      [food],
    );

    expect(table.headers).toHaveLength(10);
    expect(table.rows).toEqual([
      [
        date('2026-10-04'),
        text('Gasto'),
        text('Efectivo'),
        EMPTY,
        text('Comida'),
        text('Súper'),
        money(1500_50),
        text('ARS'),
        EMPTY,
        EMPTY,
      ],
      [
        date('2026-10-03'),
        text('Transferencia'),
        text('Efectivo'),
        text('Banco'),
        EMPTY,
        EMPTY,
        money(100_00),
        text('ARS'),
        money(100_00),
        text('ARS'),
      ],
      [
        date('2026-10-02'),
        text('Cambio'),
        text('Banco'),
        text('Dólares'),
        EMPTY,
        EMPTY,
        money(130_000_00),
        text('ARS'),
        money(100_00),
        text('USD'),
      ],
    ]);
  });

  // Orden del historial (SRS 5.11) y sin los movimientos eliminados.
  it('ordena del más nuevo al más viejo y deja afuera las lápidas', () => {
    const table = transactionsTable(
      [
        makeIncome({ accountId: 'cash', categoryId: 'salary', date: '2026-09-01' }),
        makeIncome({ accountId: 'cash', categoryId: 'salary', date: '2026-10-01' }),
        makeIncome({
          accountId: 'cash',
          categoryId: 'salary',
          date: '2026-10-02',
          deletedAt: 1_700_000_100_000,
        }),
      ],
      [cash],
      [salary],
    );
    expect(table.rows.map((row) => row[0])).toEqual([date('2026-10-01'), date('2026-09-01')]);
  });

  // Una cuenta eliminada en otro dispositivo sigue mostrando su nombre.
  it('busca el nombre también entre las cuentas eliminadas', () => {
    const gone = makeAccount({ id: 'gone', name: 'Vieja', deletedAt: 1_700_000_100_000 });
    const table = transactionsTable(
      [makeExpense({ accountId: 'gone', categoryId: 'food' })],
      [gone],
      [food],
    );
    expect(table.rows[0]?.[2]).toEqual(text('Vieja'));
  });
});

describe('accountsTable', () => {
  // El saldo actual se calcula, nunca se guarda (SRS 5.2), y puede ser negativo.
  it('calcula el saldo actual e indica el estado', () => {
    const archived = makeAccount({ id: 'old', name: 'Caja vieja', archivedAt: 1_700_000_100_000 });
    const table = accountsTable(
      [cash, archived],
      [makeExpense({ accountId: 'cash', categoryId: 'food', amount: 1500_00 })],
    );
    expect(table.rows).toEqual([
      [text('Caja vieja'), text('ARS'), money(0), money(0), text('Archivada')],
      [text('Efectivo'), text('ARS'), money(1000_00), money(-500_00), text('Activa')],
    ]);
  });
});

describe('categoriesTable', () => {
  it('lista primero los ingresos y después los gastos, por nombre', () => {
    const table = categoriesTable([food, salary, makeCategory({ name: 'Auto' })]);
    expect(
      table.rows.map((row) => row.map((cell) => (cell.kind === 'text' ? cell.value : ''))),
    ).toEqual([
      ['Sueldo', 'Ingreso', 'Activa'],
      ['Auto', 'Gasto', 'Activa'],
      ['Comida', 'Gasto', 'Activa'],
    ]);
  });
});
