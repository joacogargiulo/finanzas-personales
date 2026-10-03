import { describe, expect, it, vi } from 'vitest';
import { RATES_REFRESH_MS } from '../domain/rates';
import { refreshRates, type RatesDeps } from './rates';

const NOW = 1_790_000_000_000;
const BLUELYTICS = {
  blue: { value_avg: 1345.5 },
  blue_euro: { value_avg: 1520 },
};

function deps(overrides: Partial<RatesDeps> = {}): RatesDeps {
  const saved = new Map<string, string>();
  return {
    fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify(BLUELYTICS)))),
    storage: {
      getItem: (key) => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
    now: () => NOW,
    isOnline: () => true,
    ...overrides,
  };
}

// La consulta a Bluelytics se hace solo cuando hace falta y nunca rompe la app (SRS 5.8).
describe('refreshRates', () => {
  it('consulta y guarda la cotización en el dispositivo', async () => {
    const d = deps();
    const rates = await refreshRates(null, d);
    expect(rates).toEqual({ USD_ARS: 1345.5, EUR_ARS: 1520, fetchedAt: NOW });
    expect(JSON.parse(d.storage?.getItem('exchangeRates') ?? 'null')).toEqual(rates);
  });

  it('no consulta sin conexión', async () => {
    const d = deps({ isOnline: () => false });
    expect(await refreshRates(null, d)).toBeNull();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('no consulta si la cotización guardada tiene menos de 1 hora', async () => {
    const d = deps();
    const recent = { USD_ARS: 1, EUR_ARS: 1, fetchedAt: NOW - RATES_REFRESH_MS + 1 };
    expect(await refreshRates(recent, d)).toBeNull();
    expect(d.fetch).not.toHaveBeenCalled();
  });

  it('si la consulta falla, devuelve null sin lanzar', async () => {
    const d = deps({ fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(await refreshRates(null, d)).toBeNull();
  });

  it('descarta una respuesta con error o con datos inválidos', async () => {
    const error = deps({ fetch: () => Promise.resolve(new Response('', { status: 500 })) });
    expect(await refreshRates(null, error)).toBeNull();
    const invalid = deps({
      fetch: () => Promise.resolve(new Response(JSON.stringify({ blue: { value_avg: 0 } }))),
    });
    expect(await refreshRates(null, invalid)).toBeNull();
  });
});
