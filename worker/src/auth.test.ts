import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { firebaseTokenVerifier, InvalidTokenError, type VerifyToken } from './auth';

// Verificación del token de Firebase (ADR 0031). En lugar de las claves de Google, el test genera
// un par de claves propio y firma tokens con la misma forma que los de Firebase.

const PROJECT = 'finanzas-test';
let sign: (payload: JWTPayload, expiresIn?: string) => Promise<string>;
let keys: JWTVerifyGetKey;
let verify: VerifyToken;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'clave-1', alg: 'RS256' };
  keys = createLocalJWKSet({ keys: [jwk] });
  verify = firebaseTokenVerifier(PROJECT, keys);
  sign = (payload, expiresIn = '1h') =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'clave-1' })
      .setIssuer(`https://securetoken.google.com/${PROJECT}`)
      .setAudience(PROJECT)
      .setSubject('uid-ana')
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
});

describe('firebaseTokenVerifier', () => {
  it('acepta un token válido y devuelve el uid y el email', async () => {
    const token = await sign({ email: 'ana@gmail.com', email_verified: true });
    await expect(verify(token)).resolves.toEqual({ uid: 'uid-ana', email: 'ana@gmail.com' });
  });

  it('rechaza un token vencido', async () => {
    const token = await sign({ email: 'ana@gmail.com', email_verified: true }, '-1m');
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  // Un token de otro proyecto de Firebase tiene una firma válida de Google, pero no es nuestro.
  it('rechaza un token de otro proyecto', async () => {
    const other = firebaseTokenVerifier('otro-proyecto', keys);
    const token = await sign({ email: 'ana@gmail.com', email_verified: true });
    await expect(other(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza un email sin verificar', async () => {
    const token = await sign({ email: 'ana@gmail.com', email_verified: false });
    await expect(verify(token)).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rechaza algo que no es un token', async () => {
    await expect(verify('hola')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});
