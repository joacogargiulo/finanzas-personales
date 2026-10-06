import { describe, expect, it, vi } from 'vitest';
import { makeAccount, makeCategory } from '../domain/testing/factories';
import { createInterpreter, type DictationDeps } from './dictation';

// Cuándo se usa la IA y cuándo el parser de reglas (ADR 0031). El Worker se reemplaza por un
// `fetch` falso que responde lo que decide cada test.

const cash = makeAccount({ id: 'cash', name: 'Efectivo' });
const food = makeCategory({ id: 'seed_comida', name: 'Comida', type: 'expense' });
const ctx = { accounts: [cash], categories: [food], today: '2026-10-06' };
const TEXT = 'gasté dos lucas en el súper';

const aiAnswer = {
  type: 'expense',
  amount: '2000',
  toAmount: null,
  currency: null,
  date: null,
  accountId: 'cash',
  toAccountId: null,
  categoryId: 'seed_comida',
  description: 'Súper',
};

function deps(overrides: Partial<DictationDeps> = {}): DictationDeps {
  return {
    url: 'https://dictado.example/interpretar',
    getToken: () => Promise.resolve('token'),
    fetch: vi.fn(() => Promise.resolve(Response.json({ result: aiAnswer }))),
    isOnline: () => true,
    ...overrides,
  };
}

describe('con la IA', () => {
  it('manda la frase con el token y usa lo que respondió', async () => {
    const d = deps();
    const result = await createInterpreter(d)(TEXT, ctx);

    expect(result.via).toBe('ai');
    expect(result.phrase).toMatchObject({ type: 'expense', amount: 200_000, accountId: 'cash' });
    const [url, init] = vi.mocked(d.fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://dictado.example/interpretar');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer token');
    expect(JSON.parse(init?.body as string)).toMatchObject({ phrase: TEXT, today: '2026-10-06' });
  });
});

// En todos estos casos el dictado sigue funcionando, con lo que entiende el parser.
describe('con el parser de reglas', () => {
  it('sin Worker configurado', async () => {
    const d = deps({ url: null });
    expect(await createInterpreter(d)(TEXT, ctx)).toMatchObject({
      via: 'rules',
      reason: 'notConfigured',
    });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('sin conexión, sin intentar', async () => {
    const d = deps({ isOnline: () => false });
    expect(await createInterpreter(d)(TEXT, ctx)).toMatchObject({
      via: 'rules',
      reason: 'offline',
    });
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('con el límite diario agotado (429)', async () => {
    const d = deps({
      fetch: () => Promise.resolve(Response.json({ error: 'quota' }, { status: 429 })),
    });
    expect(await createInterpreter(d)(TEXT, ctx)).toMatchObject({ via: 'rules', reason: 'quota' });
  });

  it.each([
    ['un error del Worker', () => Promise.resolve(Response.json({ error: 'ai' }, { status: 502 }))],
    ['una respuesta sin forma', () => Promise.resolve(Response.json({ result: 'cualquier cosa' }))],
    ['un corte de red', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('con %s', async (_, fetch) => {
    const result = await createInterpreter(deps({ fetch }))(TEXT, ctx);
    expect(result).toMatchObject({ via: 'rules', reason: 'failed' });
    // El parser igual entiende lo básico: "dos lucas" son 2000.
    expect(result.phrase.amount).toBe(200_000);
  });

  // Si el Worker tarda más que el límite, se corta el pedido y se sigue con el parser.
  it('si la IA no responde a tiempo', async () => {
    const fetch = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('abortado', 'AbortError'));
          });
        }),
    );
    const result = await createInterpreter(deps({ fetch, timeoutMs: 10 }))(TEXT, ctx);
    expect(result).toMatchObject({ via: 'rules', reason: 'failed' });
  });
});
