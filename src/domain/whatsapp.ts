// Vínculo entre un número de WhatsApp y un usuario (ADR 0032 y 0033): las reglas puras que
// comparten la app y el Worker. El código de 6 cifras, el mensaje "vincular 123456", cómo se
// muestra el número y los textos con los que responde el bot.

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

/** Lo que responde el bot. */
export const BOT_REPLIES = {
  linked:
    '¡Listo! Este número quedó vinculado a tu cuenta de Control de Finanzas. ' +
    'Muy pronto vas a poder cargar movimientos desde acá.',
  invalidCode: 'Ese código no es válido o ya venció. Pedí uno nuevo en la app: Ajustes → WhatsApp.',
  tooManyAttempts:
    'Probaste demasiados códigos equivocados. Esperá una hora y pedí un código nuevo en la app.',
  notLinked:
    'Este número no está vinculado a ninguna cuenta. Para vincularlo, abrí la app, entrá a ' +
    'Ajustes → WhatsApp y mandame el código que te muestra.',
  notYet:
    'Tu número ya está vinculado. Todavía no sé cargar movimientos, pero ya casi: ' +
    'por ahora cargalos desde la app.',
} as const satisfies Record<LinkOutcome | 'notLinked' | 'notYet', string>;
