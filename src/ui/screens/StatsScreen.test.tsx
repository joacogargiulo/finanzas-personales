// @vitest-environment jsdom
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonthsClamped, today } from '../../domain/dates';
import {
  makeAccount,
  makeCategory,
  makeExchange,
  makeExpense,
  makeIncome,
  makeTransfer,
} from '../../domain/testing/factories';
import { emptyState } from '../../data/store';
import { store } from '../session';
import { StatsScreen } from './StatsScreen';

// La pantalla lee el store a través de `../session`, que en la app arranca Firebase. En el test
// se reemplaza por un store vacío que cada test llena con sus datos.
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), session: { writer: () => null } };
});

const now = today();
const twoMonthsAgo = addMonthsClamped(now, -2);

const ars = makeAccount({ id: 'ars', name: 'Efectivo' });
const usd = makeAccount({ id: 'usd', name: 'Caja USD', currency: 'USD' });
const food = makeCategory({ id: 'food', name: 'Comida', icon: 'food', color: 'orange' });
const fun = makeCategory({ id: 'fun', name: 'Salidas', archivedAt: 1 });
const salary = makeCategory({ id: 'salary', name: 'Sueldo', type: 'income' });

function load(transactions = defaultTransactions()) {
  act(() => {
    store.setState({
      ...emptyState({ status: 'loading' }),
      accounts: [ars, usd],
      categories: [food, fun, salary],
      transactions,
      loaded: {
        accounts: true,
        categories: true,
        transactions: true,
        budgets: true,
        recurring: true,
      },
    });
  });
}

function defaultTransactions() {
  return [
    makeIncome({ accountId: ars.id, categoryId: salary.id, amount: 1_000_000_00, date: now }),
    makeExpense({ accountId: ars.id, categoryId: food.id, amount: 300_000_00, date: now }),
    // Categoría archivada (TC-08): sigue en las estadísticas.
    makeExpense({ accountId: ars.id, categoryId: fun.id, amount: 100_000_00, date: twoMonthsAgo }),
    makeExpense({ accountId: usd.id, categoryId: food.id, amount: 50_00, date: now }),
    // Transferencias y cambios no cuentan (TC-05).
    makeTransfer({ accountId: ars.id, toAccountId: 'otra', amount: 999_00, date: now }),
    makeExchange({ accountId: ars.id, toAccountId: usd.id, date: now }),
  ];
}

const summary = () => within(screen.getByRole('region', { name: 'Resumen del período' }));

beforeEach(() => {
  load();
});

// Qué muestra la pantalla según la moneda y el período elegidos (SRS 6.5).
describe('StatsScreen', () => {
  it('por defecto, los últimos 6 meses en pesos, sin transferencias ni cambios', () => {
    render(<StatsScreen />);
    expect(screen.getByRole('button', { name: '6 meses' })).toHaveAttribute('aria-pressed', 'true');
    expect(summary().getByText('+ $ 1.000.000,00')).toBeInTheDocument();
    expect(summary().getByText('− $ 400.000,00')).toBeInTheDocument();
    expect(summary().getByText('+ $ 600.000,00')).toBeInTheDocument();
  });

  it('las donas listan las categorías, con la archivada marcada (TC-08)', () => {
    render(<StatsScreen />);
    const expenses = within(screen.getByRole('list', { name: 'Gastos por categoría' }));
    const items = expenses.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Comida');
    expect(items[0]).toHaveTextContent('75 %');
    expect(items[1]).toHaveTextContent('Salidas');
    expect(within(items[1] as HTMLElement).getByText('archivada')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Ingresos por categoría' })).toHaveTextContent(
      'Sueldo',
    );
  });

  it('cambiar el período cambia los totales', async () => {
    render(<StatsScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Este mes' }));
    // El gasto archivado de hace dos meses queda afuera.
    expect(summary().getByText('− $ 300.000,00')).toBeInTheDocument();
  });

  it('cambiar la moneda muestra solo las cuentas de esa moneda', async () => {
    render(<StatsScreen />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'USD' }));
    // Gastos y balance: sin ingresos en dólares, los dos son − US$ 50,00.
    expect(summary().getAllByText('− US$ 50,00')).toHaveLength(2);
    expect(screen.queryByRole('list', { name: 'Ingresos por categoría' })).not.toBeInTheDocument();
  });

  it('sin ingresos ni gastos en el período, muestra el estado vacío', () => {
    load([makeTransfer({ accountId: ars.id, toAccountId: 'otra', amount: 1_00, date: now })]);
    render(<StatsScreen />);
    expect(
      screen.getByText('No hay ingresos ni gastos en ARS en este período.'),
    ).toBeInTheDocument();
  });

  it('el período personalizado valida que "hasta" no sea anterior a "desde"', async () => {
    render(<StatsScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Personalizado' }));
    const to = screen.getByLabelText('Hasta');
    await user.clear(to);
    await user.type(to, '2000-01-01');
    expect(
      screen.getByText('La fecha de fin tiene que ser igual o posterior a la de inicio.'),
    ).toBeInTheDocument();
    expect(to).toHaveAttribute('aria-invalid', 'true');
  });

  it('el gráfico de barras tiene sus datos en una tabla para lectores de pantalla', () => {
    render(<StatsScreen />);
    const table = screen.getByRole('table', { name: 'Ingresos y gastos por mes' });
    expect(within(table).getAllByRole('row')).toHaveLength(7); // encabezado + 6 meses
  });
});
