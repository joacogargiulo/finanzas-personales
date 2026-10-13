// Webhook de la WhatsApp Cloud API (ADR 0032 y 0033): Meta llama a `/whatsapp` cada vez que
// alguien le escribe al bot.
//   GET  /whatsapp  Meta comprueba que la URL es nuestra: si el token de verificación coincide,
//                   se le devuelve el número de desafío que mandó.
//   POST /whatsapp  Un mensaje nuevo. Se verifica la firma, se responde 200 enseguida (si
//                   tarda, Meta reintenta) y el trabajo sigue con `waitUntil`.
// Por ahora el bot solo entiende "vincular 123456"; cargar movimientos llega en la 11d.
// Nunca se escribe el texto de un mensaje en los logs.

import { BOT_REPLIES, isWhatsAppNumber, parseLinkCommand } from '../../src/domain/whatsapp';
import { linkedUid, redeemCode, type LinkStore } from './links';

export const WEBHOOK_ROUTE = '/whatsapp';

/** Manda un mensaje de texto a un número. */
export type SendText = (to: string, text: string) => Promise<void>;

export interface WebhookDeps {
  /** El "app secret" de la app de Meta: con él firma cada webhook. */
  appSecret: string;
  /** El texto que se carga en Meta al configurar el webhook. */
  verifyToken: string;
  store: LinkStore;
  send: SendText;
}

/** Un mensaje recibido, con lo que se usa de él. */
export interface IncomingMessage {
  id: string;
  from: string;
  /** El texto, o `null` si no es un mensaje de texto (audio, foto, etc.). */
  text: string | null;
}

/** Un mensaje se procesa una sola vez aunque Meta lo mande de nuevo (lo recuerda un día). */
const SEEN_TTL_SECONDS = 24 * 60 * 60;

export async function handleWebhook(
  request: Request,
  deps: WebhookDeps,
  waitUntil: (work: Promise<unknown>) => void,
): Promise<Response> {
  if (request.method === 'GET') return verifySubscription(new URL(request.url), deps);
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  // Sin los secretos cargados, no se puede verificar nada.
  if (!deps.appSecret) return new Response(null, { status: 503 });

  // La firma es sobre los bytes exactos: se leen antes de interpretar el JSON.
  const body = await request.arrayBuffer();
  const signature = request.headers.get('X-Hub-Signature-256');
  if (!(await isValidSignature(body, signature, deps.appSecret))) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    // Firmado por Meta pero ilegible: no tiene sentido que lo reintente.
    return new Response(null, { status: 200 });
  }
  const messages = extractMessages(payload);
  if (messages.length > 0) {
    waitUntil(Promise.all(messages.map((message) => processMessage(message, deps))));
  }
  return new Response(null, { status: 200 });
}

function verifySubscription(url: URL, deps: WebhookDeps): Response {
  const params = url.searchParams;
  if (
    deps.verifyToken !== '' &&
    params.get('hub.mode') === 'subscribe' &&
    params.get('hub.verify_token') === deps.verifyToken
  ) {
    return new Response(params.get('hub.challenge') ?? '', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new Response(null, { status: 403 });
}

/**
 * Meta manda `X-Hub-Signature-256: sha256=<HMAC-SHA256 del cuerpo con el app secret>`. Solo
 * Meta conoce el secreto, así que nadie más puede fabricar un webhook válido.
 * `crypto.subtle.verify` compara en tiempo constante: no deja adivinar la firma midiendo cuánto
 * tarda en rechazarla.
 */
export async function isValidSignature(
  body: ArrayBuffer,
  header: string | null,
  secret: string,
): Promise<boolean> {
  const hex = /^sha256=([0-9a-f]{64})$/.exec(header ?? '')?.[1];
  if (!hex) return false;
  const signature = new Uint8Array(32);
  for (let i = 0; i < 32; i++) signature[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify('HMAC', key, signature, body);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Los mensajes de un webhook: `entry[].changes[].value.messages[]`. Los avisos de entrega y
 * lectura (`statuses`) no traen mensajes y se ignoran.
 */
export function extractMessages(payload: unknown): IncomingMessage[] {
  if (!isRecord(payload)) return [];
  const messages: IncomingMessage[] = [];
  for (const entry of list(payload['entry'])) {
    if (!isRecord(entry)) continue;
    for (const change of list(entry['changes'])) {
      if (!isRecord(change) || !isRecord(change['value'])) continue;
      for (const message of list(change['value']['messages'])) {
        if (!isRecord(message)) continue;
        const { id, from, type, text } = message;
        if (typeof id !== 'string' || typeof from !== 'string' || !isWhatsAppNumber(from)) continue;
        const body = type === 'text' && isRecord(text) ? text['body'] : null;
        messages.push({ id, from, text: typeof body === 'string' ? body : null });
      }
    }
  }
  return messages;
}

/** Decide qué responder a un mensaje. */
export async function replyTo(message: IncomingMessage, store: LinkStore): Promise<string> {
  const code = message.text === null ? null : parseLinkCommand(message.text);
  if (code !== null) return BOT_REPLIES[await redeemCode(store, message.from, code)];
  return (await linkedUid(store, message.from)) === null
    ? BOT_REPLIES.notLinked
    : BOT_REPLIES.notYet;
}

async function processMessage(message: IncomingMessage, deps: WebhookDeps): Promise<void> {
  try {
    const seenKey = `msg:${message.id}`;
    if ((await deps.store.get(seenKey)) !== null) return;
    await deps.store.put(seenKey, '1', { expirationTtl: SEEN_TTL_SECONDS });
    await deps.send(message.from, await replyTo(message, deps.store));
  } catch (error) {
    // Solo el tipo de error: ni el número ni el texto.
    console.error('Falló un mensaje de WhatsApp', error instanceof Error ? error.message : '');
  }
}

export interface MetaConfig {
  token: string;
  phoneNumberId: string;
  /** Versión de la Graph API, por ejemplo "v25.0". */
  apiVersion: string;
  fetch: typeof fetch;
}

/** Error de la API de Meta; `code` es el código de error de Meta, si vino. */
export class MetaError extends Error {
  override name = 'MetaError';
  constructor(
    readonly status: number,
    readonly code: number | null,
  ) {
    super(`Meta respondió ${String(status)}${code === null ? '' : ` (código ${String(code)})`}`);
  }
}

/** "El número no está en la lista de destinatarios permitidos" (número de prueba). */
const NOT_ALLOWED_RECIPIENT = 131030;

/**
 * En Argentina, WhatsApp manda el número de los celulares con un 9 después del 54
 * (549 11 ...), pero la API a veces solo acepta responder sin ese 9 (54 11 ...). Lo mismo
 * pasa en México con el 1 después del 52. Devuelve la otra forma, o `null` si no aplica.
 */
export function alternateRecipient(waId: string): string | null {
  if (/^549\d{10}$/.test(waId)) return `54${waId.slice(3)}`;
  if (/^521\d{10}$/.test(waId)) return `52${waId.slice(3)}`;
  return null;
}

/** Manda mensajes de texto con la API de Meta (Graph API). */
export function metaSender(config: MetaConfig): SendText {
  const url = `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
  const sendTo = async (to: string, text: string): Promise<void> => {
    const response = await config.fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    });
    if (response.ok) return;
    let code: number | null = null;
    try {
      const body = await response.json<{ error?: { code?: unknown } }>();
      if (typeof body.error?.code === 'number') code = body.error.code;
    } catch {
      // Sin cuerpo JSON: queda solo el estado HTTP.
    }
    throw new MetaError(response.status, code);
  };

  return async (to, text) => {
    try {
      await sendTo(to, text);
    } catch (error) {
      const alternate = alternateRecipient(to);
      if (!(error instanceof MetaError && error.code === NOT_ALLOWED_RECIPIENT && alternate)) {
        throw error;
      }
      await sendTo(alternate, text);
    }
  };
}
