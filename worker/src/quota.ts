// Límite diario de dictados por persona (ADR 0031), con Workers KV.
//
// La cuota gratis de Workers AI es de toda la cuenta: sin un límite por persona, un error en la
// app (un bucle) o un uso desmedido dejaría a toda la familia sin IA por el resto del día.
// KV no es transaccional: dos pedidos simultáneos pueden contar uno solo. Para un límite
// orientativo alcanza.

/** Lo que se usa de un KV de Cloudflare (así los tests pasan uno falso). */
export interface CounterStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

/** El contador de un día se borra solo a las 48 horas. */
const TTL_SECONDS = 48 * 60 * 60;

/** Fecha de hoy en Argentina, AAAA-MM-DD: el día de la cuota empieza a la medianoche local. */
export function quotaDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Suma un uso. Devuelve `false`, sin sumar, si ya se llegó al límite. */
export async function consumeQuota(
  store: CounterStore,
  uid: string,
  day: string,
  limit: number,
): Promise<boolean> {
  const key = `uso:${uid}:${day}`;
  const used = Number(await store.get(key)) || 0;
  if (used >= limit) return false;
  await store.put(key, String(used + 1), { expirationTtl: TTL_SECONDS });
  return true;
}
