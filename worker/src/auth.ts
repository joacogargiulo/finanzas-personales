// Verificación del token de Firebase (ADR 0031). La app manda su "ID token": un JWT firmado
// por Google. Se verifica la firma con las claves públicas de Google (JWKS), y que sea de este
// proyecto, no haya vencido y tenga el email verificado. Así el Worker sabe quién pide, sin
// hablar con Firebase en cada pedido.

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';

const GOOGLE_KEYS = new URL(
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
);

/** Se crea una vez por instancia: `jose` guarda las claves en memoria y las renueva solo. */
let googleKeys: JWTVerifyGetKey | null = null;

export interface TokenUser {
  uid: string;
  email: string;
}

export type VerifyToken = (token: string) => Promise<TokenUser>;

/** El token no sirve: falta, está mal firmado, venció, es de otro proyecto o el email no está verificado. */
export class InvalidTokenError extends Error {
  override name = 'InvalidTokenError';
}

export function firebaseTokenVerifier(projectId: string, keys?: JWTVerifyGetKey): VerifyToken {
  return async (token) => {
    const getKey = keys ?? (googleKeys ??= createRemoteJWKSet(GOOGLE_KEYS));
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, getKey, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      }));
    } catch (error) {
      throw new InvalidTokenError(error instanceof Error ? error.message : 'token inválido');
    }
    const { sub, email } = payload;
    if (!sub || typeof email !== 'string' || payload['email_verified'] !== true) {
      throw new InvalidTokenError('el token no tiene un email verificado');
    }
    return { uid: sub, email };
  };
}
