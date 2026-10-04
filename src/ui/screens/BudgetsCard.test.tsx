// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { computeBudgets } from '../../domain/budgets';
import { indexById } from '../../domain/collections';
import { makeAccount, makeBudget, makeCategory, makeExpense } from '../../domain/testing/factories';
import { BudgetsCard } from './BudgetsCard';

const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const today = '2026-10-04';

function renderWithSpent(spent: number) {
  const statuses = computeBudgets(
    [makeBudget({ categoryId: 'food', amount: 100_000_00 })],
    indexById([food]),
    indexById([cash]),
    [makeExpense({ accountId: 'cash', categoryId: 'food', amount: spent, date: '2026-10-02' })],
    today,
  );
  render(<BudgetsCard statuses={statuses} today={today} showCurrency={false} />);
}

// La barra cambia de color según el nivel (SRS 5.9), y el porcentaje va también en el texto.
describe('barra de progreso', () => {
  it('TC-15: $ 85.000 de $ 100.000 → amarilla al 85 %', () => {
    renderWithSpent(85_000_00);
    expect(screen.getByRole('heading')).toHaveTextContent('Presupuestos de octubre');
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '85');
    expect(bar).toHaveAccessibleName('Comida: cerca del límite');
    expect(screen.getByRole('listitem')).toHaveClass('budget--warning');
    expect(screen.getByText(/\$ 85\.000,00 de \$ 100\.000,00/)).toBeInTheDocument();
  });

  it('pasado del límite: roja, la barra llena y cuánto se excedió', () => {
    renderWithSpent(120_000_00);
    expect(screen.getByRole('listitem')).toHaveClass('budget--over');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('120 %')).toBeInTheDocument();
    expect(screen.getByText(/Te pasaste por \$ 20\.000,00/)).toBeInTheDocument();
  });

  it('sin presupuestos no se muestra', () => {
    const { container } = render(<BudgetsCard statuses={[]} today={today} showCurrency={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
