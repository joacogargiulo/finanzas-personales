// Qué se le manda a la IA para interpretar una frase dictada (ADR 0031). Lo arma la app y lo
// revisa el Worker antes de llamar al modelo.
//
// Va lo mínimo para entender la frase: la fecha, y el ID, el nombre y la moneda o el tipo de
// las cuentas y categorías activas. Nunca saldos ni movimientos.

import { selectable } from '../collections';
import { isValidLocalDate, parseLocalDate } from '../dates';
import { CURRENCIES, type Currency, type LocalDate } from '../model';
import type { PhraseContext } from './parsePhrase';

/** Límites de lo que acepta el Worker: frenan pedidos enormes que gastarían la cuota. */
export const AI_LIMITS = { phrase: 300, name: 50, accounts: 100, categories: 200 } as const;

export interface AiAccount {
  id: string;
  name: string;
  currency: Currency;
}

export interface AiCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
}

/** El cuerpo del pedido al Worker. */
export interface AiInput {
  phrase: string;
  today: LocalDate;
  accounts: AiAccount[];
  categories: AiCategory[];
}

/** Arma el pedido con lo activo del usuario. */
export function aiInput(phrase: string, ctx: PhraseContext): AiInput {
  return {
    phrase: phrase.trim().slice(0, AI_LIMITS.phrase),
    today: ctx.today,
    accounts: selectable(ctx.accounts).map(({ id, name, currency }) => ({ id, name, currency })),
    categories: selectable(ctx.categories).map(({ id, name, type }) => ({ id, name, type })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= max;
}

/** El Worker recibe JSON de afuera: revisa la forma y los límites antes de gastar cuota. */
export function validateAiInput(body: unknown): AiInput | null {
  if (!isRecord(body)) return null;
  const { phrase, today, accounts, categories } = body;
  if (!isText(phrase, AI_LIMITS.phrase) || typeof today !== 'string' || !isValidLocalDate(today)) {
    return null;
  }
  if (!Array.isArray(accounts) || accounts.length > AI_LIMITS.accounts) return null;
  if (!Array.isArray(categories) || categories.length > AI_LIMITS.categories) return null;

  const cleanAccounts: AiAccount[] = [];
  for (const a of accounts as unknown[]) {
    if (!isRecord(a) || !isText(a['id'], 100) || !isText(a['name'], AI_LIMITS.name)) return null;
    const currency = CURRENCIES.find((c) => c === a['currency']);
    if (!currency) return null;
    cleanAccounts.push({ id: a['id'], name: a['name'], currency });
  }
  const cleanCategories: AiCategory[] = [];
  for (const c of categories as unknown[]) {
    if (!isRecord(c) || !isText(c['id'], 100) || !isText(c['name'], AI_LIMITS.name)) return null;
    if (c['type'] !== 'income' && c['type'] !== 'expense') return null;
    cleanCategories.push({ id: c['id'], name: c['name'], type: c['type'] });
  }
  return { phrase, today, accounts: cleanAccounts, categories: cleanCategories };
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function weekday(date: LocalDate): string {
  const parts = parseLocalDate(date);
  if (!parts) return '';
  return WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()] ?? '';
}

const SYSTEM_PROMPT = `Interpretás UN movimiento de dinero dictado en español rioplatense, para una app de finanzas personales de Argentina. Respondé solo con el JSON pedido.

Tipos:
- "expense" (gasto): gasté, pagué, compré algo, me cobraron, salió.
- "income" (ingreso): cobré, me pagaron, me depositaron, vendí algo, me regalaron.
- "transfer": pasé o transferí plata entre dos cuentas propias de la MISMA moneda.
- "exchange" (cambio de moneda): compré o vendí dólares o euros, cambié pesos. Usa dos cuentas propias de DISTINTA moneda.
- null si no se entiende.

Montos:
- Como texto, solo dígitos y, si hay centavos, coma y dos decimales: "18000", "2500,50". Sin separador de miles ni símbolo.
- "luca" o "lucas" = mil; "palo" = un millón; "5k" = 5000; "dos lucas y media" = 2500.
- "currency" es la moneda del monto si se nombró ("50 dólares" → "USD", "20 euros" → "EUR", "pesos" → "ARS"); si no se nombró, null.
- En un cambio, "amount" es lo que sale de la cuenta origen (en su moneda) y "toAmount" lo que entra en la cuenta destino. Ejemplo: "compré 100 dólares a 1300" → amount "130000" (pesos que salen), toAmount "100" (dólares que entran), currency "ARS".

Cuentas y categorías:
- Usá SOLO los "id" de las listas que te paso. Si no está claro cuál es, null. Nunca inventes un id.
- Si no se nombra la cuenta y hay una sola posible (por ejemplo, la única en la moneda nombrada), usá esa.
- La categoría tiene que ser del mismo tipo que el movimiento. Las transferencias y los cambios no llevan categoría (null).
- Si la frase podría ser de dos categorías distintas, null.

Fecha:
- "date" en formato AAAA-MM-DD. "ayer", "anteayer", "el lunes", "el 5" se cuentan desde hoy y siempre hacia atrás (la fecha pasada más cercana). Si no se dice, null.

Descripción:
- Corta, con lo que fue (por ejemplo "Súper", "Almuerzo con Juan"). Sin el monto, la cuenta ni la fecha. Si no queda nada, "".`;

/** Los mensajes para el modelo. Los datos van como JSON, separados de las instrucciones. */
export function buildAiMessages(input: AiInput): { role: 'system' | 'user'; content: string }[] {
  const data = {
    hoy: `${input.today} (${weekday(input.today)})`,
    cuentas: input.accounts,
    categorias: input.categories,
  };
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Datos:\n${JSON.stringify(data)}\n\nFrase dictada:\n${JSON.stringify(input.phrase)}`,
    },
  ];
}

const nullableString = { type: ['string', 'null'] } as const;

/** La forma de la respuesta. El modelo la sigue casi siempre; igual se valida (aiResult.ts). */
export const AI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: ['string', 'null'], enum: ['income', 'expense', 'transfer', 'exchange', null] },
    amount: nullableString,
    toAmount: nullableString,
    currency: { type: ['string', 'null'], enum: [...CURRENCIES, null] },
    date: nullableString,
    accountId: nullableString,
    toAccountId: nullableString,
    categoryId: nullableString,
    description: { type: 'string' },
  },
  required: [
    'type',
    'amount',
    'toAmount',
    'currency',
    'date',
    'accountId',
    'toAccountId',
    'categoryId',
    'description',
  ],
} as const;
