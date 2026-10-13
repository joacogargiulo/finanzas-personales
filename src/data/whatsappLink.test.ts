import { describe, expect, it, vi } from 'vitest';
import {
  createWhatsAppLink,
  workerOrigin,
  WhatsAppLinkError,
  type WhatsAppLinkDeps,
} from './whatsappLink';

// El cliente de las rutas de vinculación del Worker (ADR 0033). El Worker se reemplaza por un
// `fetch` falso que responde lo que decide cada test.

const BASE = 'https://dictado.example';

function deps(overrides: Partial<WhatsAppLinkDeps> = {}): WhatsAppLinkDeps {
  return {
    baseUrl: BASE,
    getToken: () => Promise.resolve('token'),
    fetch: vi.fn(() => Promise.resolve(Response.json({ phone: null }))),
    isOnline: () => true,
    ...overrides,
  };
}

/** El método y la URL del último pedido. */
function lastCall(d: WhatsAppLinkDeps): { url: string; init: RequestInit } {
  const [url, init] = vi.mocked(d.fetch).mock.lastCall as [string, RequestInit];
  return { url, init };
}

describe('pedidos al Worker', () => {
  it('pide el estado con el token de la sesión', async () => {
    const d = deps({
      fetch: vi.fn(() => Promise.resolve(Response.json({ phone: '+54 ••• 6789' }))),
    });
    expect(await createWhatsAppLink(d).status()).toBe('+54 ••• 6789');
    const { url, init } = lastCall(d);
    expect(url).toBe(`${BASE}/whatsapp/vinculo`);
    expect(init.method).toBe('GET');
    expect(init.headers).toEqual({ Authorization: 'Bearer token' });
  });

  it('sin vínculo, el estado es null', async () => {
    expect(await createWhatsAppLink(deps()).status()).toBeNull();
  });

  it('pide un código', async () => {
    const d = deps({
      fetch: vi.fn(() => Promise.resolve(Response.json({ code: '123456', expiresAt: 1000 }))),
    });
    expect(await createWhatsAppLink(d).requestCode()).toEqual({ code: '123456', expiresAt: 1000 });
    expect(lastCall(d)).toMatchObject({ url: `${BASE}/whatsapp/codigo`, init: { method: 'POST' } });
  });

  it('desvincula', async () => {
    const d = deps();
    await createWhatsAppLink(d).unlink();
    expect(lastCall(d).init.method).toBe('DELETE');
  });
});

// Cada falla termina en un error con código, que la pantalla traduce a un mensaje.
describe('errores', () => {
  it('sin conexión, ni lo intenta', async () => {
    const d = deps({ isOnline: () => false });
    await expect(createWhatsAppLink(d).status()).rejects.toEqual(new WhatsAppLinkError('offline'));
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('si el Worker responde un error, falla', async () => {
    const d = deps({ fetch: vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))) });
    await expect(createWhatsAppLink(d).unlink()).rejects.toMatchObject({ code: 'failed' });
  });

  it('si la respuesta no tiene la forma esperada, falla', async () => {
    const d = deps({ fetch: vi.fn(() => Promise.resolve(Response.json({ code: 1 }))) });
    await expect(createWhatsAppLink(d).requestCode()).rejects.toMatchObject({ code: 'failed' });
  });

  it('si se corta la red a mitad de camino, falla', async () => {
    const d = deps({ fetch: vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) });
    await expect(createWhatsAppLink(d).status()).rejects.toMatchObject({ code: 'failed' });
  });

  it('sin Worker configurado, no está disponible', async () => {
    const link = createWhatsAppLink(deps({ baseUrl: null }));
    expect(link.configured).toBe(false);
    await expect(link.status()).rejects.toBeInstanceOf(WhatsAppLinkError);
  });
});

describe('workerOrigin', () => {
  it('saca el origen de la URL del dictado', () => {
    expect(workerOrigin('https://finanzas.ejemplo.workers.dev/interpretar')).toBe(
      'https://finanzas.ejemplo.workers.dev',
    );
    expect(workerOrigin(undefined)).toBeNull();
    expect(workerOrigin('no es una URL')).toBeNull();
  });
});
