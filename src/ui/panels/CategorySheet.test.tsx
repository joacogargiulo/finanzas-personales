// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeCategory } from '../../domain/testing/factories';
import { CategorySheet } from './CategorySheet';

const food = makeCategory({
  id: 'food',
  name: 'Comida',
  type: 'expense',
  icon: 'food',
  color: 'orange',
});

// SRS 6.7: nombre, tipo, ícono y color. El tipo se bloquea si la categoría se usa (ADR 0009).
describe('CategorySheet', () => {
  it('crea una categoría con el ícono y el color elegidos', async () => {
    const onSave = vi.fn();
    render(<CategorySheet categories={[food]} onSave={onSave} onClose={vi.fn()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Nombre'), 'Mascotas');
    await user.click(screen.getByRole('button', { name: 'Mascotas' }));
    await user.click(screen.getByRole('button', { name: 'Violeta' }));
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));

    expect(onSave).toHaveBeenCalledWith({
      name: 'Mascotas',
      type: 'expense',
      icon: 'pet',
      color: 'purple',
    });
  });

  it('no deja repetir el nombre de una activa del mismo tipo', async () => {
    const onSave = vi.fn();
    render(<CategorySheet categories={[food]} onSave={onSave} onClose={vi.fn()} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nombre'), 'comida');
    await user.click(screen.getByRole('button', { name: 'Crear categoría' }));
    expect(screen.getByText('Ya tenés una categoría activa llamada comida.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('al editar una categoría en uso, el tipo queda bloqueado con la explicación', () => {
    render(
      <CategorySheet
        categories={[food]}
        original={food}
        typeLockedReason="No se puede cambiar el tipo porque la categoría tiene movimientos."
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Ingreso' })).toBeDisabled();
    expect(screen.getByText(/No se puede cambiar el tipo/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Comida');
  });
});
