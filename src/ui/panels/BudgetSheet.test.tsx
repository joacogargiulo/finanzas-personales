// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeBudget, makeCategory } from '../../domain/testing/factories';
import { BudgetSheet, type BudgetSheetProps } from './BudgetSheet';

const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const fun = makeCategory({ id: 'fun', name: 'Ocio', type: 'expense' });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });

function setup(props: Partial<BudgetSheetProps> = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn() };
  render(
    <BudgetSheet
      categories={[food, fun, salary]}
      budgets={[]}
      currencies={['ARS', 'USD']}
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

// Crear: solo categorías de gasto activas (SRS 5.9) y las monedas que tienen cuentas.
describe('nuevo presupuesto', () => {
  it('guarda categoría, moneda y límite en centavos', async () => {
    const { onSave, user } = setup();
    expect(screen.queryByRole('button', { name: 'Salario' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Comida' }));
    await user.click(screen.getByRole('button', { name: 'USD' }));
    await user.type(screen.getByLabelText(/^Límite por mes/), '300');
    await user.click(screen.getByRole('button', { name: 'Crear presupuesto' }));

    expect(onSave).toHaveBeenCalledWith({ categoryId: 'food', currency: 'USD', amount: 300_00 });
  });

  it('pide categoría y límite', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Crear presupuesto' }));
    expect(screen.getByText('Ingresá un monto.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  // SRS 6.6: si la combinación ya existe, se edita esa (el ID es fijo).
  it('avisa si ya hay un presupuesto para esa categoría y moneda', async () => {
    const { user } = setup({ budgets: [makeBudget({ categoryId: 'food', amount: 100_000_00 })] });
    await user.click(screen.getByRole('button', { name: 'Comida' }));
    expect(screen.getByRole('status')).toHaveTextContent('Ya tenés un presupuesto de $ 100.000,00');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument();
  });
});

describe('editar', () => {
  it('solo cambia el límite', async () => {
    const original = makeBudget({ categoryId: 'food', amount: 100_000_00 });
    const { onSave, user } = setup({ original });
    expect(screen.queryByRole('button', { name: 'Ocio' })).not.toBeInTheDocument();
    const input = screen.getByLabelText(/^Límite por mes/);
    expect(input).toHaveValue('100000');

    await user.clear(input);
    await user.type(input, '120000');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(onSave).toHaveBeenCalledWith({
      categoryId: 'food',
      currency: 'ARS',
      amount: 120_000_00,
    });
  });
});
