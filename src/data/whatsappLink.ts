// Vincular WhatsApp (ADR 0033): la app le habla al mismo Worker del dictado (ADR 0031), con el
// token de Firebase. El vínculo vive en el KV del Worker: la app no lo puede leer ni escribir
// por su cuenta, y por eso todo pasa por acá y necesita conexión.

/** Por qué falló un pedido al Worker. */
export type WhatsAppLinkErrorCode = 'offline' | 'failed';

export class WhatsAppLinkError extends Error {
  override name = 'WhatsAppLinkError';
  constructor(readonly code: WhatsAppLinkErrorCode) {
    super(`No se pudo hablar con el Worker (${code})`);
  }
}

export interface LinkCode {
  code: string;
  /** Cuándo vence, en ms. */
  expiresAt: number;
}

export interface WhatsAppLink {
  /** `false` sin Worker configurado (por ejemplo, con los emuladores). */
  configured: boolean;
  /** El número vinculado, con el medio oculto ("+54 ••• 6789"), o `null`. */
  status: () => Promise<string | null>;
  requestCode: () => Promise<LinkCode>;
  unlink: () => Promise<void>;
}

export interface WhatsAppLinkDeps {
  /** El origen del Worker (`https://…workers.dev`), o `null` si no hay. */
  baseUrl: string | null;
  getToken: () => Promise<string | null>;
  fetch: typeof fetch;
  isOnline: () => boolean;
  timeoutMs?: number;
}

const TIMEOUT_MS = 10_000;

/** El origen del Worker a partir de la URL del dictado (termina en /interpretar). */
export function workerOrigin(dictationUrl: string | undefined): string | null {
  if (!dictationUrl) return null;
  try {
    return new URL(dictationUrl).origin;
  } catch {
    return null;
  }
}

export function createWhatsAppLink(deps: WhatsAppLinkDeps): WhatsAppLink {
  async function call(method: string, path: string): Promise<unknown> {
    if (!deps.baseUrl) throw new WhatsAppLinkError('failed');
    if (!deps.isOnline()) throw new WhatsAppLinkError('offline');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, deps.timeoutMs ?? TIMEOUT_MS);
    try {
      const token = await deps.getToken();
      if (!token) throw new WhatsAppLinkError('failed');
      const response = await deps.fetch(`${deps.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new WhatsAppLinkError('failed');
      return await response.json();
    } catch (error) {
      if (error instanceof WhatsAppLinkError) throw error;
      // Sin red a mitad de camino, timeout o respuesta que no es JSON.
      throw new WhatsAppLinkError(deps.isOnline() ? 'failed' : 'offline');
    } finally {
      clearTimeout(timer);
    }
  }

  function phoneOf(body: unknown): string | null {
    const phone = (body as { phone?: unknown } | null)?.phone;
    if (phone === null) return null;
    if (typeof phone === 'string') return phone;
    throw new WhatsAppLinkError('failed');
  }

  return {
    configured: deps.baseUrl !== null,
    status: async () => phoneOf(await call('GET', '/whatsapp/vinculo')),
    requestCode: async () => {
      const body = (await call('POST', '/whatsapp/codigo')) as Partial<LinkCode> | null;
      if (typeof body?.code !== 'string' || typeof body.expiresAt !== 'number') {
        throw new WhatsAppLinkError('failed');
      }
      return { code: body.code, expiresAt: body.expiresAt };
    },
    unlink: async () => {
      await call('DELETE', '/whatsapp/vinculo');
    },
  };
}
