// El movimiento que espera confirmación (ADR 0034): se guarda en el KV por 10 minutos, uno por
// número. Un mensaje nuevo reemplaza al pendiente.

import type { TransactionDraft } from '../../src/domain/validation';
import type { LinkStore } from './links';

export interface PendingTransaction {
  /** El ID fijo del movimiento (`wa_` + hash del mensaje): el botón lo trae para no confundirse. */
  txId: string;
  draft: TransactionDraft;
}

export const PENDING_TTL_SECONDS = 10 * 60;

export async function getPending(
  store: LinkStore,
  phone: string,
): Promise<PendingTransaction | null> {
  const raw = await store.get(`pendiente:${phone}`);
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingTransaction>;
    return typeof value.txId === 'string' && value.draft ? (value as PendingTransaction) : null;
  } catch {
    return null;
  }
}

export function putPending(
  store: LinkStore,
  phone: string,
  pending: PendingTransaction,
): Promise<void> {
  return store.put(`pendiente:${phone}`, JSON.stringify(pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
}

export function clearPending(store: LinkStore, phone: string): Promise<void> {
  return store.delete(`pendiente:${phone}`);
}
