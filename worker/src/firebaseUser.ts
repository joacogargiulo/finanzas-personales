// El Worker actúa como la persona (ADR 0034): firma un "custom token" de Firebase para su uid,
// lo canjea por un ID token y con ese token escribe en Firestore por REST. Las reglas de
// Firestore se aplican igual que si escribiera la app, y la cuenta de servicio no tiene ningún
// rol. Firmar con RSA gasta CPU y el plan gratis da pocos milisegundos, así que el ID token
// (dura 1 hora) se guarda en el KV por 50 minutos.

import { importPKCS8, SignJWT } from 'jose';
import type { LinkStore } from './links';

/** Lo que se usa del JSON de la cuenta de servicio. */
export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com';
const CUSTOM_TOKEN_AUDIENCE = `${IDENTITY_TOOLKIT}/google.identity.identitytoolkit.v1.IdentityToolkit`;
const ID_TOKEN_TTL_SECONDS = 50 * 60;

/** Lee el secreto `FIREBASE_SERVICE_ACCOUNT` (el JSON entero). */
export function parseServiceAccount(json: string): ServiceAccount {
  const data = JSON.parse(json) as Partial<ServiceAccount>;
  if (typeof data.client_email !== 'string' || typeof data.private_key !== 'string') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT no tiene client_email y private_key');
  }
  return { client_email: data.client_email, private_key: data.private_key };
}

/** El custom token de una persona, firmado con la clave de la cuenta de servicio (dura 1 hora). */
export async function customToken(
  account: ServiceAccount,
  uid: string,
  now: Date = new Date(),
): Promise<string> {
  const key = await importPKCS8(account.private_key, 'RS256');
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(account.client_email)
    .setSubject(account.client_email)
    .setAudience(CUSTOM_TOKEN_AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + 3600)
    .sign(key);
}

export interface IdTokenDeps {
  account: ServiceAccount;
  /** La API key web de Firebase (no es un secreto: está en el código de la app). */
  apiKey: string;
  store: LinkStore;
  fetch: typeof fetch;
  now?: () => Date;
}

/** El ID token de la persona: el guardado si sigue vigente, o uno nuevo canjeado en Firebase. */
export async function userIdToken(deps: IdTokenDeps, uid: string): Promise<string> {
  const cacheKey = `idtoken:${uid}`;
  const cached = await deps.store.get(cacheKey);
  if (cached !== null) return cached;

  const token = await customToken(deps.account, uid, deps.now?.());
  const response = await deps.fetch(
    `${IDENTITY_TOOLKIT}/v1/accounts:signInWithCustomToken?key=${deps.apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, returnSecureToken: true }),
    },
  );
  if (!response.ok)
    throw new Error(`Firebase rechazó el custom token (${String(response.status)})`);
  const { idToken } = await response.json<{ idToken?: unknown }>();
  if (typeof idToken !== 'string') throw new Error('Firebase no devolvió un ID token');
  await deps.store.put(cacheKey, idToken, { expirationTtl: ID_TOKEN_TTL_SECONDS });
  return idToken;
}
