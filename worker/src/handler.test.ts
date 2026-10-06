import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InvalidTokenError } from './auth';
import { handleRequest, ROUTE, type HandlerDeps } from './handler';

// El handler del Worker con todo falso (token, lista, KV e IA): se prueba cada control en orden
// (ADR 0031) sin Cloudflare ni Google.

const APP = 'https://finanzas-personales-jtg.web.app';
const input = {
  phrase: 'gasté 500 en comida',
  today: '2026-10-06',
  accounts: [{ id: 'cash', name: 'Efectivo', currency: 'ARS' }],
  categories: [{ id: 'food', name: 'Comida', type: 'expense' }],
};

let deps: HandlerDeps;
let counters: Map<string, string>;

beforeEach(() => {
  counters = new Map();
  deps = {
    verifyToken: vi.fn((token: string) =>
      token === 'bueno'
        ? Promise.resolve({ uid: 'ana', email: 'ana@gmail.com' })
        : Promise.reject(new InvalidTokenError('malo')),
    ),
    isAllowed: vi.fn((email: string) => Promise.resolve(email === 'ana@gmail.com')),
    quota: {
      get: (key) => Promise.resolve(counters.get(key) ?? null),
      put: (key, value) => {
        counters.set(key, value);
        return Promise.resolve();
      },
    },
    dailyLimit: 2,
    allowedOrigins: [APP],
    interpret: vi.fn(() => Promise.resolve({ type: 'expense', amount: '500' })),
    now: () => new Date('2026-10-06T15:00:00Z'),
  };
});

function post(body: unknown = input, headers: Record<string, string> = {}) {
  return handleRequest(
    new Request(`https://dictado.example${ROUTE}`, {
      method: 'POST',
      headers: { Origin: APP, Authorization: 'Bearer bueno', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    deps,
  );
}

describe('CORS', () => {
  // El navegador pregunta antes de mandar el pedido (preflight): solo la app recibe permiso.
  it('responde el preflight de la app', async () => {
    const response = await handleRequest(
      new Request(`https://dictado.example${ROUTE}`, {
        method: 'OPTIONS',
        headers: { Origin: APP },
      }),
      deps,
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
  });

  it('rechaza otra página', async () => {
    const response = await post(input, { Origin: 'https://otra.example' });
    expect(response.status).toBe(403);
    expect(deps.verifyToken).not.toHaveBeenCalled();
  });
});

describe('controles en orden', () => {
  it('sin token, 401', async () => {
    expect((await post(input, { Authorization: '' })).status).toBe(401);
  });

  it('con un token inválido, 401', async () => {
    expect((await post(input, { Authorization: 'Bearer malo' })).status).toBe(401);
  });

  it('con un email fuera de la lista, 403, sin gastar cuota', async () => {
    vi.mocked(deps.isAllowed).mockResolvedValue(false);
    expect((await post()).status).toBe(403);
    expect(counters.size).toBe(0);
  });

  it('con un pedido mal formado, 400', async () => {
    expect((await post('no es json')).status).toBe(400);
    expect((await post({ ...input, phrase: '' })).status).toBe(400);
    expect(deps.interpret).not.toHaveBeenCalled();
  });

  it('pasado el límite diario, 429, sin llamar a la IA', async () => {
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
    expect(deps.interpret).toHaveBeenCalledTimes(2);
    expect(counters.get('uso:ana:2026-10-06')).toBe('2');
  });

  it('si la IA falla, 502', async () => {
    vi.mocked(deps.interpret).mockRejectedValue(new Error('caído'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await post()).status).toBe(502);
  });
});

describe('respuesta', () => {
  it('devuelve lo que dijo la IA, con permiso CORS para la app', async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(APP);
    expect(await response.json()).toEqual({ result: { type: 'expense', amount: '500' } });
    expect(deps.interpret).toHaveBeenCalledWith(input);
  });

  it('otra ruta, 404', async () => {
    const response = await handleRequest(new Request('https://dictado.example/otra'), deps);
    expect(response.status).toBe(404);
  });
});
