// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeAccount, makeCategory, makeExpense } from '../../domain/testing/factories';
import { TransactionSheet, type TransactionSheetProps } from './TransactionSheet';

const bank = makeAccount({ id: 'bank', name: 'Banco', currency: 'ARS' });
const cash = makeAccount({ id: 'cash', name: 'Efectivo', currency: 'ARS' });
const dollars = makeAccount({ id: 'usd', name: 'Caja dólares', currency: 'USD' });
const food = makeCategory({ id: 'food', name: 'Comida', type: 'expense' });
const salary = makeCategory({ id: 'salary', name: 'Salario', type: 'income' });

function setup(props: Partial<TransactionSheetProps> = {}) {
  const handlers = { onSave: vi.fn(), onClose: vi.fn(), onCreateAccount: vi.fn() };
  render(
    <TransactionSheet
      accounts={[cash, bank, dollars]}
      categories={[food, salary]}
      today="2026-10-03"
      {...handlers}
      {...props}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

/** Escribe un monto con el teclado de la pantalla. */
async function typeAmount(user: ReturnType<typeof userEvent.setup>, text: string) {
  for (const char of text) {
    const name = char === ',' ? 'Coma decimal' : char;
    await user.click(screen.getByRole('button', { name }));
  }
}

// El flujo principal: cargar un gasto con el teclado propio (TC-01).
describe('nuevo gasto', () => {
  it('guarda el gasto con el monto en centavos y la primera cuenta', async () => {
    const { onSave, user } = setup();
    await typeAmount(user, '1500,5');
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('− $ 1.500,5');

    await user.click(screen.getByRole('button', { name: 'Comida' }));
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(onSave).toHaveBeenCalledWith({
      type: 'expense',
      amount: 150050,
      date: '2026-10-03',
      description: '',
      accountId: 'bank', // las cuentas se ordenan por moneda y nombre: Banco va primero
      categoryId: 'food',
    });
  });

  it('muestra los errores junto a cada campo y no guarda', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(screen.getByText('Ingresá un monto.')).toBeInTheDocument();
    expect(screen.getByText('Elegí una categoría.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('acepta el teclado físico de la compu (el punto vale como coma)', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Nuevo movimiento' });
    for (const key of ['2', '5', '.', '7', '5']) fireEvent.keyDown(dialog, { key });
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 25,75');
  });
});

// SRS 6.7: al cambiar el tipo se limpian los campos que dejan de aplicar.
describe('cambiar de tipo', () => {
  it('de gasto a ingreso cambia las categorías y limpia la elegida', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Comida' }));
    await user.click(screen.getByRole('button', { name: 'Ingreso' }));

    expect(screen.queryByRole('button', { name: 'Comida' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salario' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Guardar ingreso' })).toBeInTheDocument();
  });

  it('transferencia desde una cuenta en dólares: no ofrece cuentas en pesos (TC-03)', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Transferir' }));
    await user.selectOptions(screen.getByLabelText('Desde'), 'usd');

    const destination = screen.getByLabelText('Hacia');
    const options = within(destination)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual(['No hay cuentas disponibles']);
  });

  it('cambio de moneda: muestra la cotización implícita (TC-05)', async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cambio' }));
    await user.selectOptions(screen.getByLabelText('Hacia'), 'usd');

    await typeAmount(user, '130000');
    await user.click(screen.getByRole('button', { name: /^Entra/ }));
    await typeAmount(user, '100');

    expect(screen.getByText('1 USD = $ 1.300,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambio' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'exchange', amount: 13_000_000, toAmount: 10_000 }),
    );
  });
});

describe('edición', () => {
  it('precarga el movimiento y guarda los cambios (TC-04)', async () => {
    const original = makeExpense({ accountId: 'cash', categoryId: 'food', amount: 30000 });
    const { onSave, user } = setup({ original });

    expect(screen.getByRole('dialog', { name: 'Editar movimiento' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Monto:/)).toHaveTextContent('$ 300');
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));
    await typeAmount(user, '500');
    await user.click(screen.getByRole('button', { name: 'Guardar gasto' }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 50000 }));
  });

  it('bloquea el guardado con la explicación si usa una cuenta archivada', () => {
    const original = makeExpense({ accountId: 'cash', categoryId: 'food' });
    setup({ original, lockedReason: 'Este movimiento usa la cuenta archivada Efectivo.' });

    expect(screen.getByRole('alert')).toHaveTextContent('cuenta archivada Efectivo');
    expect(screen.getByRole('button', { name: 'Guardar gasto' })).toBeDisabled();
  });
});

describe('sin cuentas', () => {
  it('invita a crear la primera cuenta', async () => {
    const { onCreateAccount, user } = setup({ accounts: [] });
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(onCreateAccount).toHaveBeenCalled();
  });
});
