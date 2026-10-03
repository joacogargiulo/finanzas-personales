// Cotizaciones del dólar y el euro blue (SRS 5.8). El pedido a la red lo hace src/data/rates.ts;
// acá están las reglas: cuándo pedir y cómo validar la respuesta.

import type { EpochMs, ExchangeRates } from './model';

/** Se vuelve a consultar solo si la cotización guardada tiene más de 1 hora (SRS 5.8). */
export const RATES_REFRESH_MS = 60 * 60 * 1000;

/** Un número finito y positivo. */
function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : null;
}

/**
 * Lee la respuesta de `GET https://api.bluelytics.com.ar/v2/latest`: usa `blue.value_avg` y
 * `blue_euro.value_avg`. Si algún valor no es un número finito y positivo, descarta todo.
 */
export function parseBluelytics(json: unknown, now: EpochMs): ExchangeRates | null {
  const usd = field(field(json, 'blue'), 'value_avg');
  const eur = field(field(json, 'blue_euro'), 'value_avg');
  if (!isRate(usd) || !isRate(eur)) return null;
  return { USD_ARS: usd, EUR_ARS: eur, fetchedAt: now };
}

/** Lo guardado en `localStorage`, si tiene la forma correcta (pudo escribirlo otra versión). */
export function parseStoredRates(json: unknown): ExchangeRates | null {
  const usd = field(json, 'USD_ARS');
  const eur = field(json, 'EUR_ARS');
  const fetchedAt = field(json, 'fetchedAt');
  if (!isRate(usd) || !isRate(eur) || !isRate(fetchedAt)) return null;
  return { USD_ARS: usd, EUR_ARS: eur, fetchedAt };
}

/** Hay que consultar si no hay cotización o si tiene más de 1 hora. */
export function shouldFetchRates(rates: ExchangeRates | null, now: EpochMs): boolean {
  return rates === null || now - rates.fetchedAt > RATES_REFRESH_MS;
}
