// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PrivateScreen } from './PrivateScreen';

// Quien inicia sesión sin estar en la lista de acceso ve un aviso claro (ADR 0026).
describe('pantalla de app privada', () => {
  it('dice qué cuenta no tiene acceso', () => {
    render(<PrivateScreen email="extrano@gmail.com" onSignOut={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Esta app es privada' })).toBeInTheDocument();
    expect(screen.getByText('extrano@gmail.com')).toBeInTheDocument();
  });

  it('"Usar otra cuenta" cierra la sesión una sola vez', async () => {
    const onSignOut = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<PrivateScreen email="extrano@gmail.com" onSignOut={onSignOut} />);

    const button = screen.getByRole('button', { name: 'Usar otra cuenta' });
    await user.click(button);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });
});
