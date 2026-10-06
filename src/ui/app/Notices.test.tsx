// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appUpdates, store } from '../session';
import { Notices } from './Notices';

// Un store de prueba y unas actualizaciones falsas en lugar de la sesión real.
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), appUpdates: { apply: vi.fn() } };
});

beforeEach(() => {
  act(() => {
    store.setState({ updateAvailable: false, writesBlocked: false, writeErrors: [] });
  });
  vi.mocked(appUpdates.apply).mockClear();
});

// "Hay una versión nueva" (ADR 0027): la app avisa y se actualiza recién cuando la persona quiere.
describe('aviso de versión nueva', () => {
  it('no muestra nada si no hay versión nueva', () => {
    render(<Notices />);
    expect(screen.queryByText(/versión nueva/)).not.toBeInTheDocument();
  });

  it('avisa y "Actualizar" activa la versión nueva', async () => {
    const user = userEvent.setup();
    render(<Notices />);
    act(() => {
      store.setState({ updateAvailable: true });
    });

    expect(screen.getByText('Hay una versión nueva de la app.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Actualizar' }));
    expect(appUpdates.apply).toHaveBeenCalledTimes(1);
  });

  // Si otro dispositivo usa un esquema más nuevo (ADR 0011), el aviso de bloqueo ofrece el botón
  // en vez de mostrar dos avisos.
  it('con las escrituras bloqueadas, el mismo aviso ofrece Actualizar', () => {
    act(() => {
      store.setState({ updateAvailable: true, writesBlocked: true });
    });
    render(<Notices />);
    expect(screen.getAllByRole('button', { name: 'Actualizar' })).toHaveLength(1);
    expect(screen.getByText(/Actualizala para seguir cargando/)).toBeInTheDocument();
  });
});
