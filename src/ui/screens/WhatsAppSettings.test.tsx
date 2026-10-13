// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsAppLinkError } from '../../data/whatsappLink';
import { whatsappLink } from '../session';
import { WhatsAppSettings } from './WhatsAppSettings';

// La tarjeta de WhatsApp en Ajustes (ADR 0033) con un cliente del Worker falso: cada test decide
// qué responde el estado, el código y el desvincular.
vi.mock('../session', () => ({
  WHATSAPP_BOT_NUMBER: '+1 555 010 0000',
  whatsappLink: {
    configured: true,
    status: vi.fn(),
    requestCode: vi.fn(),
    unlink: vi.fn(() => Promise.resolve()),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(whatsappLink.status).mockResolvedValue(null);
});

describe('sin vincular', () => {
  it('ofrece vincular y muestra el código con el enlace a WhatsApp', async () => {
    vi.mocked(whatsappLink.requestCode).mockResolvedValue({
      code: '123456',
      expiresAt: Date.now() + 600_000,
    });
    render(<WhatsAppSettings />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Vincular WhatsApp' }));

    expect(await screen.findByText('vincular 123456')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/15550100000?text=vincular%20123456',
    );
  });

  // El mensaje llega al bot y el vínculo aparece al consultar de nuevo.
  it('"Ya lo mandé" consulta el estado otra vez', async () => {
    vi.mocked(whatsappLink.requestCode).mockResolvedValue({
      code: '123456',
      expiresAt: Date.now() + 600_000,
    });
    const user = userEvent.setup();
    render(<WhatsAppSettings />);
    await user.click(await screen.findByRole('button', { name: 'Vincular WhatsApp' }));

    await user.click(await screen.findByRole('button', { name: 'Ya lo mandé' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Todavía no aparece vinculado');

    vi.mocked(whatsappLink.status).mockResolvedValue('+54 ••• 6789');
    await user.click(screen.getByRole('button', { name: 'Ya lo mandé' }));
    expect(await screen.findByText('+54 ••• 6789')).toBeVisible();
  });

  it('si no se puede crear el código, lo dice', async () => {
    vi.mocked(whatsappLink.requestCode).mockRejectedValue(new WhatsAppLinkError('failed'));
    render(<WhatsAppSettings />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Vincular WhatsApp' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar');
  });
});

describe('vinculado', () => {
  it('muestra el número y desvincula después de confirmar', async () => {
    vi.mocked(whatsappLink.status).mockResolvedValue('+54 ••• 6789');
    const user = userEvent.setup();
    render(<WhatsAppSettings />);

    await user.click(await screen.findByRole('button', { name: 'Desvincular' }));
    expect(whatsappLink.unlink).not.toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Desvincular' }).at(-1) as HTMLElement);

    expect(whatsappLink.unlink).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('button', { name: 'Vincular WhatsApp' })).toBeVisible();
  });
});

describe('sin servidor', () => {
  it('si no se puede consultar, ofrece reintentar', async () => {
    vi.mocked(whatsappLink.status).mockRejectedValue(new WhatsAppLinkError('failed'));
    render(<WhatsAppSettings />);
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo conectar');
  });
});
