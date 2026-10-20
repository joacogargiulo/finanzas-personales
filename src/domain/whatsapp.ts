// Vínculo entre un número de WhatsApp y un usuario (ADR 0032 y 0033): las reglas puras que
// comparten la app y el Worker. El código de 6 cifras, el mensaje "vincular 123456", cómo se
// muestra el número y los textos con los que responde el bot. Desde la 11d, también la
// confirmación del movimiento y el resumen que ve la persona.

import { addDays, formatDisplayDate } from './dates';
import { errorMessage } from './errors';
import { formatAmount } from './money';
import type { LocalDate } from './model';
import type {
  FieldErrors,
  TransactionField,
  TransactionFields,
  ValidationContext,
} from './validation';
import type { ParsedField } from './voice/parsePhrase';

/** Cuánto dura un código de vinculación. */
export const LINK_CODE_TTL_SECONDS = 10 * 60;

/** Intentos con un código equivocado que se le permiten a un número por hora. */
export const MAX_FAILED_LINK_ATTEMPTS = 5;

/** `true` si es un código de vinculación: exactamente 6 cifras. */
export function isLinkCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

/** El número (de 0 a 999.999) como código de 6 cifras, con ceros adelante. */
export function formatLinkCode(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999_999) throw new RangeError('Código fuera de rango');
  return String(n).padStart(6, '0');
}

/**
 * El código de un mensaje "vincular 123456", o `null` si el mensaje es otra cosa. Acepta
 * mayúsculas, tildes, espacios de más, el código partido en dos ("123 456") y un punto final.
 */
export function parseLinkCommand(text: string): string | null {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[.!]+$/, '');
  const match = /^vincular\s*:?\s*(\d{3})\s?(\d{3})$/.exec(normalized);
  return match ? match.slice(1, 3).join('') : null;
}

/**
 * El número como lo da WhatsApp: solo cifras, con el código de país adelante y sin el "+"
 * (por ejemplo, 5491123456789 para un celular de Buenos Aires).
 */
export function isWhatsAppNumber(value: string): boolean {
  return /^\d{8,15}$/.test(value);
}

/** El número con el medio oculto, para mostrarlo en Ajustes: "+54 ••• 6789". */
export function maskPhone(waId: string): string {
  return `+${waId.slice(0, 2)} ••• ${waId.slice(-4)}`;
}

/** El enlace que abre WhatsApp con el mensaje de vinculación ya escrito. */
export function linkMessageUrl(botNumber: string, code: string): string {
  const digits = botNumber.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(`vincular ${code}`)}`;
}

/** Cómo terminó un intento de vincular. */
export type LinkOutcome = 'linked' | 'invalidCode' | 'tooManyAttempts';

/** Lo que responde el bot con textos fijos. */
export const BOT_REPLIES = {
  linked:
    '¡Listo! Este número quedó vinculado a tu cuenta de Control de Finanzas. ' +
    'Ya podés mandarme un gasto, por ejemplo: «gasté 18 mil en el súper», escrito o en un audio.',
  invalidCode: 'Ese código no es válido o ya venció. Pedí uno nuevo en la app: Ajustes → WhatsApp.',
  tooManyAttempts:
    'Probaste demasiados códigos equivocados. Esperá una hora y pedí un código nuevo en la app.',
  notLinked:
    'Este número no está vinculado a ninguna cuenta. Para vincularlo, abrí la app, entrá a ' +
    'Ajustes → WhatsApp y mandame el código que te muestra.',
  saved: '✅ Guardado. Ya lo ves en la app.',
  cancelled: 'Listo, no lo guardé.',
  expired: 'Ese movimiento venció o ya se resolvió. Mandámelo de nuevo.',
  relink:
    'Tengo que actualizar tu vínculo. Abrí la app, entrá a Ajustes → WhatsApp, desvinculá el ' +
    'número y volvelo a vincular con un código nuevo.',
  noAccess: 'Esta cuenta todavía no tiene acceso a Control de Finanzas.',
  audioQuota:
    'Hoy ya usaste todos los audios con IA que tenés. Mandame el movimiento escrito o cargalo desde la app.',
  failed: 'Algo salió mal de mi lado. Probá de nuevo en un rato o cargalo desde la app.',
  onlyTextOrAudio: 'Mandame el gasto escrito o en un audio.',
  audioTooLong: 'Ese audio es muy largo. Mandame uno más corto o escribilo.',
  audioUnclear: 'No pude entender el audio. Probá de nuevo o escribilo.',
  saveFailed: 'No pude guardarlo. Probá de nuevo en un rato o cargalo desde la app.',
  openAppFirst: 'Abrí la app una vez con tu cuenta para dejarla lista y volvé a escribirme.',
  writesBlocked:
    'Hay una versión más nueva de la app y no puedo guardar con seguridad. Actualizá la app y probá de nuevo.',
  example: 'No entendí el movimiento. Probá así: «gasté 18 mil en el súper con efectivo».',
} as const satisfies Record<string, string>;

// ── Confirmación del movimiento (ADR 0034) ────────────────────────────────────

/** Qué quiere hacer la persona con el movimiento pendiente. */
export type Confirmation = 'save' | 'cancel';

const SAVE_WORDS = new Set([
  'si',
  'sii',
  'dale',
  'ok',
  'okey',
  'oka',
  'guardar',
  'guardalo',
  'listo',
]);
const CANCEL_WORDS = new Set(['no', 'nop', 'cancelar', 'cancelalo', 'cancela']);

/** "sí", "dale", "ok" → guardar; "no", "cancelar" → cancelar; otra cosa → `null`. */
export function parseConfirmation(text: string): Confirmation | null {
  const word = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[.!¡]+$/g, '');
  if (SAVE_WORDS.has(word)) return 'save';
  if (CANCEL_WORDS.has(word)) return 'cancel';
  return null;
}

/** "hoy", "ayer" o la fecha, para el resumen. */
function dateText(date: LocalDate, today: LocalDate): string {
  const shown = formatDisplayDate(date);
  if (date === today) return `hoy (${shown})`;
  if (date === addDays(today, -1)) return `ayer (${shown})`;
  return shown;
}

/** El resumen del movimiento que se le muestra a la persona antes de guardar. */
export function transactionSummary(
  fields: TransactionFields,
  ctx: ValidationContext,
  today: LocalDate,
): string {
  const account = ctx.accounts.get(fields.accountId);
  const currency = account?.currency ?? 'ARS';
  const lines: string[] = [];
  switch (fields.type) {
    case 'expense':
    case 'income': {
      const verb = fields.type === 'expense' ? 'Gasto' : 'Ingreso';
      const preposition = fields.type === 'expense' ? 'desde' : 'en';
      lines.push(`${verb} de ${formatAmount(fields.amount, currency, { sign: 'never' })}`);
      lines.push(`Cuenta (${preposition}): ${account?.name ?? '?'}`);
      lines.push(`Categoría: ${ctx.categories.get(fields.categoryId)?.name ?? '?'}`);
      break;
    }
    case 'transfer': {
      lines.push(`Transferencia de ${formatAmount(fields.amount, currency, { sign: 'never' })}`);
      lines.push(`De: ${account?.name ?? '?'}`);
      lines.push(`A: ${ctx.accounts.get(fields.toAccountId)?.name ?? '?'}`);
      break;
    }
    case 'exchange': {
      const destination = ctx.accounts.get(fields.toAccountId);
      const toCurrency = destination?.currency ?? 'ARS';
      lines.push('Cambio de moneda');
      lines.push(
        `Sale: ${formatAmount(fields.amount, currency, { sign: 'never' })} de ${account?.name ?? '?'}`,
      );
      lines.push(
        `Entra: ${formatAmount(fields.toAmount, toCurrency, { sign: 'never' })} en ${destination?.name ?? '?'}`,
      );
      break;
    }
  }
  lines.push(`Fecha: ${dateText(fields.date, today)}`);
  if (fields.description !== '') lines.push(`Descripción: ${fields.description}`);
  return lines.join('\n');
}

const FIELD_NAMES: Record<ParsedField, string> = {
  type: 'qué tipo de movimiento es (gasto, ingreso, transferencia o cambio)',
  amount: 'el monto',
  toAmount: 'cuánto recibís en la cuenta destino',
  account: 'la cuenta',
  toAccount: 'la cuenta destino',
  category: 'la categoría',
};

/** Qué falta para poder guardar. Si falta casi todo, sugiere un ejemplo. */
export function missingReply(unclear: readonly ParsedField[]): string {
  // Sin tipo ni monto no se entendió nada: más claro mostrar un ejemplo que listar todo.
  if (unclear.length >= 4 || (unclear.includes('type') && unclear.includes('amount'))) {
    return BOT_REPLIES.example;
  }
  const list = unclear.map((f) => FIELD_NAMES[f]);
  const joined =
    list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list.at(-1) ?? ''}` : (list[0] ?? '');
  return `Me falta saber ${joined}. Mandámelo de nuevo con ese dato.`;
}

/** Los errores de validación de un movimiento, uno por línea. */
export function invalidReply(errors: FieldErrors<TransactionField>): string {
  const lines = Object.values(errors).map((e) => `• ${errorMessage(e)}`);
  return `No pude guardarlo:\n${lines.join('\n')}`;
}

/**
 * El documento de un movimiento cargado por WhatsApp, sin `updatedAt`: lo pone el servidor con
 * `REQUEST_TIME` al escribir (SRS 4.0). Lo comparten el Worker y el test de las reglas.
 */
export function whatsappTransactionDoc(fields: TransactionFields, createdAt: number) {
  return { ...fields, source: 'whatsapp' as const, createdAt, deletedAt: null };
}
