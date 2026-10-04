// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAccount, makeCategory, makeRecurring } from '../../domain/testing/factories';
import { RecurringSheet, type RecurringSheetProps } from './RecurringSheet';

const cash = makeAccount({ id: 'cash', name: 'Efectivo', currency: 'ARS' });
const bank = makeAccount({ id: 'bank', name: 'Banco', currency: 'ARS' });
const home = makeCategory({ id: 'home', name: 'Hogar', type: 'expense' });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });

function setup(props: Partial<RecurringSheetProps> = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn() };
  render(
    <RecurringSheet
      accounts={[cash, bank]}
      categories={[home, salary]}
      today="2026-10-04"
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

// Crear: el formulario arma un recurrente validado por el dominio (SRS 4.6).
describe('nuevo recurrente', () => {
  it('guarda un gasto mensual que empieza hoy', async () => {
    const { onSave, user } = setup();
    await user.type(screen.getByLabelText(/^Monto/), '250000');
    await user.click(screen.getByRole('button', { name: 'Hogar' }));
    await user.type(screen.getByLabelText('Descripción (opcional)'), 'Alquiler');
    await user.click(screen.getByRole('button', { name: 'Crear recurrente' }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'expense',
      amount: 250_000_00,
      description: 'Alquiler',
      accountId: 'bank', // las cuentas se ordenan por moneda y nombre: Banco va primero
      categoryId: 'home',
      frequency: 'monthly',
      startDate: '2026-10-04',
      endDate: null,
    });
  });

  it('una transferencia pide la cuenta destino y no la categoría', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Transferir' }));
    expect(screen.queryByRole('button', { name: 'Hogar' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Monto/), '1000');
    await user.click(screen.getByRole('button', { name: 'Semanal' }));
    await user.selectOptions(screen.getByLabelText('Hacia'), 'cash');
    await user.click(screen.getByRole('button', { name: 'Crear recurrente' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'transfer', toAccountId: 'cash', frequency: 'weekly' }),
    );
  });

  it('muestra los errores y no guarda', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Crear recurrente' }));

    expect(screen.getByText('Ingresá un monto.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

// Editar: si cambia el calendario, se explica que lo ya confirmado no se repite (ADR 0009).
describe('editar', () => {
  const rent = makeRecurring({
    id: 'r1',
    accountId: 'cash',
    categoryId: 'home',
    amount: 250_000_00,
    startDate: '2026-01-05',
    nextDate: '2026-11-05',
  });

  it('precarga los datos y avisa al cambiar la frecuencia', async () => {
    const { onSave, user } = setup({ original: rent });
    expect(screen.getByLabelText(/^Monto/)).toHaveValue('250000');
    expect(screen.queryByText(/no vuelven a quedar pendientes/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Semanal' }));
    expect(screen.getByText(/no vuelven a quedar pendientes/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ frequency: 'weekly' }));
  });
});
