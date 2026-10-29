// El movimiento que quedó incompleto y espera una respuesta (ADR 0035): se guarda en el KV por
// 10 minutos, uno por número. Tiene el texto acumulado, lo que se entendió hasta ahora (para
// completarlo con un botón sin volver a llamar a la IA) y cuántas preguntas se hicieron.

import type { ParsedPhrase } from '../../src/domain/voice/parsePhrase';
import type { LinkStore } from './links';

export interface Draft {
  /** Los mensajes de la persona hasta ahora, unidos. */
  text: string;
  parsed: ParsedPhrase;
  /** Cuántas preguntas se hicieron: a la tercera sin resolver, se desiste. */
  rounds: number;
}

export const DRAFT_TTL_SECONDS = 10 * 60;
/** Preguntas seguidas antes de rendirse y mostrar un ejemplo. */
export const MAX_ROUNDS = 3;

export async function getDraft(store: LinkStore, phone: string): Promise<Draft | null> {
  const raw = await store.get(`borrador:${phone}`);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<Draft>;
    return typeof value.text === 'string' && value.parsed && typeof value.rounds === 'number'
      ? (value as Draft)
      : null;
  } catch {
    return null;
  }
}

export function putDraft(store: LinkStore, phone: string, draft: Draft): Promise<void> {
  return store.put(`borrador:${phone}`, JSON.stringify(draft), {
    expirationTtl: DRAFT_TTL_SECONDS,
  });
}

export function clearDraft(store: LinkStore, phone: string): Promise<void> {
  return store.delete(`borrador:${phone}`);
}
