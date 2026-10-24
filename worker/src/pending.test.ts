import { describe, expect, it } from 'vitest';
import { fakeStore } from './fakeStore';
import { clearPending, getPending, putPending } from './pending';

// El movimiento que espera confirmación vive 10 minutos en el KV, uno por número (ADR 0034).

describe('movimiento pendiente', () => {
  const draft = {
    type: 'expense' as const,
    amount: 500,
    date: '2026-10-14',
    description: '',
    accountId: 'cash',
    categoryId: 'seed_comida',
  };

  it('se guarda por 10 minutos y se lee igual', async () => {
    const store = fakeStore();
    await putPending(store, '549111', { txId: 'wa_1', draft });
    expect(store.ttls.get('pendiente:549111')).toBe(600);
    expect(await getPending(store, '549111')).toEqual({ txId: 'wa_1', draft });
  });

  it('sin pendiente, o con basura, devuelve null', async () => {
    const store = fakeStore({ 'pendiente:549222': 'no es json' });
    expect(await getPending(store, '549111')).toBeNull();
    expect(await getPending(store, '549222')).toBeNull();
  });

  it('se borra', async () => {
    const store = fakeStore();
    await putPending(store, '549111', { txId: 'wa_1', draft });
    await clearPending(store, '549111');
    expect(await getPending(store, '549111')).toBeNull();
  });
});
