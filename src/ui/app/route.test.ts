import { describe, expect, it } from 'vitest';
import { formatHash, parseHash, type Route } from './route';

// La pantalla y el panel abierto viven en el hash de la dirección (ADR 0018).
describe('parseHash', () => {
  it('lee la pantalla', () => {
    expect(parseHash('#/movimientos')).toEqual({ screen: 'movimientos', panel: null });
    expect(parseHash('#/ajustes')).toEqual({ screen: 'ajustes', panel: null });
  });

  it('va a Inicio si el hash está vacío o es desconocido', () => {
    expect(parseHash('')).toEqual({ screen: 'inicio', panel: null });
    expect(parseHash('#/')).toEqual({ screen: 'inicio', panel: null });
    expect(parseHash('#/cualquiera')).toEqual({ screen: 'inicio', panel: null });
  });

  it('lee el panel para crear o editar', () => {
    expect(parseHash('#/inicio?movimiento=nuevo').panel).toEqual({ kind: 'transaction', id: null });
    expect(parseHash('#/movimientos?movimiento=abc_123').panel).toEqual({
      kind: 'transaction',
      id: 'abc_123',
    });
    expect(parseHash('#/inicio?cuenta=nueva').panel).toEqual({ kind: 'account', id: null });
    expect(parseHash('#/ajustes?categoria=nueva').panel).toEqual({ kind: 'category', id: null });
    expect(parseHash('#/ajustes?categoria=seed_comida').panel).toEqual({
      kind: 'category',
      id: 'seed_comida',
    });
  });

  it('ignora un panel con un ID inválido', () => {
    expect(parseHash('#/inicio?movimiento=a/b').panel).toBeNull();
    expect(parseHash('#/inicio?movimiento=').panel).toBeNull();
  });
});

describe('formatHash', () => {
  it('ida y vuelta con parseHash', () => {
    const routes: Route[] = [
      { screen: 'inicio', panel: null },
      { screen: 'estadisticas', panel: null },
      { screen: 'inicio', panel: { kind: 'transaction', id: null } },
      { screen: 'movimientos', panel: { kind: 'transaction', id: 'x1' } },
      { screen: 'ajustes', panel: { kind: 'account', id: 'cuenta1' } },
    ];
    for (const route of routes) expect(parseHash(formatHash(route))).toEqual(route);
  });
});
