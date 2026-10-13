// Un KV falso en memoria, para los tests. Guarda también el vencimiento pedido en cada `put`,
// para poder verificarlo. No hace vencer nada solo: un código vencido es uno que no está.

import type { LinkStore } from './links';

export interface FakeStore extends LinkStore {
  data: Map<string, string>;
  ttls: Map<string, number | undefined>;
}

export function fakeStore(initial: Record<string, string> = {}): FakeStore {
  const data = new Map(Object.entries(initial));
  const ttls = new Map<string, number | undefined>();
  return {
    data,
    ttls,
    get: (key) => Promise.resolve(data.get(key) ?? null),
    put: (key, value, options) => {
      data.set(key, value);
      ttls.set(key, options?.expirationTtl);
      return Promise.resolve();
    },
    delete: (key) => {
      data.delete(key);
      ttls.delete(key);
      return Promise.resolve();
    },
  };
}
