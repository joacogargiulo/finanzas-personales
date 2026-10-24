import { decodeJwt, decodeProtectedHeader, exportPKCS8, generateKeyPair, jwtVerify } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { fakeStore } from './fakeStore';
import { customToken, parseServiceAccount, userIdToken, type ServiceAccount } from './firebaseUser';

// El Worker actúa como la persona (ADR 0034): firma un custom token con la clave de la cuenta de
// servicio y lo canjea por un ID token. Acá la clave es una de prueba, generada en el test.

const NOW = new Date('2026-10-14T15:00:00Z');
let account: ServiceAccount;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  publicKey = pair.publicKey;
  account = {
    client_email: 'whatsapp-bot@proyecto.iam.gserviceaccount.com',
    private_key: await exportPKCS8(pair.privateKey),
  };
});

describe('customToken', () => {
  it('se firma con la clave de la cuenta de servicio y lleva el uid', async () => {
    const token = await customToken(account, 'ana', NOW);

    // Si la firma no coincidiera con la clave pública, esto lanzaría.
    await jwtVerify(token, publicKey, { currentDate: NOW });
    expect(decodeProtectedHeader(token)).toMatchObject({ alg: 'RS256' });
    expect(decodeJwt(token)).toMatchObject({
      iss: account.client_email,
      sub: account.client_email,
      aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
      uid: 'ana',
      iat: Math.floor(NOW.getTime() / 1000),
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
    });
  });
});

describe('userIdToken', () => {
  const exchange = () =>
    vi.fn(() => Promise.resolve(Response.json({ idToken: 'id-token-de-ana', expiresIn: '3600' })));

  it('canjea el custom token por un ID token y lo guarda 50 minutos', async () => {
    const store = fakeStore();
    const fetch = exchange();
    const token = await userIdToken(
      { account, apiKey: 'KEY', store, fetch, now: () => NOW },
      'ana',
    );

    expect(token).toBe('id-token-de-ana');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=KEY',
    );
    const body = JSON.parse(init.body as string) as { token: string; returnSecureToken: boolean };
    expect(body.returnSecureToken).toBe(true);
    expect(decodeJwt(body.token)).toMatchObject({ uid: 'ana' });
    expect(store.data.get('idtoken:ana')).toBe('id-token-de-ana');
    expect(store.ttls.get('idtoken:ana')).toBe(3000);
  });

  // Firmar con RSA gasta CPU: dentro de la hora se reutiliza el token guardado.
  it('si ya hay uno guardado, lo reutiliza sin firmar ni llamar a Firebase', async () => {
    const store = fakeStore({ 'idtoken:ana': 'guardado' });
    const fetch = exchange();
    expect(await userIdToken({ account, apiKey: 'KEY', store, fetch }, 'ana')).toBe('guardado');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cada persona tiene su propio token', async () => {
    const store = fakeStore({ 'idtoken:ana': 'de-ana' });
    const fetch = exchange();
    expect(await userIdToken({ account, apiKey: 'KEY', store, fetch }, 'beto')).toBe(
      'id-token-de-ana',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si Firebase rechaza el custom token, lanza y no guarda nada', async () => {
    const store = fakeStore();
    const fetch = vi.fn(() => Promise.resolve(new Response('{}', { status: 400 })));
    await expect(userIdToken({ account, apiKey: 'KEY', store, fetch }, 'ana')).rejects.toThrow(
      /rechazó/,
    );
    expect(store.data.size).toBe(0);
  });
});

describe('parseServiceAccount', () => {
  it('lee el JSON del secreto', () => {
    const json = JSON.stringify({ ...account, project_id: 'p', private_key_id: 'k' });
    expect(parseServiceAccount(json)).toEqual(account);
  });

  it('sin la clave o el email, falla con un mensaje claro', () => {
    expect(() => parseServiceAccount('{}')).toThrow(/client_email/);
    expect(() => parseServiceAccount('')).toThrow();
  });
});
