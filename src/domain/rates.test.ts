import { describe, expect, it } from 'vitest';
import { parseBluelytics, parseStoredRates, RATES_REFRESH_MS, shouldFetchRates } from './rates';

const NOW = 1_790_000_000_000;

function bluelytics(usd: unknown, eur: unknown) {
  return {
    oficial: { value_avg: 1000, value_sell: 1020, value_buy: 980 },
    blue: { value_avg: usd, value_sell: 1355, value_buy: 1335 },
    blue_euro: { value_avg: eur, value_sell: 1530, value_buy: 1510 },
    last_update: '2026-10-03T12:00:00-03:00',
  };
}

// La respuesta de Bluelytics viene de afuera: se valida antes de usarla (SRS 5.8).
describe('parseBluelytics', () => {
  it('toma el promedio del blue para el dólar y el euro', () => {
    expect(parseBluelytics(bluelytics(1345.5, 1520), NOW)).toEqual({
      USD_ARS: 1345.5,
      EUR_ARS: 1520,
      fetchedAt: NOW,
    });
  });

  it.each([
    ['un texto', '1345'],
    ['cero', 0],
    ['un negativo', -5],
    ['NaN', NaN],
    ['infinito', Infinity],
    ['null', null],
  ])('descarta la respuesta si un valor es %s', (_, value) => {
    expect(parseBluelytics(bluelytics(value, 1520), NOW)).toBeNull();
    expect(parseBluelytics(bluelytics(1345.5, value), NOW)).toBeNull();
  });

  it('descarta respuestas que no tienen la forma esperada', () => {
    expect(parseBluelytics(null, NOW)).toBeNull();
    expect(parseBluelytics('error', NOW)).toBeNull();
    expect(parseBluelytics({ blue: 1345 }, NOW)).toBeNull();
    expect(parseBluelytics({}, NOW)).toBeNull();
  });
});

// Lo guardado en el dispositivo también se valida: pudo escribirlo otra versión de la app.
describe('parseStoredRates', () => {
  it('acepta lo que guarda la app', () => {
    const rates = { USD_ARS: 1345.5, EUR_ARS: 1520, fetchedAt: NOW };
    expect(parseStoredRates(rates)).toEqual(rates);
  });

  it('descarta datos incompletos o inválidos', () => {
    expect(parseStoredRates(null)).toBeNull();
    expect(parseStoredRates({ USD_ARS: 1345.5, EUR_ARS: 1520 })).toBeNull();
    expect(parseStoredRates({ USD_ARS: '1345', EUR_ARS: 1520, fetchedAt: NOW })).toBeNull();
  });
});

// Se consulta a lo sumo una vez por hora, para no pedir de más (SRS 5.8).
describe('shouldFetchRates', () => {
  it('consulta si no hay cotización guardada', () => {
    expect(shouldFetchRates(null, NOW)).toBe(true);
  });

  it('no consulta si la cotización tiene menos de 1 hora', () => {
    const rates = { USD_ARS: 1, EUR_ARS: 1, fetchedAt: NOW - RATES_REFRESH_MS };
    expect(shouldFetchRates(rates, NOW)).toBe(false);
  });

  it('consulta si la cotización tiene más de 1 hora', () => {
    const rates = { USD_ARS: 1, EUR_ARS: 1, fetchedAt: NOW - RATES_REFRESH_MS - 1 };
    expect(shouldFetchRates(rates, NOW)).toBe(true);
  });
});
