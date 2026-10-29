import { describe, expect, it } from 'vitest';
import { clearDraft, DRAFT_TTL_SECONDS, getDraft, putDraft, type Draft } from './draft';
import { fakeStore } from './fakeStore';

// El movimiento incompleto que espera una respuesta vive 10 minutos en el KV, uno por número
// (ADR 0035).

const draft: Draft = {
  text: 'gasté 18 mil en el súper',
  rounds: 1,
  parsed: {
    type: 'expense',
    amount: 1_800_000,
    toAmount: null,
    currency: null,
    date: '2026-10-14',
    accountId: null,
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
    missing: ['account'],
    unsupported: null,
  },
};

describe('borrador', () => {
  it('se guarda por 10 minutos y se lee igual', async () => {
    const store = fakeStore();
    await putDraft(store, '549111', draft);
    expect(store.ttls.get('borrador:549111')).toBe(DRAFT_TTL_SECONDS);
    expect(DRAFT_TTL_SECONDS).toBe(600);
    expect(await getDraft(store, '549111')).toEqual(draft);
  });

  it('cada número tiene el suyo', async () => {
    const store = fakeStore();
    await putDraft(store, '549111', draft);
    expect(await getDraft(store, '549222')).toBeNull();
  });

  it('con datos que no tienen la forma esperada, devuelve null', async () => {
    const store = fakeStore({
      'borrador:1': 'no es json',
      'borrador:2': JSON.stringify({ text: 'x' }),
    });
    expect(await getDraft(store, '1')).toBeNull();
    expect(await getDraft(store, '2')).toBeNull();
  });

  it('se borra', async () => {
    const store = fakeStore();
    await putDraft(store, '549111', draft);
    await clearDraft(store, '549111');
    expect(await getDraft(store, '549111')).toBeNull();
  });
});
