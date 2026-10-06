// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncStatus } from '../../data/sync';
import { session, store } from '../session';
import { DeleteAccountSettings } from './DeleteAccountSettings';

// Un store de prueba y una sesión falsa: el test verifica cuándo se ofrece borrar y que la
// confirmación reforzada llame a la sesión, sin tocar Firebase.
vi.mock('../session', async () => {
  const { createDataStore } = await import('../../data/store');
  return { store: createDataStore(), session: { deleteAccount: vi.fn(() => Promise.resolve()) } };
});

function setSync(sync: SyncStatus) {
  act(() => {
    store.setState({ sync });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// Sin conexión o con cambios sin subir, la caché podría no tener todo: no se deja empezar.
describe('cuándo se puede borrar', () => {
  it('con cambios pendientes, el botón está deshabilitado y dice por qué', () => {
    setSync({ pendingWrites: true, upToDate: true });
    render(<DeleteAccountSettings />);
    expect(screen.getByRole('button', { name: 'Borrar mi cuenta' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('cambios que todavía no se subieron');
  });

  it('sin estar al día con el servidor, también', () => {
    setSync({ pendingWrites: false, upToDate: false });
    render(<DeleteAccountSettings />);
    expect(screen.getByRole('button', { name: 'Borrar mi cuenta' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Necesitás conexión');
  });
});

// Es irreversible: hay que escribir BORRAR antes de que el botón se habilite.
describe('confirmación reforzada', () => {
  it('no borra hasta escribir BORRAR', async () => {
    setSync({ pendingWrites: false, upToDate: true });
    const user = userEvent.setup();
    render(<DeleteAccountSettings />);

    await user.click(screen.getByRole('button', { name: 'Borrar mi cuenta' }));
    const dialog = screen.getByRole('dialog', { name: '¿Borrar tu cuenta?' });
    const confirm = dialog.querySelector<HTMLButtonElement>('.btn-danger');
    expect(confirm).toBeDisabled();

    await user.type(screen.getByLabelText(/Para confirmar/), 'borrar');
    expect(confirm).toBeDisabled();
    await user.clear(screen.getByLabelText(/Para confirmar/));
    await user.type(screen.getByLabelText(/Para confirmar/), 'BORRAR');
    expect(confirm).toBeEnabled();

    if (confirm) await user.click(confirm);
    expect(session.deleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
