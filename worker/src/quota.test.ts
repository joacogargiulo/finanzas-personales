import { describe, expect, it } from 'vitest';
import { consumeQuota, quotaDay, type CounterStore } from './quota';

// Límite diario de dictados por persona (ADR 0031), con un KV falso en memoria.

function memoryStore(): CounterStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (key) => Promise.resolve(data.get(key) ?? null),
    put: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
  };
}

describe('consumeQuota', () => {
  it('cuenta hasta el límite y después rechaza sin sumar', async () => {
    const store = memoryStore();
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await consumeQuota(store, 'ana', '2026-10-06', 3));
    expect(results).toEqual([true, true, true, false]);
    expect(store.data.get('uso:ana:2026-10-06')).toBe('3');
  });

  // Cada persona y cada día tienen su propio contador.
  it('no mezcla personas ni días', async () => {
    const store = memoryStore();
    await consumeQuota(store, 'ana', '2026-10-06', 1);
    expect(await consumeQuota(store, 'beto', '2026-10-06', 1)).toBe(true);
    expect(await consumeQuota(store, 'ana', '2026-10-07', 1)).toBe(true);
  });
});

describe('quotaDay', () => {
  // El día cambia a la medianoche de Argentina (UTC−3), no a la de Londres.
  it('usa la fecha de Argentina', () => {
    expect(quotaDay(new Date('2026-10-07T02:30:00Z'))).toBe('2026-10-06');
    expect(quotaDay(new Date('2026-10-07T03:30:00Z'))).toBe('2026-10-07');
  });
});
