// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { closePanel, openPanel } from './navigation';

/** Un botón que abre una confirmación, como en Ajustes o Movimientos. */
function WithDialog({ onConfirm }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Abrir
      </button>
      {open && (
        <ConfirmDialog
          title="¿Seguro?"
          onConfirm={onConfirm}
          onClose={() => {
            setOpen(false);
          }}
        >
          Texto
        </ConfirmDialog>
      )}
    </>
  );
}

const hash = () => window.location.hash;

beforeEach(async () => {
  window.location.hash = '#/movimientos';
  await waitFor(() => {
    expect(hash()).toBe('#/movimientos');
  });
});

// Un diálogo sin dirección propia agrega "?capa=1" al historial para que Atrás lo cierre.
describe('useLayer: Atrás cierra los diálogos', () => {
  it('al abrir agrega la capa, y Atrás cierra solo el diálogo', async () => {
    render(<WithDialog />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir' }));
    expect(hash()).toBe('#/movimientos?capa=1');

    window.history.back();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(hash()).toBe('#/movimientos');
  });

  it('cerrar con Cancelar saca la entrada del historial', async () => {
    render(<WithDialog onConfirm={() => undefined} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(hash()).toBe('#/movimientos');
    });
  });

  // Confirmar "Eliminar movimiento" cierra la confirmación y el panel de una sola vez.
  it('cerrar el panel con una capa encima saca las dos entradas', async () => {
    openPanel({ kind: 'transaction', id: 'abc' });
    await waitFor(() => {
      expect(hash()).toBe('#/movimientos?movimiento=abc');
    });
    render(<WithDialog onConfirm={closePanel} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(hash()).toBe('#/movimientos?movimiento=abc&capa=1');

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      expect(hash()).toBe('#/movimientos');
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
