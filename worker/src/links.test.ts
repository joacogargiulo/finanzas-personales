import { describe, expect, it } from 'vitest';
import { fakeStore } from './fakeStore';
import { createCode, linkedPhone, linkedUid, randomCodeNumber, redeemCode, unlink } from './links';

// El vínculo número ↔ usuario en KV (ADR 0033), con un KV falso en memoria.

const NOW = Date.UTC(2026, 9, 13, 18, 0);
const ANA = '5491111111111';
const BETO = '5491122222222';

describe('crear un código', () => {
  it('guarda el código con vencimiento de 10 minutos', async () => {
    const store = fakeStore();
    const result = await createCode(store, 'ana', NOW, () => 42);

    expect(result).toEqual({ code: '000042', expiresAt: NOW + 10 * 60_000 });
    expect(store.data.get('codigo:000042')).toBe('ana');
    expect(store.ttls.get('codigo:000042')).toBe(600);
  });

  // Dos personas no pueden tener el mismo código vivo a la vez.
  it('si el código ya está en uso, sortea otro', async () => {
    const store = fakeStore({ 'codigo:000001': 'beto' });
    const numbers = [1, 2];
    const result = await createCode(store, 'ana', NOW, () => numbers.shift() ?? 0);
    expect(result.code).toBe('000002');
    expect(store.data.get('codigo:000001')).toBe('beto');
  });

  it('el sorteo da números de 0 a 999.999', () => {
    for (let i = 0; i < 100; i++) {
      const n = randomCodeNumber();
      expect(Number.isInteger(n) && n >= 0 && n < 1_000_000).toBe(true);
    }
  });
});

describe('usar un código', () => {
  it('con un código válido, vincula en los dos sentidos y el código no sirve más', async () => {
    const store = fakeStore({ 'codigo:123456': 'ana' });

    expect(await redeemCode(store, ANA, '123456')).toBe('linked');
    expect(await linkedUid(store, ANA)).toBe('ana');
    expect(await linkedPhone(store, 'ana')).toBe(ANA);
    expect(await redeemCode(store, BETO, '123456')).toBe('invalidCode');
  });

  // Un código equivocado o vencido (KV ya lo borró) no vincula y cuenta como fallo.
  it('con un código que no existe, no vincula', async () => {
    const store = fakeStore();
    expect(await redeemCode(store, ANA, '123456')).toBe('invalidCode');
    expect(await linkedUid(store, ANA)).toBeNull();
    expect(store.data.get(`fallos:${ANA}`)).toBe('1');
    expect(store.ttls.get(`fallos:${ANA}`)).toBe(3600);
  });

  // Así nadie puede probar códigos al azar hasta acertar uno.
  it('después de 5 fallos, rechaza incluso un código válido', async () => {
    const store = fakeStore({ 'codigo:123456': 'ana' });
    for (let i = 0; i < 5; i++) await redeemCode(store, ANA, '000000');

    expect(await redeemCode(store, ANA, '123456')).toBe('tooManyAttempts');
    expect(await linkedUid(store, ANA)).toBeNull();
    expect(store.data.get('codigo:123456')).toBe('ana');
  });

  it('al vincular, se borran los fallos anteriores', async () => {
    const store = fakeStore({ 'codigo:123456': 'ana', [`fallos:${ANA}`]: '2' });
    await redeemCode(store, ANA, '123456');
    expect(store.data.has(`fallos:${ANA}`)).toBe(false);
  });
});

// Una persona tiene un solo número, y un número es de una sola persona.
describe('volver a vincular', () => {
  it('con otro número, el anterior queda desvinculado', async () => {
    const store = fakeStore({ [`tel:${ANA}`]: 'ana', 'uid:ana': ANA, 'codigo:123456': 'ana' });
    await redeemCode(store, BETO, '123456');

    expect(await linkedUid(store, ANA)).toBeNull();
    expect(await linkedUid(store, BETO)).toBe('ana');
    expect(await linkedPhone(store, 'ana')).toBe(BETO);
  });

  it('un número que era de otra persona pasa a la nueva', async () => {
    const store = fakeStore({ [`tel:${ANA}`]: 'ana', 'uid:ana': ANA, 'codigo:123456': 'beto' });
    await redeemCode(store, ANA, '123456');

    expect(await linkedUid(store, ANA)).toBe('beto');
    expect(await linkedPhone(store, 'ana')).toBeNull();
    expect(await linkedPhone(store, 'beto')).toBe(ANA);
  });
});

describe('desvincular', () => {
  it('borra las dos claves', async () => {
    const store = fakeStore({ [`tel:${ANA}`]: 'ana', 'uid:ana': ANA });
    await unlink(store, 'ana');
    expect(store.data.size).toBe(0);
  });

  it('sin vínculo, no hace nada', async () => {
    const store = fakeStore({ [`tel:${BETO}`]: 'beto', 'uid:beto': BETO });
    await unlink(store, 'ana');
    expect(store.data.size).toBe(2);
  });

  // Si el número ya pasó a otra persona, no se le borra a ella.
  it('no borra el número si ahora es de otra persona', async () => {
    const store = fakeStore({ [`tel:${ANA}`]: 'beto', 'uid:ana': ANA, 'uid:beto': ANA });
    await unlink(store, 'ana');
    expect(await linkedUid(store, ANA)).toBe('beto');
    expect(await linkedPhone(store, 'ana')).toBeNull();
  });
});
