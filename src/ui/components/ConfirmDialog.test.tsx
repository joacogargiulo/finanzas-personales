// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

// SRS 6.7: confirmación simple para eliminar y reforzada (escribir el nombre) para archivar.
describe('ConfirmDialog', () => {
  it('simple: confirma o cancela', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
      <ConfirmDialog
        title="¿Eliminar?"
        confirmLabel="Eliminar"
        onConfirm={onConfirm}
        onClose={onClose}
      >
        Texto
      </ConfirmDialog>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('reforzada: el botón se habilita solo con el nombre exacto', async () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        title="¿Archivar Efectivo?"
        confirmLabel="Archivar"
        requireText="Efectivo"
        onConfirm={onConfirm}
        onClose={vi.fn()}
      >
        Texto
      </ConfirmDialog>,
    );
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Archivar' });
    const input = screen.getByLabelText(/Para confirmar, escribí/);

    expect(button).toBeDisabled();
    await user.type(input, 'efectivo');
    expect(button).toBeDisabled(); // distingue mayúsculas
    await user.clear(input);
    await user.type(input, 'Efectivo');
    expect(button).toBeEnabled();
    await user.click(button);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('aviso: sin acción, solo "Entendido"', async () => {
    const onClose = vi.fn();
    render(
      <ConfirmDialog title="No se puede archivar" onClose={onClose}>
        Esta cuenta tiene saldo.
      </ConfirmDialog>,
    );
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Entendido' }));
    expect(onClose).toHaveBeenCalled();
  });
});
