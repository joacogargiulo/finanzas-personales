// Qué quiso decir la persona con su mensaje de WhatsApp (ADR 0035): un movimiento, una consulta,
// un saludo, un agradecimiento, un pedido de ayuda u otra cosa.
//
// Nunca se confía en la IA sin revisar: una intención que no existe, un período inventado, un ID
// de cuenta que no es de la persona o una frase de charla con cifras se descartan. Lo que no
// cierra devuelve `null` y el bot usa el parser de reglas (`rulesIntent`), que también cubre el
// caso sin IA (cuota agotada o servicio caído).

import {
  QUERY_KINDS,
  QUERY_PERIODS,
  type BotQuery,
  type QueryKind,
  type QueryPeriod,
} from '../botQuery';
import { joinPhrases } from '../botThread';
import { selectable } from '../collections';
import { normalizeText } from '../search';
import { parseAiResult } from './aiResult';
import { BOT_INTENTS, REPLY_MAX } from './botPrompt';
import { findNamed } from './matching';
import { parsePhrase, type ParsedPhrase, type PhraseContext } from './parsePhrase';
import { tokenize } from './tokens';

export type BotIntent =
  | { kind: 'movement'; phrase: ParsedPhrase }
  | { kind: 'query'; query: BotQuery }
  | { kind: 'greeting' }
  | { kind: 'thanks' }
  | { kind: 'help' }
  /** `reply`: la frase del modelo, ya revisada; `null` si no sirve (se usa un texto fijo). */
  | { kind: 'other'; reply: string | null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** La frase de charla del modelo, o `null` si está vacía, es larga o trae cifras. */
function cleanReply(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  // Sin cifras: el modelo no tiene datos de la persona y no tiene que inventarlos.
  if (text === '' || text.length > REPLY_MAX || /\d/.test(text)) return null;
  return text;
}

/**
 * Convierte la respuesta cruda del modelo. `null` si no tiene forma de respuesta o si dice ser un
 * movimiento que no se puede validar. `previous`: el mensaje incompleto al que contesta, que
 * cuenta para verificar las cuentas nombradas.
 */
export function parseBotIntent(
  raw: unknown,
  text: string,
  ctx: PhraseContext,
  previous?: string,
): BotIntent | null {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!isRecord(data)) return null;

  const intent = BOT_INTENTS.find((i) => i === data['intent']);
  switch (intent) {
    case 'movement': {
      const phrase = parseAiResult(data, previous ? joinPhrases(previous, text) : text, ctx);
      return phrase ? { kind: 'movement', phrase } : null;
    }
    case 'query': {
      const kind: QueryKind | undefined = QUERY_KINDS.find((k) => k === data['queryKind']);
      if (!kind) return null;
      const period: QueryPeriod = QUERY_PERIODS.find((p) => p === data['queryPeriod']) ?? 'month';
      const accountId =
        selectable(ctx.accounts).find((a) => a.id === data['accountId'])?.id ?? null;
      const categoryId =
        selectable(ctx.categories).find((c) => c.id === data['categoryId'])?.id ?? null;
      return { kind: 'query', query: { kind, accountId, categoryId, period } };
    }
    case 'greeting':
    case 'thanks':
    case 'help':
      return { kind: intent };
    case 'other':
      return { kind: 'other', reply: cleanReply(data['reply']) };
    default:
      return null;
  }
}

// ── Sin IA ────────────────────────────────────────────────────────────────────

const GREETING =
  /^(hola|holi|holis|buenas|buen dia|buenos dias|buenas tardes|buenas noches|hey|ey|que tal)\b/;
const THANKS = /\b(gracias|genial|perfecto|excelente|chau|chao|nos vemos|hasta luego)\b/;
const HELP = /\b(ayuda|ayudame|que (podes|sabes|haces)|como (funciona|se usa|uso)|comandos)\b/;
const ACCOUNTS = /\bcuentas\b/;
const BALANCE = /(cuanta plata|cuanto dinero|cuanto (tengo|me queda|hay)|saldos?\b)/;
const SPENDING = /\bcuanto (gaste|gastamos|gastaron|llevo gastado)\b/;
const INCOME = /\bcuanto (gane|cobre|cobramos|ingreso|ingresaron)\b/;
const SUMMARY = /\b(como (vengo|voy|estoy)|resumen)\b/;
const BY_CATEGORY = /\b(en que (gaste|se me fue)|donde gaste|que gaste mas)\b/;

/** El período que nombra el texto; "este mes" si no nombra ninguno. */
function periodIn(normalized: string): QueryPeriod {
  if (/\bmes (pasado|anterior)\b/.test(normalized)) return 'lastMonth';
  if (/\bhoy\b/.test(normalized)) return 'today';
  if (/\bayer\b/.test(normalized)) return 'yesterday';
  if (/\bsemana\b/.test(normalized)) return 'week';
  if (/\b(ano|anio)\b/.test(normalized)) return 'year';
  return 'month';
}

function normalizeForRules(text: string): string {
  return normalizeText(text)
    .replace(/[¿?¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Saludo, agradecimiento o pedido de ayuda, sin cuentas ni IA: se reconocen solo con el texto.
 * El bot los contesta enseguida, sin gastar cuota ni leer datos. `null` si es otra cosa.
 */
export function quickIntent(text: string): BotIntent | null {
  const normalized = normalizeForRules(text);
  const words = normalized === '' ? 0 : normalized.split(' ').length;
  const hasDigits = /\d/.test(normalized);

  if (GREETING.test(normalized) && words <= 5 && !hasDigits) return { kind: 'greeting' };
  if (THANKS.test(normalized) && words <= 6 && !hasDigits) return { kind: 'thanks' };
  if (HELP.test(normalized) && !hasDigits) return { kind: 'help' };
  return null;
}

/**
 * Lo que se entiende sin IA: saludos, agradecimientos, ayuda, las consultas más comunes y, si no
 * es nada de eso, el parser de movimientos. Frases que cuentan un gasto ("gasté 500") no se
 * confunden con consultas ("cuánto gasté"): estas siempre empiezan por "cuánto" o similares.
 */
export function rulesIntent(text: string, ctx: PhraseContext): BotIntent {
  const quick = quickIntent(text);
  if (quick) return quick;
  const normalized = normalizeForRules(text);
  const hasDigits = /\d/.test(normalized);

  const norms = tokenize(text).map((t) => t.norm);
  const period = periodIn(normalized);
  const account = findNamed(norms, [], selectable(ctx.accounts))[0]?.item.id ?? null;
  const category = findNamed(norms, [], selectable(ctx.categories))[0]?.item.id ?? null;
  const query = (kind: QueryKind, categoryId: string | null = null): BotIntent => ({
    kind: 'query',
    query: { kind, accountId: account, categoryId, period },
  });

  if (BALANCE.test(normalized)) return query('balance');
  if (ACCOUNTS.test(normalized) && !hasDigits) return query('accounts');
  if (BY_CATEGORY.test(normalized)) return query('byCategory');
  if (SPENDING.test(normalized)) return query('spending', category);
  if (INCOME.test(normalized)) return query('income', category);
  if (SUMMARY.test(normalized)) return query('summary');

  const phrase = parsePhrase(text, ctx);
  if (phrase.type !== null || phrase.amount !== null) return { kind: 'movement', phrase };
  return { kind: 'other', reply: null };
}
