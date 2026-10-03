import { describe, expect, it } from 'vitest';
import { budgetId, budgetProgress, computeBudgets } from './budgets';
import { indexById } from './collections';
import {
  makeAccount,
  makeBudget,
  makeCategory,
  makeExpense,
  makeIncome,
} from './testing/factories';

describe('budgetProgress (SRS 5.9)', () => {
  // TC-15: $85.000 gastados de $100.000 → amarilla al 85 %.
  it('TC-15: amarilla al 85 %', () => {
    expect(budgetProgress(100_000_00, 85_000_00)).toEqual({
      spent: 85_000_00,
      limit: 100_000_00,
      percent: 85,
      level: 'warning',
      excess: 0,
    });
  });

  // Los bordes exactos: 80 % todavía es verde y 100 % todavía es amarilla.
  it.each([
    [0, 'ok', 0],
    [80_00, 'ok', 80],
    [80_01, 'warning', 80],
    [100_00, 'warning', 100],
    [100_01, 'over', 100],
    [150_00, 'over', 150],
  ] as const)('gastado %i de 100,00 → %s (%i %%)', (spent, level, percent) => {
    const progress = budgetProgress(100_00, spent);
    expect(progress.level).toBe(level);
    expect(progress.percent).toBe(percent);
  });

  // Por encima del 100 % se muestra cuánto se excedió.
  it('calcula el excedente', () => {
    expect(budgetProgress(100_00, 150_00).excess).toBe(50_00);
  });
});

describe('computeBudgets', () => {
  const ars = makeAccount();
  const usd = makeAccount({ currency: 'USD' });
  const food = makeCategory({ name: 'Comida' });
  const archivedCat = makeCategory({ name: 'Ocio', archivedAt: 1 });
  const accounts = indexById([ars, usd]);
  const categories = indexById([food, archivedCat]);

  // Solo suman los gastos de esa categoría, en cuentas de esa moneda y del mes actual.
  it('suma solo lo que corresponde', () => {
    const budget = makeBudget({ categoryId: food.id, currency: 'ARS', amount: 1_000_00 });
    const txs = [
      makeExpense({ accountId: ars.id, categoryId: food.id, amount: 100_00, date: '2026-10-01' }),
      makeExpense({ accountId: ars.id, categoryId: food.id, amount: 50_00, date: '2026-10-31' }),
      makeExpense({ accountId: ars.id, categoryId: food.id, amount: 999_00, date: '2026-09-30' }), // otro mes
      makeExpense({ accountId: usd.id, categoryId: food.id, amount: 999_00, date: '2026-10-02' }), // otra moneda
      makeIncome({ accountId: ars.id, categoryId: food.id, amount: 999_00, date: '2026-10-02' }), // no es gasto
      makeExpense({
        accountId: ars.id,
        categoryId: food.id,
        amount: 999_00,
        date: '2026-10-02',
        deletedAt: 1,
      }),
    ];
    const [status] = computeBudgets([budget], categories, accounts, txs, '2026-10-15');
    expect(status?.spent).toBe(150_00);
    expect(status?.category).toBe(food);
  });

  // SRS 5.6: el presupuesto de una categoría archivada se oculta; los eliminados también.
  it('oculta presupuestos de categorías archivadas y eliminados', () => {
    const budgets = [
      makeBudget({ categoryId: archivedCat.id }),
      makeBudget({ categoryId: food.id, deletedAt: 1 }),
      makeBudget({ categoryId: 'desconocida' }),
    ];
    expect(computeBudgets(budgets, categories, accounts, [], '2026-10-15')).toEqual([]);
  });

  it('budgetId', () => {
    expect(budgetId('seed_comida', 'USD')).toBe('seed_comida_USD');
  });
});
