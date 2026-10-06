// `POST /interpretar` (ADR 0031): recibe una frase dictada y devuelve lo que entendió la IA.
//
// Orden de los controles, del más barato al más caro:
//   1. CORS: solo responde a la app (los navegadores no dejan que otra página lo use).
//   2. Token de Firebase válido → si no, 401.
//   3. Email en la lista de la familia → si no, 403.
//   4. Pedido con la forma y el tamaño esperados → si no, 400.
//   5. Cuota diaria de la persona → si no, 429.
//   6. La IA → si falla, 502.
// El Worker no guarda la frase ni la escribe en los logs.
//
// Las dependencias llegan por parámetro: en los tests se reemplazan por versiones falsas.

import { validateAiInput, type AiInput } from '../../src/domain/voice/aiPrompt';
import { InvalidTokenError, type VerifyToken } from './auth';
import { consumeQuota, quotaDay, type CounterStore } from './quota';

export interface HandlerDeps {
  verifyToken: VerifyToken;
  isAllowed: (email: string) => Promise<boolean>;
  quota: CounterStore;
  dailyLimit: number;
  allowedOrigins: readonly string[];
  /** Llama al modelo y devuelve su respuesta cruda (la valida la app). */
  interpret: (input: AiInput) => Promise<unknown>;
  now?: () => Date;
}

export const ROUTE = '/interpretar';

function corsHeaders(origin: string | null, deps: HandlerDeps): Record<string, string> {
  if (origin === null || !deps.allowedOrigins.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handleRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  const origin = request.headers.get('Origin');
  const cors = corsHeaders(origin, deps);
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });

  // Un navegador desde otra página: ni siquiera se mira el pedido. Sin `Origin` (curl) sí se
  // atiende, pero igual hace falta un token válido.
  if (origin !== null && !deps.allowedOrigins.includes(origin)) {
    return json(403, { error: 'origin' });
  }
  if (new URL(request.url).pathname !== ROUTE) return json(404, { error: 'notFound' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return json(405, { error: 'method' });

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
