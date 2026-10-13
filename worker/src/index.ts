// Punto de entrada del Worker de Cloudflare (ADR 0031 y 0033): conecta los handlers con lo que
// da Cloudflare (la IA, los KV, las variables de `wrangler.jsonc` y los secretos).
//   /whatsapp  → el webhook de Meta (whatsapp.ts)
//   lo demás   → las rutas de la app (handler.ts)

import { AI_RESPONSE_SCHEMA, buildAiMessages } from '../../src/domain/voice/aiPrompt';
import { isAllowedEmail } from './access';
import { firebaseTokenVerifier } from './auth';
import { handleRequest } from './handler';
import { handleWebhook, metaSender, WEBHOOK_ROUTE } from './whatsapp';

export interface Env {
  AI: Ai;
  QUOTA: KVNamespace;
  /** Los vínculos de WhatsApp (ADR 0033). */
  WHATSAPP: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  /** Orígenes de la app, separados por comas. */
  ALLOWED_ORIGINS: string;
  MODEL: string;
  DAILY_LIMIT: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  GRAPH_API_VERSION: string;
  // Secretos (`wrangler secret put`): no están en wrangler.jsonc ni en el repo.
  WHATSAPP_TOKEN?: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_VERIFY_TOKEN?: string;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === WEBHOOK_ROUTE) {
      return handleWebhook(
        request,
        {
          appSecret: env.WHATSAPP_APP_SECRET ?? '',
          verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
          store: env.WHATSAPP,
          send: metaSender({
            token: env.WHATSAPP_TOKEN ?? '',
            phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
            apiVersion: env.GRAPH_API_VERSION,
            fetch: (...args) => fetch(...args),
          }),
        },
        (work) => {
          ctx.waitUntil(work);
        },
      );
    }

    return handleRequest(request, {
      verifyToken: firebaseTokenVerifier(env.FIREBASE_PROJECT_ID),
      isAllowed: isAllowedEmail,
      quota: env.QUOTA,
      dailyLimit: Number(env.DAILY_LIMIT),
      allowedOrigins: env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
      links: env.WHATSAPP,
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
