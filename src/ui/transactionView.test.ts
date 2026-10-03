import { describe, expect, it } from 'vitest';
import { indexById } from '../domain/collections';
import {
  makeAccount,
  makeCategory,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from '../domain/testing/factories';
import { transactionView } from './transactionView';

const cash = makeAccount({ id: 'cash', name: 'Efectivo', currency: 'ARS' });
const bank = makeAccount({ id: 'bank', name: 'Banco', currency: 'ARS' });
const dollars = makeAccount({ id: 'usd', name: 'Caja dólares', currency: 'USD' });
const old = makeAccount({ id: 'old', name: 'Tarjeta vieja', archivedAt: 1 });
const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });

const accounts = indexById([cash, bank, dollars, old]);
const categories = indexById([food, salary]);

// Cada tipo de movimiento se muestra distinto en las listas (SRS 6.4).
describe('transactionView', () => {
  it('gasto: título de la descripción, monto negativo en rojo', () => {
    const tx = makeExpense({ accountId: 'cash', categoryId: 'food', amount: 50000 });
    const view = transactionView({ ...tx, description: 'Supermercado' }, accounts, categories);
    expect(view.title).toBe('Supermercado');
    expect(view.category).toEqual({ name: 'Comida', tag: null });
    expect(view.from).toEqual({ name: 'Efectivo', tag: null });
    expect(view.amounts).toEqual([
      { cents: -50000, currency: 'ARS', sign: 'auto', tone: 'expense' },
    ]);
  });

  it('ingreso sin descripción: el título es la categoría y el monto lleva +', () => {
    const tx = makeIncome({ accountId: 'bank', categoryId: 'salary', description: '' });
    const view = transactionView(tx, accounts, categories);
    expect(view.title).toBe('Salario');
    expect(view.amounts[0]).toMatchObject({ sign: 'always', tone: 'income' });
  });

  it('transferencia: origen y destino, monto neutro', () => {
    const tx = makeTransfer({ accountId: 'bank', toAccountId: 'cash', description: '' });
    const view = transactionView(tx, accounts, categories);
    expect(view.title).toBe('Transferencia');
    expect(view.to).toEqual({ name: 'Efectivo', tag: null });
    expect(view.amounts[0]?.tone).toBeNull();
  });

  it('cambio: dos montos y la cotización implícita (TC-05)', () => {
    const tx = makeExchange({
      accountId: 'cash',
      toAccountId: 'usd',
      amount: 13_000_000,
      toAmount: 10_000,
      description: '',
    });
    const view = transactionView(tx, accounts, categories);
    expect(view.title).toBe('Cambio de moneda');
    expect(view.rate).toBe('1 USD = $ 1.300,00');
    expect(view.amounts).toEqual([
      { cents: -13_000_000, currency: 'ARS', sign: 'auto', tone: 'expense' },
      { cents: 10_000, currency: 'USD', sign: 'always', tone: 'income' },
    ]);
  });

  it('marca la cuenta archivada (TC-25)', () => {
    const tx = makeExpense({ accountId: 'old', categoryId: 'food' });
    expect(transactionView(tx, accounts, categories).from).toEqual({
      name: 'Tarjeta vieja',
      tag: 'archivada',
    });
  });

  it('tolera cuentas y categorías que no existen (SRS 5.3)', () => {
    const tx = makeExpense({ accountId: 'nope', categoryId: 'nope', description: '' });
    const view = transactionView(tx, accounts, categories);
    expect(view.title).toBe('Categoría desconocida');
    expect(view.from.name).toBe('Cuenta desconocida');
    expect(view.amounts[0]?.currency).toBe('ARS');
  });
});
