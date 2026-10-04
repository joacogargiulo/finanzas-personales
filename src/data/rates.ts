// Cotizaciones de Bluelytics (SRS 4.8 y 5.8): se guardan en `localStorage`, no en Firestore.
//
// - Al abrir la app se cargan las guardadas, así el total estimado aparece aunque no haya señal.
// - Se consulta al abrir y al recuperar conexión, solo si hay red y la guardada tiene más de 1 hora.
// - Si la consulta falla, se mantiene la última guardada sin molestar al usuario.

import type { ExchangeRates } from '../domain/model';
import { parseBluelytics, parseStoredRates, shouldFetchRates } from '../domain/rates';
import type { DataStore } from './store';

const BLUELYTICS_URL = 'https://api.bluelytics.com.ar/v2/latest';
const STORAGE_KEY = 'exchangeRates';
const TIMEOUT_MS = 10_000;

export interface RatesDeps {
  fetch: typeof fetch;
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  isOnline: () => boolean;
}

function browserDeps(): RatesDeps {
  let storage: Storage | null;
  try {
    // En una ventana privada o con los datos del sitio bloqueados, acceder puede fallar.
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    fetch: (...args) => window.fetch(...args),
    storage,
    now: Date.now,
    isOnline: () => navigator.onLine,
  };
}

function readStored(storage: RatesDeps['storage']): ExchangeRates | null {
  try {
    const text = storage?.getItem(STORAGE_KEY);
    return text ? parseStoredRates(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

function writeStored(storage: RatesDeps['storage'], rates: ExchangeRates): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // Sin almacenamiento, la cotización igual queda en memoria hasta cerrar la app.
  }
}

/** Consulta Bluelytics si corresponde. Devuelve la cotización nueva o `null` si no hubo. */
export async function refreshRates(
  current: ExchangeRates | null,
  deps: RatesDeps,
): Promise<ExchangeRates | null> {
  if (!deps.isOnline() || !shouldFetchRates(current, deps.now())) return null;
  try {
    const response = await deps.fetch(BLUELYTICS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    const rates = parseBluelytics(await response.json(), deps.now());
    if (rates) writeStored(deps.storage, rates);
    return rates;
  } catch {
    return null;
  }
}

/** Carga las cotizaciones guardadas y las mantiene al día. Devuelve la función que lo detiene. */
export function startRates(store: DataStore, deps: RatesDeps = browserDeps()): () => void {
  store.setState({ rates: readStored(deps.storage) });

  let running = false;
  async function refresh(): Promise<void> {
    if (running) return;
    running = true;
    const rates = await refreshRates(store.getState().rates, deps);
    if (rates) store.setState({ rates });
    running = false;
  }

  const onOnline = () => void refresh();
  window.addEventListener('online', onOnline);
  void refresh();
  return () => {
    window.removeEventListener('online', onOnline);
  };
}
