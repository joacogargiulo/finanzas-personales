import { describe, expect, it } from 'vitest';
import { formatHash, parseHash, type Route } from './route';

// La pantalla y el panel abierto viven en el hash de la dirección (ADR 0018).
describe('parseHash', () => {
  it('lee la pantalla', () => {
    expect(parseHash('#/movimientos')).toEqual({
      screen: 'movimientos',
      panel: null,
      layer: false,
    });
    expect(parseHash('#/ajustes')).toEqual({ screen: 'ajustes', panel: null, layer: false });
  });

  it('va a Inicio si el hash está vacío o es desconocido', () => {
    expect(parseHash('')).toEqual({ screen: 'inicio', panel: null, layer: false });
    expect(parseHash('#/')).toEqual({ screen: 'inicio', panel: null, layer: false });
    expect(parseHash('#/cualquiera')).toEqual({ screen: 'inicio', panel: null, layer: false });
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

  // Fase 5: presupuestos, recurrentes y el panel para confirmar un pendiente.
  it('lee los paneles de presupuesto, recurrente y pendiente', () => {
    expect(parseHash('#/ajustes?presupuesto=nuevo').panel).toEqual({ kind: 'budget', id: null });
    expect(parseHash('#/ajustes?presupuesto=seed_comida_ARS').panel).toEqual({
      kind: 'budget',
      id: 'seed_comida_ARS',
    });
    expect(parseHash('#/ajustes?recurrente=nuevo').panel).toEqual({ kind: 'recurring', id: null });
    expect(parseHash('#/inicio?pendiente=rec_r1_2026-10-05').panel).toEqual({
      kind: 'occurrence',
      id: 'rec_r1_2026-10-05',
    });
  });

  it('va y vuelve sin perder nada', () => {
    const routes: Route[] = [
      { screen: 'ajustes', panel: { kind: 'budget', id: null }, layer: false },
      { screen: 'ajustes', panel: { kind: 'recurring', id: 'r1' }, layer: false },
      { screen: 'inicio', panel: { kind: 'occurrence', id: 'rec_r1_2026-10-05' }, layer: true },
    ];
    for (const route of routes) expect(parseHash(formatHash(route))).toEqual(route);
  });

  it('ignora un panel con un ID inválido', () => {
    expect(parseHash('#/inicio?movimiento=a/b').panel).toBeNull();
    expect(parseHash('#/inicio?movimiento=').panel).toBeNull();
  });
});

// La capa: un diálogo sin dirección propia, para que Atrás lo cierre.
describe('capa', () => {
  it('se lee sola o junto a un panel', () => {
    expect(parseHash('#/movimientos?capa=1')).toEqual({
      screen: 'movimientos',
      panel: null,
      layer: true,
    });
    expect(parseHash('#/inicio?movimiento=abc&capa=1')).toEqual({
      screen: 'inicio',
      panel: { kind: 'transaction', id: 'abc' },
      layer: true,
    });
  });

  it('se escribe al final', () => {
    expect(
      formatHash({ screen: 'inicio', panel: { kind: 'transaction', id: 'abc' }, layer: true }),
    ).toBe('#/inicio?movimiento=abc&capa=1');
    expect(formatHash({ screen: 'ajustes', panel: null, layer: true })).toBe('#/ajustes?capa=1');
  });
});

describe('formatHash', () => {
  it('ida y vuelta con parseHash', () => {
    const routes: Route[] = [
      { screen: 'inicio', panel: null, layer: false },
      { screen: 'estadisticas', panel: null, layer: false },
      { screen: 'inicio', panel: { kind: 'transaction', id: null }, layer: false },
      { screen: 'movimientos', panel: { kind: 'transaction', id: 'x1' }, layer: false },
      { screen: 'ajustes', panel: { kind: 'account', id: 'cuenta1' }, layer: false },
      { screen: 'movimientos', panel: null, layer: true },
      { screen: 'inicio', panel: { kind: 'transaction', id: 'x1' }, layer: true },
      { screen: 'inicio', panel: { kind: 'transaction', id: null, dictate: true }, layer: false },
    ];
    for (const route of routes) expect(parseHash(formatHash(route))).toEqual(route);
  });
});

// El atajo "Dictar movimiento" (Fase 7) abre el panel ya escuchando (ADR 0023).
describe('dictar=1', () => {
  it('marca el panel de movimiento nuevo para empezar a dictar', () => {
    expect(parseHash('#/inicio?movimiento=nuevo&dictar=1').panel).toEqual({
      kind: 'transaction',
      id: null,
      dictate: true,
    });
    expect(
      formatHash({
        screen: 'inicio',
        panel: { kind: 'transaction', id: null, dictate: true },
        layer: false,
      }),
    ).toBe('#/inicio?movimiento=nuevo&dictar=1');
  });

  it('se ignora al editar o en otros paneles', () => {
    expect(parseHash('#/inicio?movimiento=abc&dictar=1').panel).toEqual({
      kind: 'transaction',
      id: 'abc',
    });
    expect(parseHash('#/inicio?cuenta=nueva&dictar=1').panel).toEqual({
      kind: 'account',
      id: null,
    });
    expect(parseHash('#/inicio?movimiento=nuevo&dictar=0').panel).not.toHaveProperty('dictate');
  });
});
