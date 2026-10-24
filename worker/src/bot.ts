// El bot de WhatsApp (ADR 0032 a 0035): decide qué responder a cada mensaje.
//
//   vincular NNNNNN   → vincula el número (11c)
//   texto o audio     → se entiende QUÉ es (IA, o el parser de reglas) y se despacha:
//     movimiento      → si está completo, resumen con Guardar / Cancelar; si falta algo, pregunta
//                       (con botones o lista) y guarda el borrador para completarlo
//     consulta        → cuentas, saldos, gastos de un período: la respuesta la calcula el dominio
//     saludo, gracias, ayuda, otra cosa → textos fijos (o una frase corta del modelo)
//   Guardar / sí      → se vuelve a validar y se escribe en Firestore como la persona
//   Cancelar / no     → se descarta lo pendiente
//   un botón o lista  → completa el borrador sin llamar a la IA
//
// Orden de los controles, del más barato al más caro: número vinculado → email guardado y en la
// lista → saludo/gracias/ayuda (sin IA ni datos) → cuota de IA → lectura de Firestore → IA.
// Los montos nunca van a la IA. Nunca se escribe el texto de un mensaje en los logs. Las
// dependencias llegan por parámetro: los tests las reemplazan por versiones falsas.

import { accountBalances, MAX_BALANCE_ACCOUNTS, type SumTransactions } from './accountBalances';
import {
  applyChoice,
  joinPhrases,
  MAX_BUTTONS,
  parseChoiceId,
  questionFor,
  type ChoiceOption,
} from '../../src/domain/botThread';
import {
  accountsReply,
  balancesReply,
  periodReply,
  queryRange,
  usesPeriod,
  type BotQuery,
  type CurrencyStats,
} from '../../src/domain/botQuery';
import { indexById, selectable, sortAccounts } from '../../src/domain/collections';
import { SCHEMA_VERSION, type Account } from '../../src/domain/model';
import { computeStats, currenciesInUse, type DateRange } from '../../src/domain/stats';
import { validateTransaction, type ValidationContext } from '../../src/domain/validation';
import { aiInput } from '../../src/domain/voice/aiPrompt';
import {
  parseBotIntent,
  quickIntent,
  rulesIntent,
  type BotIntent,
} from '../../src/domain/voice/botIntent';
import type { BotAiInput } from '../../src/domain/voice/botPrompt';
import type { ParsedPhrase, PhraseContext } from '../../src/domain/voice/parsePhrase';
import { draftFromPhrase } from '../../src/domain/voice/phraseFields';
import {
  BOT_REPLIES,
  greetingReply,
  HELP_REPLY,
  invalidReply,
  parseConfirmation,
  parseLinkCommand,
  thanksReply,
  transactionSummary,
  whatsappTransactionDoc,
} from '../../src/domain/whatsapp';
import { clearDraft, getDraft, MAX_ROUNDS, putDraft, type Draft } from './draft';
import type { TransactionsInRange } from './firestoreQueries';
import type { UserContext } from './firestoreRest';
import { linkedEmail, linkedUid, redeemCode, type LinkStore } from './links';
import { clearPending, getPending, putPending } from './pending';
import { consumeQuota, quotaDay, type CounterStore } from './quota';

/** Un mensaje recibido, con lo que se usa de él. */
export type IncomingMessage = { id: string; from: string } & (
  | { kind: 'text'; text: string }
  /** Se tocó un botón o una fila de una lista de un mensaje del bot. */
  | { kind: 'choice'; choiceId: string }
  | { kind: 'audio'; mediaId: string }
  /** Foto, sticker, ubicación... */
  | { kind: 'other' }
);

export interface ReplyButton {
  id: string;
  /** WhatsApp admite hasta 20 caracteres en un botón y 24 en una fila. */
  title: string;
}

/** Lo que responde el bot: un texto, con botones, con una lista, o solo texto. */
export interface BotReply {
  text: string;
  buttons?: ReplyButton[];
  list?: { buttonLabel: string; rows: ReplyButton[] };
}

export interface BotDeps {
  /** El KV de WhatsApp: vínculos, emails, pendientes, borradores y mensajes ya vistos. */
  store: LinkStore;
  quota: CounterStore;
  dailyLimit: number;
  isAllowed: (email: string) => Promise<boolean>;
  /** La IA de Llama: devuelve su respuesta cruda (la valida el dominio). */
  interpret: (input: BotAiInput) => Promise<unknown>;
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
  /** Suma movimientos con una consulta de agregación (para los saldos). */
  sumTransactions: (
    uid: string,
    ...args: Parameters<SumTransactions>
  ) => ReturnType<SumTransactions>;
  /** Los movimientos de un rango de fechas (para los totales de un período). */
  readTransactions: (uid: string, range: DateRange) => Promise<TransactionsInRange>;
  now?: () => Date;
}

const SAVE_PREFIX = 'guardar:';
const CANCEL_PREFIX = 'cancelar:';
const LIST_BUTTON = 'Elegir';

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

/** Una pregunta con sus opciones: hasta 3 como botones, hasta 10 como lista, o solo el texto. */
function questionReply(question: string, options: readonly ChoiceOption[]): BotReply {
  if (options.length === 0) return text(question);
  if (options.length <= MAX_BUTTONS) return { text: question, buttons: [...options] };
  return { text: question, list: { buttonLabel: LIST_BUTTON, rows: [...options] } };
}

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
      case 'choice':
        return await handleChoice(uid, message, message.choiceId, deps, now);
      case 'text': {
        // "sí" y "no" solo son una confirmación si hay un movimiento esperando; si no, es charla.
        const answer = parseConfirmation(message.text);
        if (answer !== null) {
          const pending = await getPending(deps.store, message.from);
          if (pending !== null) {
            return await confirm(uid, message.from, pending.txId, answer, deps, now);
          }
        }
        return await converse(uid, message, message.text, true, deps, now);
      }
      case 'audio': {
        // Un audio necesita Whisper y la IA: sin cuota no se puede ni transcribir.
        const allowed = await consumeQuota(deps.quota, uid, quotaDay(now), deps.dailyLimit);
        if (!allowed) return text(BOT_REPLIES.audioQuota);
        const transcript = await deps.transcribe(message.mediaId);
        if (transcript === null) return text(BOT_REPLIES.audioTooLong);
        if (transcript === '') return text(BOT_REPLIES.audioUnclear);
        return await converse(uid, message, transcript, false, deps, now);
      }
      case 'other':
        return text(BOT_REPLIES.onlyTextOrAudio);
    }
  } catch (error) {
    // Solo el tipo de error: ni el mensaje ni los datos.
    console.error('Falló el bot', error instanceof Error ? error.name : 'desconocido');
    return text(BOT_REPLIES.failed);
  }
}

/** Un botón o una fila de una lista: confirmar, cancelar o completar el borrador. */
async function handleChoice(
  uid: string,
  message: IncomingMessage,
  id: string,
  deps: BotDeps,
  now: Date,
): Promise<BotReply> {
  const save = id.startsWith(SAVE_PREFIX);
  const cancel = id.startsWith(CANCEL_PREFIX);
  if (save || cancel) {
    const txId = id.slice((save ? SAVE_PREFIX : CANCEL_PREFIX).length);
    return confirm(uid, message.from, txId, save ? 'save' : 'cancel', deps, now);
  }

  const choice = parseChoiceId(id);
  const draft = choice === null ? null : await getDraft(deps.store, message.from);
  if (choice === null || draft === null) return text(BOT_REPLIES.expired);

  // Completar con un botón no necesita la IA: se rellena el campo y se sigue como un movimiento.
  const user = await loadUser(uid, deps);
  if (typeof user === 'string') return text(user);
  const parsed = applyChoice(draft.parsed, choice.field, choice.id);
  return handleMovement(message, parsed, draft.text, draft.rounds, user, deps, now);
}

/** Lee el perfil de la persona; devuelve el texto de error si no se puede seguir. */
async function loadUser(uid: string, deps: BotDeps): Promise<UserContext | string> {
  const user = await deps.readContext(uid);
  if (user === null) return BOT_REPLIES.openAppFirst;
  if (user.schemaVersion > SCHEMA_VERSION) return BOT_REPLIES.writesBlocked;
  return user;
}

/** Entiende un texto (escrito o transcripto) y lo despacha según qué sea. */
async function converse(
  uid: string,
  message: IncomingMessage,
  phrase: string,
  countQuota: boolean,
  deps: BotDeps,
  now: Date,
): Promise<BotReply> {
  // Saludo, gracias y ayuda se contestan enseguida: sin cuota, sin Firestore, sin IA.
  const quick = quickIntent(phrase);
  if (quick) return conversationReply(quick, message.id);

  const day = quotaDay(now);
  // La IA comparte la cuota diaria con el dictado de la app (ADR 0031). Un audio ya la gastó.
  const aiAllowed = countQuota ? await consumeQuota(deps.quota, uid, day, deps.dailyLimit) : true;

  const user = await loadUser(uid, deps);
  if (typeof user === 'string') return text(user);
  const draft = await getDraft(deps.store, message.from);
  const ctx: PhraseContext = { accounts: user.accounts, categories: user.categories, today: day };

  let intent: BotIntent | null = null;
  if (aiAllowed) {
    try {
      const input: BotAiInput = { ...aiInput(phrase, ctx), previous: draft?.text };
      intent = parseBotIntent(await deps.interpret(input), phrase, ctx, draft?.text);
    } catch {
      // La IA falló: se usa el parser de reglas, como en la app.
    }
  }
  intent ??= rulesInThread(phrase, ctx, draft);

  if (intent.kind === 'movement') {
    const joined = draft ? joinPhrases(draft.text, phrase) : phrase;
    return handleMovement(message, intent.phrase, joined, draft?.rounds ?? 0, user, deps, now);
  }
  if (intent.kind === 'query') return answerQuery(uid, intent.query, user, day, deps);
  return conversationReply(intent, message.id);
}

/**
 * Sin IA: se entiende el mensaje solo; si cuenta un movimiento incompleto y hay un borrador,
 * se prueba pegado al mensaje anterior (la respuesta "con efectivo" completa "gasté 18 mil").
 */
function rulesInThread(phrase: string, ctx: PhraseContext, draft: Draft | null): BotIntent {
  const alone = rulesIntent(phrase, ctx);
  if (!draft) return alone;
  // Una consulta, un saludo o un movimiento que se entiende completo valen por sí solos.
  if (alone.kind === 'movement' && draftFromPhrase(alone.phrase, ctx.accounts).ok) return alone;
  if (alone.kind !== 'movement' && alone.kind !== 'other') return alone;
  const joined = rulesIntent(joinPhrases(draft.text, phrase), ctx);
  return joined.kind === 'movement' ? joined : alone;
}

/** Saludo, gracias, ayuda y otras cosas: textos fijos, o la frase corta ya revisada del modelo. */
function conversationReply(intent: BotIntent, seed: string): BotReply {
  switch (intent.kind) {
    case 'greeting':
      return text(greetingReply(seed));
    case 'thanks':
      return text(thanksReply(seed));
    case 'help':
      return text(HELP_REPLY);
    case 'other':
      return text(intent.reply ?? BOT_REPLIES.offTopic);
    default:
      return text(BOT_REPLIES.offTopic);
  }
}

/**
 * Un movimiento entendido: si está completo, se valida y se ofrece guardarlo; si falta algo, se
 * pregunta y se guarda el borrador. A la tercera pregunta sin resolver, se desiste.
 */
async function handleMovement(
  message: IncomingMessage,
  parsed: ParsedPhrase,
  accumulatedText: string,
  rounds: number,
  user: UserContext,
  deps: BotDeps,
  now: Date,
): Promise<BotReply> {
  const day = quotaDay(now);
  const draft = draftFromPhrase(parsed, user.accounts);

  if (!draft.ok) {
    const question = questionFor(draft.unclear, parsed, user.accounts, user.categories);
    if (question === null || rounds >= MAX_ROUNDS) {
      await clearDraft(deps.store, message.from);
      return text(BOT_REPLIES.example);
    }
    await clearPending(deps.store, message.from);
    await putDraft(deps.store, message.from, {
      text: accumulatedText,
      parsed,
      rounds: rounds + 1,
    });
    return questionReply(question.text, question.options);
  }

  const ctx = validationContext(user);
  const checked = validateTransaction(draft.draft, ctx);
  if (!checked.ok) {
    await clearDraft(deps.store, message.from);
    return text(invalidReply(checked.error));
  }

  const txId = await transactionId(message.id);
  await clearDraft(deps.store, message.from);
  await putPending(deps.store, message.from, { txId, draft: draft.draft });
  return {
    text: `${transactionSummary(checked.value, ctx, day)}\n\n¿Lo guardo?`,
    buttons: [
      { id: `${SAVE_PREFIX}${txId}`, title: 'Guardar' },
      { id: `${CANCEL_PREFIX}${txId}`, title: 'Cancelar' },
    ],
  };
}

/** Responde una consulta con números calculados por el dominio (la IA solo eligió cuál). */
async function answerQuery(
  uid: string,
  query: BotQuery,
  user: UserContext,
  today: string,
  deps: BotDeps,
): Promise<BotReply> {
  const accounts = sortAccounts(selectable(user.accounts));

  if (query.kind === 'accounts') return text(accountsReply(accounts));

  if (query.kind === 'balance') {
    const chosen = query.accountId ? accounts.filter((a) => a.id === query.accountId) : accounts;
    if (chosen.length > MAX_BALANCE_ACCOUNTS) return text(BOT_REPLIES.tooManyAccounts);
    const sum: SumTransactions = (filters, field) => deps.sumTransactions(uid, filters, field);
    const balances = await accountBalances(chosen, sum);
    return text(
      balancesReply(chosen.map((account) => ({ account, balance: balances.get(account.id) ?? 0 }))),
    );
  }

  if (!usesPeriod(query.kind)) return text(BOT_REPLIES.offTopic);
  const range = queryRange(query.period, today);
  const { transactions, truncated } = await deps.readTransactions(uid, range);
  if (truncated) return text(BOT_REPLIES.periodTooBig);

  // Una cuenta o categoría nombrada limita los movimientos antes de sumar.
  const scoped = transactions.filter(
    (tx) =>
      (!query.accountId || tx.accountId === query.accountId) &&
      (!query.categoryId ||
        ((tx.type === 'income' || tx.type === 'expense') && tx.categoryId === query.categoryId)),
  );
  const accountMap = indexById(user.accounts);
  const scopeAccount: Account | undefined = query.accountId
    ? accountMap.get(query.accountId)
    : undefined;
  const currencies = scopeAccount ? [scopeAccount.currency] : currenciesInUse(accounts);
  const results: CurrencyStats[] = currencies.map((currency) => ({
    currency,
    stats: computeStats(scoped, accountMap, currency, range),
  }));
  const categories = indexById(user.categories);
  return text(
    periodReply(query, results, categories, {
      accountName: scopeAccount?.name ?? null,
      categoryName: query.categoryId ? (categories.get(query.categoryId)?.name ?? null) : null,
    }),
  );
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
  const user = await loadUser(uid, deps);
  if (typeof user === 'string') return text(user);
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
