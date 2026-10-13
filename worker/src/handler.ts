// Las rutas que usa la app (ADR 0031 y 0033):
//   POST   /interpretar        recibe una frase dictada y devuelve lo que entendió la IA
//   POST   /whatsapp/codigo    crea un código para vincular WhatsApp
//   GET    /whatsapp/vinculo   el número vinculado (con el medio oculto), o null
//   DELETE /whatsapp/vinculo   desvincula el número
// El webhook de Meta (/whatsapp) no pasa por acá: no lo llama la app (ver whatsapp.ts).
//
// Orden de los controles, del más barato al más caro:
//   1. CORS: solo responde a la app (los navegadores no dejan que otra página lo use).
//   2. Ruta y método conocidos → si no, 404 o 405.
//   3. Token de Firebase válido → si no, 401.
//   4. Email en la lista de la familia → si no, 403.
//   Y en /interpretar:
//   5. Pedido con la forma y el tamaño esperados → si no, 400.
//   6. Cuota diaria de la persona → si no, 429.
//   7. La IA → si falla, 502.
// El Worker no guarda la frase ni la escribe en los logs.
//
// Las dependencias llegan por parámetro: en los tests se reemplazan por versiones falsas.

import { validateAiInput, type AiInput } from '../../src/domain/voice/aiPrompt';
import { maskPhone } from '../../src/domain/whatsapp';
import { InvalidTokenError, type TokenUser, type VerifyToken } from './auth';
import { createCode, linkedPhone, unlink, type LinkStore } from './links';
import { consumeQuota, quotaDay, type CounterStore } from './quota';

export interface HandlerDeps {
  verifyToken: VerifyToken;
  isAllowed: (email: string) => Promise<boolean>;
  quota: CounterStore;
  dailyLimit: number;
  allowedOrigins: readonly string[];
  /** Llama al modelo y devuelve su respuesta cruda (la valida la app). */
  interpret: (input: AiInput) => Promise<unknown>;
  /** El KV de los vínculos de WhatsApp. */
  links: LinkStore;
  now?: () => Date;
}

export const ROUTE = '/interpretar';
export const LINK_CODE_ROUTE = '/whatsapp/codigo';
export const LINK_ROUTE = '/whatsapp/vinculo';

type Json = (status: number, body: unknown) => Response;
type RouteHandler = (
  request: Request,
  user: TokenUser,
  deps: HandlerDeps,
  json: Json,
) => Promise<Response>;

const ROUTES: Record<string, Partial<Record<string, RouteHandler>>> = {
  [ROUTE]: { POST: interpretPhrase },
  [LINK_CODE_ROUTE]: { POST: createLinkCode },
  [LINK_ROUTE]: { GET: readLink, DELETE: deleteLink },
};

function corsHeaders(origin: string | null, deps: HandlerDeps): Record<string, string> {
  if (origin === null || !deps.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps);
  const json: Json = (status, body) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // Un navegador desde otra página: ni siquiera se mira el pedido. Sin `Origin` (curl) sí se
  // atiende, pero igual hace falta un token válido.
  if (origin !== null && !deps.allowedOrigins.includes(origin)) {
    return json(403, { error: 'origin' });
  }
  const route = ROUTES[new URL(request.url).pathname];
  if (!route) return json(404, { error: 'notFound' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const handler = route[request.method];
  if (!handler) return json(405, { error: 'method' });

  const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return json(401, { error: 'token' });
  let user;
  try {
    user = await deps.verifyToken(token);
  } catch (error) {
    if (error instanceof InvalidTokenError) return json(401, { error: 'token' });
    throw error;
  }
  if (!(await deps.isAllowed(user.email))) return json(403, { error: 'access' });

  return handler(request, user, deps, json);
}

async function interpretPhrase(
  request: Request,
  user: TokenUser,
  deps: HandlerDeps,
  json: Json,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'input' });
  }
  const input = validateAiInput(body);
  if (!input) return json(400, { error: 'input' });

  const day = quotaDay(deps.now?.());
  if (!(await consumeQuota(deps.quota, user.uid, day, deps.dailyLimit))) {
    return json(429, { error: 'quota' });
  }

  try {
    return json(200, { result: await deps.interpret(input) });
  } catch (error) {
    // Solo el tipo de error: la frase no se registra.
    console.error('Falló la IA', error instanceof Error ? error.name : 'desconocido');
    return json(502, { error: 'ai' });
  }
}

async function createLinkCode(
  _request: Request,
  user: TokenUser,
  deps: HandlerDeps,
  json: Json,
): Promise<Response> {
  const now = (deps.now?.() ?? new Date()).getTime();
  return json(200, await createCode(deps.links, user.uid, now));
}

async function readLink(
  _request: Request,
  user: TokenUser,
  deps: HandlerDeps,
  json: Json,
): Promise<Response> {
  const phone = await linkedPhone(deps.links, user.uid);
  return json(200, { phone: phone === null ? null : maskPhone(phone) });
}

async function deleteLink(
  _request: Request,
  user: TokenUser,
  deps: HandlerDeps,
  json: Json,
): Promise<Response> {
  await unlink(deps.links, user.uid);
  return json(200, { phone: null });
}
