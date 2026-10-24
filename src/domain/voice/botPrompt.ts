// Qué se le manda a la IA para entender un mensaje de WhatsApp (ADR 0035). A diferencia del
// dictado de la app (que siempre es un movimiento), acá primero se decide QUÉ es el mensaje:
// un movimiento, una consulta, un saludo, un agradecimiento, un pedido de ayuda u otra cosa.
//
// Va lo mismo que en el dictado: la fecha y el ID, el nombre y la moneda o el tipo de las cuentas
// y categorías activas. Nunca saldos ni montos del usuario: las consultas las responde el
// dominio con sus propios números.

import { CURRENCIES } from '../model';
import { QUERY_KINDS, QUERY_PERIODS } from '../botQuery';
import { MOVEMENT_RULES, weekday, type AiInput } from './aiPrompt';

/** El pedido: lo mismo que el dictado más, si lo hay, el mensaje anterior que quedó incompleto. */
export interface BotAiInput extends AiInput {
  previous?: string | undefined;
}

export const BOT_INTENTS = ['movement', 'query', 'greeting', 'thanks', 'help', 'other'] as const;
export type BotIntentName = (typeof BOT_INTENTS)[number];

/** Largo máximo de la frase de `other` (es un mensaje de WhatsApp, no un texto largo). */
export const REPLY_MAX = 280;

const BOT_RULES = `Sos el asistente de WhatsApp de una app de finanzas personales de Argentina. Hablás en español rioplatense (vos). Recibís UN mensaje y respondés solo con el JSON pedido.

Primero decidí "intent":
- "movement": la persona cuenta un gasto, ingreso, transferencia o cambio de moneda para registrarlo.
- "query": la persona pregunta por sus datos: sus cuentas, su saldo, cuánto gastó o cobró en un período, en qué gastó.
- "greeting": saluda (hola, buen día, buenas).
- "thanks": agradece o se despide (gracias, perfecto, chau).
- "help": pregunta qué podés hacer o cómo se usa.
- "other": cualquier otra cosa.

Consultas ("query"):
- "queryKind": "accounts" (cuáles son sus cuentas), "balance" (cuánta plata tiene, cuánto le queda en una cuenta), "spending" (cuánto gastó), "income" (cuánto cobró o ganó), "summary" (cómo viene: ingresos, gastos y diferencia), "byCategory" (en qué gastó más).
- "queryPeriod": "today", "yesterday", "week" (esta semana), "month" (este mes), "lastMonth" (el mes pasado) o "year" (este año). Si no dice el período, "month".
- Usá "accountId" y "categoryId" solo si la persona nombra esa cuenta o categoría ("cuánto gasté en comida", "cuánto me queda en Efectivo"); si no, null.

Mensaje anterior:
- Si te paso "anterior", es un movimiento que quedó incompleto y la persona te contesta. Si el mensaje nuevo lo completa o lo corrige ("con efectivo", "fue en dólares"), devolvé el movimiento COMPLETO combinando los dos, con intent "movement". Si el mensaje nuevo es otra cosa (una consulta, un saludo, otro movimiento), ignorá el anterior.

"reply":
- Solo para intent "other": una respuesta corta y amable (máximo 200 caracteres) que diga que solo ayudás con las finanzas de la app: cargar gastos e ingresos, y consultar cuentas, saldos y gastos. Sin números, sin datos de la persona, sin consejos de inversión y sin prometer nada.
- Para los demás intents, "".

Para "movement", completá los campos del movimiento. Para los demás intents, esos campos van en null (y "description" en "").

Reglas del movimiento:

${MOVEMENT_RULES}`;

/** Los mensajes para el modelo. Los datos van como JSON, separados de las instrucciones. */
export function buildBotMessages(
  input: BotAiInput,
): { role: 'system' | 'user'; content: string }[] {
  const data = {
    hoy: `${input.today} (${weekday(input.today)})`,
    cuentas: input.accounts,
    categorias: input.categories,
    ...(input.previous ? { anterior: input.previous } : {}),
  };
  return [
    { role: 'system', content: BOT_RULES },
    {
      role: 'user',
      content: `Datos:\n${JSON.stringify(data)}\n\nMensaje:\n${JSON.stringify(input.phrase)}`,
    },
  ];
}

const nullableString = { type: ['string', 'null'] } as const;

/** La forma de la respuesta. El modelo la sigue casi siempre; igual se valida (botIntent.ts). */
export const BOT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...BOT_INTENTS] },
    type: { type: ['string', 'null'], enum: ['income', 'expense', 'transfer', 'exchange', null] },
    amount: nullableString,
    toAmount: nullableString,
    currency: { type: ['string', 'null'], enum: [...CURRENCIES, null] },
    date: nullableString,
    accountId: nullableString,
    toAccountId: nullableString,
    categoryId: nullableString,
    description: { type: 'string' },
    queryKind: { type: ['string', 'null'], enum: [...QUERY_KINDS, null] },
    queryPeriod: { type: ['string', 'null'], enum: [...QUERY_PERIODS, null] },
    reply: { type: 'string' },
  },
  required: [
    'intent',
    'type',
    'amount',
    'toAmount',
    'currency',
    'date',
    'accountId',
    'toAccountId',
    'categoryId',
    'description',
    'queryKind',
    'queryPeriod',
    'reply',
  ],
} as const;
