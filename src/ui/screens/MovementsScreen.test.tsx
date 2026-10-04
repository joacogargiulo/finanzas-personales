// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { today } from '../../domain/dates';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import { emptyState } from '../../data/store';
import { store } from '../session';
import { MovementsScreen } from './MovementsScreen';

// Igual que en StatsScreen.test.tsx: un store de prueba en lugar de la sesión real.
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), session: { writer: () => null } };
});

const now = today();
const card = makeAccount({ id: 'card', name: 'Tarjeta de Crédito' });
const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const food = makeCategory({ id: 'food', name: 'Comida' });

beforeEach(() => {
  act(() => {
    store.setState({
      ...emptyState({ status: 'loading' }),
      accounts: [card, cash],
      categories: [food],
      transactions: [
        makeExpense({ accountId: card.id, categoryId: food.id, description: 'Cena', date: now }),
        makeExpense({ accountId: cash.id, categoryId: food.id, description: 'Kiosco', date: now }),
      ],
      loaded: {
        accounts: true,
        categories: true,
        transactions: true,
        budgets: true,
        recurring: true,
      },
    });
  });
});

const rows = () => screen.getAllByRole('button', { name: /Cena|Kiosco/ });

// El buscador (SRS 6.4): sin distinguir mayúsculas ni acentos, y combinable con los filtros.
describe('MovementsScreen: buscador', () => {
  it('TC-18: "credito" encuentra los movimientos de la cuenta "Tarjeta de Crédito"', async () => {
    render(<MovementsScreen />);
    expect(rows()).toHaveLength(2);
    await userEvent.setup().type(screen.getByLabelText('Buscar movimientos'), 'credito');
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Cena');
  });

  it('la X borra la búsqueda y vuelve a mostrar todo', async () => {
    render(<MovementsScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar movimientos'), 'kiosco');
    expect(rows()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }));
    expect(screen.getByLabelText('Buscar movimientos')).toHaveValue('');
    expect(rows()).toHaveLength(2);
  });

  it('sin resultados, lo dice y ofrece limpiar', async () => {
    render(<MovementsScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar movimientos'), 'zapatillas');
    expect(
      screen.getByText('No hay movimientos que coincidan con “zapatillas”.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(rows()).toHaveLength(2);
  });

  it('se combina con el filtro por tipo', async () => {
    render(<MovementsScreen />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Buscar movimientos'), 'comida');
    expect(rows()).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Ingresos' }));
    expect(screen.queryAllByRole('button', { name: /Cena|Kiosco/ })).toHaveLength(0);
  });
});
