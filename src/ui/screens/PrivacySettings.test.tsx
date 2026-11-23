// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PrivacySettings } from './PrivacySettings';

// La sección Privacidad (SRS 7.4) dice a dónde va cada dato. El detalle está plegado y se abre
// con un toque.
describe('sección Privacidad', () => {
  it('al abrirla, nombra cada servicio que recibe datos', async () => {
    render(<PrivacySettings />);
    await userEvent
      .setup()
      .click(screen.getByText('Qué datos salen de este dispositivo y a dónde'));

    for (const name of [
      'Firebase (Google)',
      'Bluelytics',
      'Google Sheets',
      'Dictado por voz',
      'Cloudflare (IA del dictado y del bot)',
      'WhatsApp (Meta)',
    ]) {
      expect(screen.getByText(name)).toBeVisible();
    }
  });

  // El bot de WhatsApp (ADR 0032 y 0035): Meta ve los mensajes y los saldos, y hay que decirlo.
  it('avisa que Meta puede ver lo que se habla con el bot', () => {
    render(<PrivacySettings />);
    expect(
      screen.getByText(/pasan por los servidores de Meta, que puede verlos/),
    ).toBeInTheDocument();
    expect(screen.getByText(/tus cuentas y tus saldos/)).toBeInTheDocument();
  });

  // Quien quiera irse sabe dónde está la salida.
  it('explica cómo borrar la cuenta', () => {
    render(<PrivacySettings />);
    expect(screen.getByText(/"Borrar mi cuenta", al final de Ajustes/)).toBeInTheDocument();
    expect(screen.getByText(/desvinculá el número en Ajustes → WhatsApp/)).toBeInTheDocument();
  });
});
