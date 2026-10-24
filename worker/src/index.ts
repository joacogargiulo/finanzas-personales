// Punto de entrada del Worker de Cloudflare (ADR 0031, 0033, 0034 y 0035): conecta los handlers con lo
// que da Cloudflare (la IA, los KV, las variables de `wrangler.jsonc` y los secretos).
//   /whatsapp  → el webhook de Meta (whatsapp.ts) y el bot (bot.ts)
//   lo demás   → las rutas de la app (handler.ts)

import { isAllowedEmail } from './access';
import { interpret, interpretBot, transcribe, type AiRun } from './ai';
import { firebaseTokenVerifier } from './auth';
import type { BotDeps } from './bot';
import { parseServiceAccount, userIdToken, type ServiceAccount } from './firebaseUser';
import { listTransactionsInRange, sumTransactions } from './firestoreQueries';
import { createTransaction, readUserContext } from './firestoreRest';
import { handleRequest } from './handler';
import {
  handleWebhook,
  metaAudioDownloader,
  metaButtonSender,
  metaListSender,
  metaSender,
  WEBHOOK_ROUTE,
} from './whatsapp';

export interface Env {
  AI: Ai;
  QUOTA: KVNamespace;
  /** Los vínculos, los pendientes y el ID token de WhatsApp (ADR 0033 y 0034). */
  WHATSAPP: KVNamespace;
  FIREBASE_PROJECT_ID: string;
  /** La API key web de Firebase: no es un secreto, está en el código de la app. */
  FIREBASE_API_KEY: string;
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
  /** El JSON de la cuenta de servicio `whatsapp-bot` (sin roles: solo firma tokens, ADR 0034). */
  FIREBASE_SERVICE_ACCOUNT?: string;
}

/** El binding `AI` de Cloudflare con la firma mínima que usa `ai.ts`. */
function aiRunner(env: Env): AiRun {
  return (model, input) => env.AI.run(model as keyof AiModels, input as never);
}

function botDeps(env: Env): BotDeps {
  const fetcher: typeof fetch = (...args) => fetch(...args);
  const meta = {
    token: env.WHATSAPP_TOKEN ?? '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
    apiVersion: env.GRAPH_API_VERSION,
    fetch: fetcher,
  };
  const download = metaAudioDownloader(meta);
  const run = aiRunner(env);
  const firestore = { projectId: env.FIREBASE_PROJECT_ID, fetch: fetcher };
  // Sin el secreto, el bot sigue vinculando pero no puede leer ni escribir datos.
  let account: ServiceAccount | null = null;
  const token = (uid: string) => {
    account ??= parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT ?? '');
    return userIdToken(
      {
        account,
        apiKey: env.FIREBASE_API_KEY,
        store: env.WHATSAPP,
        fetch: fetcher,
      },
      uid,
    );
  };

  return {
    store: env.WHATSAPP,
    quota: env.QUOTA,
    dailyLimit: Number(env.DAILY_LIMIT),
    isAllowed: isAllowedEmail,
    // El nombre del modelo viene de la configuración, así se cambia sin tocar el código.
    interpret: (input) => interpretBot(run, env.MODEL, input),
    transcribe: async (mediaId) => {
      const audio = await download(mediaId);
      return audio === 'tooLong' ? null : transcribe(run, audio);
    },
    readContext: async (uid) => readUserContext(firestore, uid, await token(uid)),
    createTransaction: async (uid, id, doc) =>
      createTransaction(firestore, uid, await token(uid), id, doc),
    sumTransactions: async (uid, filters, field) =>
      sumTransactions(firestore, uid, await token(uid), filters, field),
    readTransactions: async (uid, range) =>
      listTransactionsInRange(firestore, uid, await token(uid), range),
  };
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (new URL(request.url).pathname === WEBHOOK_ROUTE) {
      const meta = {
        token: env.WHATSAPP_TOKEN ?? '',
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        apiVersion: env.GRAPH_API_VERSION,
        fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
      };
      return handleWebhook(
        request,
        {
          appSecret: env.WHATSAPP_APP_SECRET ?? '',
          verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
          send: metaSender(meta),
          sendButtons: metaButtonSender(meta),
          sendList: metaListSender(meta),
          bot: botDeps(env),
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
      interpret: (input) => interpret(aiRunner(env), env.MODEL, input),
    });
  },
} satisfies ExportedHandler<Env>;
