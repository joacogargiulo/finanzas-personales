// Parser de frases para la carga por voz (ADR 0015).
// "gasté dieciocho mil en el súper con efectivo ayer" → campos para precargar el formulario.
// Nunca guarda: el usuario siempre confirma.

import { selectable } from '../collections';
import type { Account, Category, Cents, Currency, LocalDate } from '../model';
import { DESCRIPTION_MAX } from '../validation';
import { compact, findNamed, type NameMatch } from './matching';
import { findAmount } from './numbers';
import { findDate } from './relativeDates';
import { SYNONYM_INDEX } from './synonyms';
import { STOPWORDS, tokenize, type Token } from './tokens';

export type VoiceTransactionType = 'income' | 'expense' | 'transfer';
export type ParsedField = 'type' | 'amount' | 'account' | 'toAccount' | 'category';

export interface ParsedPhrase {
  type: VoiceTransactionType | null;
  amount: Cents | null;
  /** Moneda que se nombró ("50 dólares"), si se nombró. */
  currency: Currency | null;
  /** Hoy, si no se dijo una fecha. */
  date: LocalDate;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  description: string;
  /** Campos necesarios para el tipo que no se pudieron entender. */
  missing: ParsedField[];
  /** La frase parece un cambio de moneda, que el parser no interpreta. */
  unsupported: 'exchange' | null;
}

export interface PhraseContext {
  accounts: readonly Account[];
  categories: readonly Category[];
  today: LocalDate;
}

/** Verbos de una palabra. */
const VERBS: Readonly<Record<string, VoiceTransactionType>> = {
  gaste: 'expense',
  gastamos: 'expense',
  gasto: 'expense',
  pague: 'expense',
  pagamos: 'expense',
  compre: 'expense',
  compramos: 'expense',
  abone: 'expense',
  salio: 'expense',
  salieron: 'expense',
  cobre: 'income',
  cobramos: 'income',
  recibi: 'income',
  recibimos: 'income',
  ingrese: 'income',
  ingreso: 'income',
  gane: 'income',
  ganamos: 'income',
  vendi: 'income',
  vendimos: 'income',
  entraron: 'income',
  transferi: 'transfer',
  transferimos: 'transfer',
  transferencia: 'transfer',
  pase: 'transfer',
  pasamos: 'transfer',
  movi: 'transfer',
  movimos: 'transfer',
};

/** "me cobraron" es un gasto; "me pagaron", un ingreso. */
const ME_VERBS: Readonly<Record<string, VoiceTransactionType>> = {
  cobraron: 'expense',
  pagaron: 'income',
  depositaron: 'income',
  transfirieron: 'income',
  pasaron: 'income',
  dieron: 'income',
  regalaron: 'income',
  devolvieron: 'income',
  reintegraron: 'income',
};

/** Verbos que, con una moneda extranjera justo después del monto, indican un cambio de moneda. */
const EXCHANGE_VERBS: ReadonlySet<string> = new Set(['compre', 'vendi', 'cambie']);

const TO_WORDS: ReadonlySet<string> = new Set(['a', 'al', 'hacia', 'para']);
const FROM_WORDS: ReadonlySet<string> = new Set(['de', 'del', 'desde']);
/** Palabras que suelen ir antes del nombre de una cuenta ("con la", "desde mi"). */
const ACCOUNT_LEADS: ReadonlySet<string> = new Set([
  ...TO_WORDS,
  ...FROM_WORDS,
  'con',
  'en',
  'la',
  'el',
  'mi',
]);

interface VerbMatch {
  type: VoiceTransactionType | null;
  index: number;
  end: number;
}

function findVerb(norms: readonly string[]): VerbMatch | null {
  for (let i = 0; i < norms.length; i += 1) {
    const token = norms[i] ?? '';
    const meVerb = token === 'me' ? ME_VERBS[norms[i + 1] ?? ''] : undefined;
    if (meVerb) return { type: meVerb, index: i, end: i + 2 };
    const verb = VERBS[token];
    if (verb) return { type: verb, index: i, end: i + 1 };
    if (token === 'cambie') return { type: null, index: i, end: i + 1 };
  }
  return null;
}

/** Marca como usadas hasta 2 palabras de enlace antes de una cuenta, y devuelve la primera. */
function consumeLeads(norms: readonly string[], used: boolean[], start: number): string | null {
  let lead: string | null = null;
  for (let i = start - 1; i >= Math.max(0, start - 2); i -= 1) {
    const token = norms[i] ?? '';
    if (used[i] === true || !ACCOUNT_LEADS.has(token)) break;
    used[i] = true;
    lead = token;
  }
  return lead;
}

/** Las palabras que sobran, sin artículos ni preposiciones en los bordes de cada tramo. */
function buildDescription(tokens: readonly Token[], used: readonly boolean[]): string {
  const chunks: Token[][] = [];
  let chunk: Token[] = [];
  tokens.forEach((token, i) => {
    if (used[i] === true) {
      if (chunk.length > 0) chunks.push(chunk);
      chunk = [];
    } else {
      chunk.push(token);
    }
  });
  if (chunk.length > 0) chunks.push(chunk);

  const words = chunks.flatMap((c) => {
    let start = 0;
    let end = c.length;
    while (start < end && STOPWORDS.has(c[start]?.norm ?? '')) start += 1;
    while (end > start && STOPWORDS.has(c[end - 1]?.norm ?? '')) end -= 1;
    return c.slice(start, end).map((t) => t.raw);
  });
  const text = words.join(' ').slice(0, DESCRIPTION_MAX).trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function parsePhrase(text: string, ctx: PhraseContext): ParsedPhrase {
  const tokens = tokenize(text);
  const norms = tokens.map((t) => t.norm);
  const used = norms.map(() => false);
  const mark = (start: number, end: number) => used.fill(true, start, end);

  // 1. Fecha (antes que el monto, para que "el 5" no se tome como $5).
  const dateMatch = findDate(norms, used, ctx.today);
  if (dateMatch) mark(dateMatch.start, dateMatch.end);

  // 2. Verbo → tipo.
  const verb = findVerb(norms);
  let type = verb?.type ?? null;
  if (verb) mark(verb.index, verb.end);

  // 3. Monto y moneda.
  const amountMatch = findAmount(norms, used);
  if (amountMatch) mark(amountMatch.start, amountMatch.end);
  const currency = amountMatch?.currency ?? null;

  // "compré 100 dólares": un cambio de moneda, que queda afuera (ADR 0015).
  let unsupported: ParsedPhrase['unsupported'] = null;
  if (
    verb &&
    EXCHANGE_VERBS.has(norms[verb.index] ?? '') &&
    amountMatch &&
    (currency === 'USD' || currency === 'EUR') &&
    (norms[verb.index] === 'cambie' || amountMatch.start === verb.end)
  ) {
    unsupported = 'exchange';
    type = null;
  }

  // 4. Cuentas activas.
  const activeAccounts = selectable(ctx.accounts);
  const accountMatches = findNamed(norms, used, activeAccounts);
  let accountId: string | null = null;
  let toAccountId: string | null = null;
  const leads = accountMatches.map((m: NameMatch<Account>) => {
    mark(m.start, m.end);
    return consumeLeads(norms, used, m.start);
  });
  if (type === 'transfer') {
    // "a", "al", "hacia" o "para" antes del nombre → destino; si no, origen y después destino.
    for (const [i, m] of accountMatches.entries()) {
      const lead = leads[i] ?? null;
      if (lead !== null && TO_WORDS.has(lead) && toAccountId === null) {
        toAccountId = m.item.id;
      } else if (accountId === null) {
        accountId = m.item.id;
      } else {
        toAccountId ??= m.item.id;
      }
    }
  } else {
    accountId = accountMatches[0]?.item.id ?? null;
  }
  // Cuenta implícita: la única de la moneda nombrada, o la única que tiene el usuario.
  if (accountId === null && type !== 'transfer') {
    const candidates =
      currency === null ? activeAccounts : activeAccounts.filter((a) => a.currency === currency);
    if (candidates.length === 1) accountId = candidates[0]?.id ?? null;
  }

  // 5. Categoría: por nombre o por sinónimo. Sus palabras quedan en la descripción.
  let categoryId: string | null = null;
  if (type !== 'transfer' && unsupported === null) {
    const active = selectable(ctx.categories).filter((c) => type === null || c.type === type);
    const byName = findNamed(norms, used, active)[0]?.item;
    const bySynonym = norms
      .map((token, i) => (used[i] ? undefined : SYNONYM_INDEX.get(token)))
      .map((id) => active.find((c) => c.id === id))
      .find((c) => c !== undefined);
    const category = byName ?? bySynonym;
    if (category) {
      categoryId = category.id;
      type ??= category.type; // "súper 5000 con efectivo" → gasto
    }
  }

  // 6. Descripción: lo que sobra. Si es solo el nombre de la categoría, no agrega nada.
  let description = buildDescription(tokens, used);
  const category = ctx.categories.find((c) => c.id === categoryId);
  if (category && compact(description) === compact(category.name)) description = '';

  const missing: ParsedField[] = [];
  if (type === null) missing.push('type');
  if (amountMatch === null) missing.push('amount');
  if (accountId === null) missing.push('account');
  if (type === 'transfer' && toAccountId === null) missing.push('toAccount');
  if (type !== 'transfer' && categoryId === null) missing.push('category');

  return {
    type,
    amount: amountMatch?.cents ?? null,
    currency,
    date: dateMatch?.date ?? ctx.today,
    accountId,
    toAccountId,
    categoryId,
    description,
    missing,
    unsupported,
  };
}
