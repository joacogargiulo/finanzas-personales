// El hilo de una conversación con el bot (ADR 0035): cuando a un movimiento le falta un dato, el
// bot pregunta, y la respuesta (un botón o un texto) lo completa. Acá están las preguntas, las
// opciones para tocar y cómo se completa un movimiento con una elección.

import { selectable } from './collections';
import type { Account, Category, TransactionType } from './model';
import { formatAmount } from './money';
import { missingFields, type ParsedField, type ParsedPhrase } from './voice/parsePhrase';

/** Una opción para tocar: un botón (hasta 3) o una fila de la lista (hasta 10). */
export interface ChoiceOption {
  id: string;
  title: string;
}

/** Lo que el bot pregunta: el texto y, si el dato se puede elegir, las opciones. */
export interface Question {
  text: string;
  options: ChoiceOption[];
}

/** Los campos que se pueden elegir tocando (el resto se contesta escribiendo). */
export type ChoiceField = 'account' | 'toAccount' | 'category';

/** WhatsApp admite hasta 10 filas en una lista; con más, se contesta escribiendo. */
export const MAX_CHOICES = 10;
/** Hasta 3 opciones van como botones; con más, como lista. */
export const MAX_BUTTONS = 3;
/** Un título de botón admite 20 caracteres (una fila de lista, 24). */
const TITLE_MAX = 20;

const CHOICE_PREFIX = 'elegir:';

/** El ID que viaja en el botón o la fila: `elegir:account:cash`. */
export function choiceId(field: ChoiceField, id: string): string {
  return `${CHOICE_PREFIX}${field}:${id}`;
}

/** Lo contrario de `choiceId`; `null` si no es una elección del bot. */
export function parseChoiceId(raw: string): { field: ChoiceField; id: string } | null {
  const match = /^elegir:(account|toAccount|category):(.+)$/.exec(raw);
  const field = match?.[1] as ChoiceField | undefined;
  const id = match?.[2];
  return field && id ? { field, id } : null;
}

/** El orden en que se pregunta: primero lo que define el movimiento. */
const ASK_ORDER: readonly ParsedField[] = [
  'type',
  'amount',
  'toAmount',
  'account',
  'toAccount',
  'category',
];

const TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  exchange: 'Cambio de moneda',
};

const QUESTIONS: Record<ParsedField, string> = {
  type: '¿Qué querés registrar: un gasto, un ingreso, una transferencia o un cambio de moneda?',
  amount: '¿De cuánto fue?',
  toAmount: '¿Cuánto recibiste en la cuenta destino?',
  account: '¿De qué cuenta?',
  toAccount: '¿A qué cuenta?',
  category: '¿En qué categoría?',
};

function option(id: string, name: string): ChoiceOption {
  return { id, title: name.length > TITLE_MAX ? `${name.slice(0, TITLE_MAX - 1)}…` : name };
}

/** Las cuentas para elegir como destino: de la misma moneda al transferir, de otra al cambiar. */
function destinationAccounts(parsed: ParsedPhrase, accounts: readonly Account[]): Account[] {
  const origin = accounts.find((a) => a.id === parsed.accountId);
  if (!origin) return selectable(accounts);
  const sameCurrency = parsed.type === 'transfer';
  return selectable(accounts).filter(
    (a) => a.id !== origin.id && (a.currency === origin.currency) === sameCurrency,
  );
}

function optionsFor(
  field: ParsedField,
  parsed: ParsedPhrase,
  accounts: readonly Account[],
  categories: readonly Category[],
): ChoiceOption[] {
  let options: ChoiceOption[] = [];
  if (field === 'account') {
    // Si dijo "50 dólares", solo se ofrecen las cuentas de esa moneda.
    const pool = selectable(accounts).filter(
      (a) => !parsed.currency || a.currency === parsed.currency,
    );
    options = pool.map((a) => option(choiceId('account', a.id), a.name));
  } else if (field === 'toAccount') {
    options = destinationAccounts(parsed, accounts).map((a) =>
      option(choiceId('toAccount', a.id), a.name),
    );
  } else if (field === 'category' && (parsed.type === 'income' || parsed.type === 'expense')) {
    options = selectable(categories)
      .filter((c) => c.type === parsed.type)
      .map((c) => option(choiceId('category', c.id), c.name));
  }
  return options.length > MAX_CHOICES ? [] : options;
}

/**
 * La pregunta para el primer dato que falta. Empieza por lo que ya se entendió ("Gasto de
 * $ 18.000,00") para que se sepa de qué movimiento se habla.
 */
export function questionFor(
  unclear: readonly ParsedField[],
  parsed: ParsedPhrase,
  accounts: readonly Account[],
  categories: readonly Category[],
): Question | null {
  const field = ASK_ORDER.find((f) => unclear.includes(f));
  if (!field) return null;

  const known: string[] = [];
  if (parsed.type !== null) known.push(TYPE_LABELS[parsed.type]);
  if (parsed.amount !== null) {
    const currency =
      accounts.find((a) => a.id === parsed.accountId)?.currency ?? parsed.currency ?? 'ARS';
    const amount = formatAmount(parsed.amount, currency, { sign: 'never' });
    known.push(known.length > 0 ? `de ${amount}` : amount);
  }
  const intro = known.length > 0 ? `${known.join(' ')}. ` : '';
  return {
    text: `${intro}${QUESTIONS[field]}`,
    options: optionsFor(field, parsed, accounts, categories),
  };
}

/** Completa un campo del movimiento con lo que se eligió y recalcula lo que falta. */
export function applyChoice(parsed: ParsedPhrase, field: ChoiceField, id: string): ParsedPhrase {
  const next: ParsedPhrase = {
    ...parsed,
    accountId: field === 'account' ? id : parsed.accountId,
    toAccountId: field === 'toAccount' ? id : parsed.toAccountId,
    categoryId: field === 'category' ? id : parsed.categoryId,
  };
  return { ...next, missing: missingFields(next) };
}

/** Une el mensaje anterior con la respuesta, para interpretarlos como uno solo sin IA. */
export function joinPhrases(previous: string, next: string): string {
  return `${previous.trim()} ${next.trim()}`.trim();
}
