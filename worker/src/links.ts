// Vínculo entre un número de WhatsApp y un usuario, guardado en Workers KV (ADR 0033).
//
// Claves:
//   codigo:{código}  → uid      el código de 6 cifras, vence a los 10 minutos
//   tel:{número}     → uid      de quién es el número (lo usa el bot)
//   uid:{uid}        → número   qué número tiene la persona (lo usa Ajustes)
//   fallos:{número}  → cantidad códigos equivocados en la última hora
// Un usuario tiene como mucho un número, y un número es de un solo usuario.
//
// KV no es transaccional y un cambio tarda hasta 60 segundos en verse en todos lados. Para una
// familia que vincula una vez alcanza (ADR 0033).

import {
  formatLinkCode,
  LINK_CODE_TTL_SECONDS,
  MAX_FAILED_LINK_ATTEMPTS,
  type LinkOutcome,
} from '../../src/domain/whatsapp';

/** Lo que se usa de un KV de Cloudflare (así los tests pasan uno falso). */
export interface LinkStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

const FAILURES_TTL_SECONDS = 60 * 60;

/** Un número al azar de 0 a 999.999, sin sesgo (descarta lo que sobra de 2³²). */
export function randomCodeNumber(): number {
  const limit = Math.floor(2 ** 32 / 1_000_000) * 1_000_000;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    const value = buffer[0] ?? limit;
    if (value < limit) return value % 1_000_000;
  }
}

/** Crea un código para el usuario. Devuelve el código y cuándo vence (en ms). */
export async function createCode(
  store: LinkStore,
  uid: string,
  now: number,
  random: () => number = randomCodeNumber,
): Promise<{ code: string; expiresAt: number }> {
  // Con pocos códigos vivos a la vez, casi nunca hace falta un segundo intento.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = formatLinkCode(random());
    if ((await store.get(`codigo:${code}`)) !== null) continue;
    await store.put(`codigo:${code}`, uid, { expirationTtl: LINK_CODE_TTL_SECONDS });
    return { code, expiresAt: now + LINK_CODE_TTL_SECONDS * 1000 };
  }
  throw new Error('No se encontró un código libre');
}

/** Usa un código mandado desde un número: si es válido, vincula el número con su usuario. */
export async function redeemCode(
  store: LinkStore,
  phone: string,
  code: string,
): Promise<LinkOutcome> {
  const failuresKey = `fallos:${phone}`;
  const failures = Number(await store.get(failuresKey)) || 0;
  if (failures >= MAX_FAILED_LINK_ATTEMPTS) return 'tooManyAttempts';

  const uid = await store.get(`codigo:${code}`);
  if (uid === null) {
    await store.put(failuresKey, String(failures + 1), { expirationTtl: FAILURES_TTL_SECONDS });
    return 'invalidCode';
  }

  // Cada código sirve una sola vez.
  await store.delete(`codigo:${code}`);
  // Si la persona tenía otro número, ese deja de estar vinculado. Si el número era de otra
  // persona (por ejemplo, un celular que cambió de manos), esa persona lo pierde.
  const previousPhone = await store.get(`uid:${uid}`);
  if (previousPhone !== null && previousPhone !== phone) await store.delete(`tel:${previousPhone}`);
  const previousUid = await store.get(`tel:${phone}`);
  if (previousUid !== null && previousUid !== uid) await store.delete(`uid:${previousUid}`);

  await store.put(`tel:${phone}`, uid);
  await store.put(`uid:${uid}`, phone);
  if (failures > 0) await store.delete(failuresKey);
  return 'linked';
}

/** El usuario dueño del número, o `null` si no está vinculado. */
export function linkedUid(store: LinkStore, phone: string): Promise<string | null> {
  return store.get(`tel:${phone}`);
}

/** El número vinculado del usuario, o `null`. */
export function linkedPhone(store: LinkStore, uid: string): Promise<string | null> {
  return store.get(`uid:${uid}`);
}

/** Desvincula el número del usuario, si tiene uno. Repetirlo no hace nada. */
export async function unlink(store: LinkStore, uid: string): Promise<void> {
  const phone = await store.get(`uid:${uid}`);
  if (phone !== null && (await store.get(`tel:${phone}`)) === uid) {
    await store.delete(`tel:${phone}`);
  }
  await store.delete(`uid:${uid}`);
}
