// Punto de entrada del Worker de Cloudflare (ADR 0031): conecta el handler con lo que da
// Cloudflare (la IA, el KV y las variables de `wrangler.jsonc`).

import { AI_RESPONSE_SCHEMA, buildAiMessages } from '../../src/domain/voice/aiPrompt';
import { isAllowedEmail } from './access';
import { firebaseTokenVerifier } from './auth';
import { handleRequest } from './handler';

export interface Env {
  AI: Ai;
  QUOTA: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  /** Orígenes de la app, separados por comas. */
  ALLOWED_ORIGINS: string;
  MODEL: string;
  DAILY_LIMIT: string;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, {
      verifyToken: firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
      isAllowed: isAllowedEmail,
      quota: env.QUOTA,
      dailyLimit: Number(env.DAILY_LIMIT),
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      interpret: async (input) => {
        // El nombre del modelo viene de la configuración, así se cambia sin tocar el código.
        const output = (await env.AI.run(
          env.MODEL as keyof AiModels,
          {
            messages: buildAiMessages(input),
            response_format: { type: 'json_schema', json_schema: AI_RESPONSE_SCHEMA },
            max_tokens: 300,
            temperature: 0,
          } as never,
        )) as { response?: unknown };
        return output.response;
      },
    });
  },
} satisfies ExportedHandler<Env>;
