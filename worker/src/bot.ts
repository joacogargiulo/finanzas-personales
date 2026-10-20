// El bot de WhatsApp (ADR 0032, 0033 y 0034): decide qué responder a cada mensaje.
//
//   vincular NNNNNN      → vincula el número (11c)
//   texto o audio        → se interpreta (IA, o el parser de reglas) y se responde con un resumen y
//                          los botones Guardar / Cancelar. Nada se escribe todavía.
//   Guardar / sí         → se vuelve a validar con los datos de ese momento y se escribe en
//                          Firestore como la persona (las reglas se aplican igual que en la app).
//   Cancelar / no        → se descarta lo pendiente.
//
// Orden de los controles, del más barato al más caro: número vinculado → email guardado y en la
// lista → cuota de IA → lectura de Firestore → IA. Nunca se escribe el texto de un mensaje en los
// logs. Las dependencias llegan por parámetro: los tests las reemplazan por versiones falsas.

import { aiInput, type AiInput } from '../../src/domain/voice/aiPrompt';
import { parseAiResult } from '../../src/domain/voice/aiResult';
import { parsePhrase, type PhraseContext } from '../../src/domain/voice/parsePhrase';
import { draftFromPhrase } from '../../src/domain/voice/phraseFields';
import { SCHEMA_VERSION } from '../../src/domain/model';
import { validateTransaction, type ValidationContext } from '../../src/domain/validation';
import {
  BOT_REPLIES,
  invalidReply,
  missingReply,
  parseConfirmation,
  parseLinkCommand,
  transactionSummary,
  whatsappTransactionDoc,
} from '../../src/domain/whatsapp';
import { linkedEmail, linkedUid, redeemCode, type LinkStore } from './links';
import { clearPending, getPending, putPending } from './pending';
import { consumeQuota, quotaDay, type CounterStore } from './quota';
import type { UserContext } from './firestoreRest';

/** Un mensaje recibido, con lo que se usa de él. */
export type IncomingMessage = { id: string; from: string } & (
  | { kind: 'text'; text: string }
  /** Se tocó un botón de un mensaje del bot. */
  | { kind: 'button'; buttonId: string }
  | { kind: 'audio'; mediaId: string }
  /** Foto, sticker, ubicación... */
  | { kind: 'other' }
);

export interface ReplyButton {
  id: string;
  /** WhatsApp admite hasta 20 caracteres. */
  title: string;
}

/** Lo que responde el bot: un texto, con botones o sin ellos. */
export interface BotReply {
  text: string;
  buttons?: ReplyButton[];
}

export interface BotDeps {
  /** El KV de WhatsApp: vínculos, emails, pendientes y mensajes ya vistos. */
  store: LinkStore;
  quota: CounterStore;
  dailyLimit: number;
  isAllowed: (email: string) => Promise<boolean>;
  /** La IA de Llama: devuelve su respuesta cruda (la valida el dominio). */
  interpret: (input: AiInput) => Promise<unknown>;
  /** Baja y transcribe un audio. `null` si pasa el tope de tamaño. */
  transcribe: (mediaId: string) => Promise<string | null>;
  /** Lee el perfil, las cuentas y las categorías de la persona (como ella). `null`: sin perfil. */
  readContext: (uid: string) => Promise<UserContext | null>;
  /** Crea el movimiento (como la persona). `'exists'` si ya estaba. */
  createTransaction: (
    uid: string,
    id: string,
    doc: ReturnType<typeof whatsappTransactionDoc>,
  ) => Promise<'created' | 'exists'>;
  now?: () => Date;
}

const SAVE_PREFIX = 'guardar:';
const CANCEL_PREFIX = 'cancelar:';

/** `wa_` + los primeros 20 caracteres hex del SHA-256 del ID del mensaje original. */
export async function transactionId(messageId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(messageId));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `wa_${hex.slice(0, 20)}`;
}

function validationContext(user: UserContext): ValidationContext {
  return {
    accounts: new Map(user.accounts.map((a) => [a.id, a])),
    categories: new Map(user.categories.map((c) => [c.id, c])),
  };
}

const text = (value: string): BotReply => ({ text: value });

/** Decide qué responder a un mensaje. */
export async function replyTo(message: IncomingMessage, deps: BotDeps): Promise<BotReply> {
  const now = deps.now?.() ?? new Date();

  if (message.kind === 'text') {
    const code = parseLinkCommand(message.text);
    if (code !== null) return text(BOT_REPLIES[await redeemCode(deps.store, message.from, code)]);
  }

  const uid = await linkedUid(deps.store, message.from);
  if (uid === null) return text(BOT_REPLIES.notLinked);
  const email = await linkedEmail(deps.store, uid);
  if (email === null) return text(BOT_REPLIES.relink);
  if (!(await deps.isAllowed(email))) return text(BOT_REPLIES.noAccess);

  try {
    switch (message.kind) {
      case 'button': {
        const save = message.buttonId.startsWith(SAVE_PREFIX);
        const cancel = message.buttonId.startsWith(CANCEL_PREFIX);
        if (!save && !cancel) return text(BOT_REPLIES.expired);
        const txId = message.buttonId.slice((save ? SAVE_PREFIX : CANCEL_PREFIX).length);
        return await confirm(uid, message.from, txId, save ? 'save' : 'cancel', deps, now);
      }
      case 'text': {
        const answer = parseConfirmation(message.text);
        if (answer !== null) {
          const pending = await getPending(deps.store, message.from);
          if (pending === null) return text(BOT_REPLIES.expired);
          return await confirm(uid, message.from, pending.txId, answer, deps, now);
        }
        return await propose(uid, message, message.text, deps, now);
      }
      case 'audio':
        return await propose(uid, message, null, deps, now);
      case 'other':
        return text(BOT_REPLIES.onlyTextOrAudio);
    }
  } catch (error) {
    // Solo el tipo de error: ni el mensaje ni los datos.
    console.error('Falló el bot', error instanceof Error ? error.name : 'desconocido');
    return text(BOT_REPLIES.failed);
  }
}

/** Interpreta un texto o un audio y ofrece guardarlo. Todavía no escribe nada. */
async function propose(
  uid: string,
  message: IncomingMessage,
  textToParse: string | null,
  deps: BotDeps,
  now: Date,
): Promise<BotReply> {
  const day = quotaDay(now);
  // La IA comparte la cuota diaria con el dictado de la app (ADR 0031).
  const aiAllowed = await consumeQuota(deps.quota, uid, day, deps.dailyLimit);

  let phrase = textToParse;
  if (message.kind === 'audio') {
    // Sin cuota no hay Whisper, y sin Whisper no hay texto: se pide que lo manden escrito.
    if (!aiAllowed) return text(BOT_REPLIES.audioQuota);
    const transcript = await deps.transcribe(message.mediaId);
    if (transcript === null) return text(BOT_REPLIES.audioTooLong);
    if (transcript === '') return text(BOT_REPLIES.audioUnclear);
    phrase = transcript;
  }
  if (phrase === null) return text(BOT_REPLIES.onlyTextOrAudio);

  const user = await deps.readContext(uid);
  if (user === null) return text(BOT_REPLIES.openAppFirst);
  if (user.schemaVersion > SCHEMA_VERSION) return text(BOT_REPLIES.writesBlocked);

  const ctx: PhraseContext = { accounts: user.accounts, categories: user.categories, today: day };
  let parsed = null;
  if (aiAllowed) {
    try {
      parsed = parseAiResult(await deps.interpret(aiInput(phrase, ctx)), phrase, ctx);
    } catch {
      // La IA falló: se usa el parser de reglas, como en la app.
    }
  }
  parsed ??= parsePhrase(phrase, ctx);

  const draft = draftFromPhrase(parsed, user.accounts);
  if (!draft.ok) {
    return text(missingReply(draft.unclear));
  }
  const checked = validateTransaction(draft.draft, validationContext(user));
  if (!checked.ok) return text(invalidReply(checked.error));

  const txId = await transactionId(message.id);
  await putPending(deps.store, message.from, { txId, draft: draft.draft });
  return {
    text: `${transactionSummary(checked.value, validationContext(user), day)}\n\n¿Lo guardo?`,
    buttons: [
      { id: `${SAVE_PREFIX}${txId}`, title: 'Guardar' },
      { id: `${CANCEL_PREFIX}${txId}`, title: 'Cancelar' },
    ],
  };
}

/** Guarda o descarta el movimiento pendiente. */
async function confirm(
  uid: string,
  phone: string,
  txId: string,
  answer: 'save' | 'cancel',
  deps: BotDeps,
  now: Date,
): Promise<BotReply> {
  const pending = await getPending(deps.store, phone);
  if (pending === null || pending.txId !== txId) return text(BOT_REPLIES.expired);
  if (answer === 'cancel') {
    await clearPending(deps.store, phone);
    return text(BOT_REPLIES.cancelled);
  }

  // En 10 minutos pudo archivarse una cuenta o una categoría: se lee y se valida de nuevo.
  const user = await deps.readContext(uid);
  if (user === null) return text(BOT_REPLIES.openAppFirst);
  if (user.schemaVersion > SCHEMA_VERSION) return text(BOT_REPLIES.writesBlocked);
  const checked = validateTransaction(pending.draft, validationContext(user));
  if (!checked.ok) {
    await clearPending(deps.store, phone);
    return text(invalidReply(checked.error));
  }

  // Si ya estaba (se tocó Guardar dos veces), cuenta como guardado.
  await deps.createTransaction(uid, txId, whatsappTransactionDoc(checked.value, now.getTime()));
  await clearPending(deps.store, phone);
  return text(BOT_REPLIES.saved);
}
