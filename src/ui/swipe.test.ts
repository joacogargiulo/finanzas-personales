import { describe, expect, it } from 'vitest';
import { ACTIONS_WIDTH, decideGesture, dragOffset, GESTURE_SLOP, settle } from './swipe';

// El gesto de arrastrar una fila no tiene que confundirse con desplazar la lista.
describe('decideGesture', () => {
  it('no decide hasta que el dedo se movió lo suficiente', () => {
    expect(decideGesture(GESTURE_SLOP - 1, 2)).toBe('undecided');
  });

  it('horizontal si se movió más de costado que hacia arriba o abajo', () => {
    expect(decideGesture(-20, 5)).toBe('horizontal');
  });

  it('vertical si se movió más hacia arriba o abajo (es un scroll)', () => {
    expect(decideGesture(-6, 30)).toBe('vertical');
  });
});

describe('dragOffset', () => {
  it('sigue al dedo hacia la izquierda', () => {
    expect(dragOffset(false, -50)).toBe(-50);
  });

  it('no se mueve a la derecha estando cerrada', () => {
    expect(dragOffset(false, 40)).toBe(0);
  });

  it('no pasa del ancho de los botones', () => {
    expect(dragOffset(false, -500)).toBe(-ACTIONS_WIDTH);
  });

  it('abierta, arrastrar a la derecha la va cerrando', () => {
    expect(dragOffset(true, 44)).toBe(-ACTIONS_WIDTH + 44);
  });
});

describe('settle', () => {
  it('queda abierta si se arrastró más de la mitad', () => {
    expect(settle(-ACTIONS_WIDTH / 2 - 1)).toBe(true);
    expect(settle(-ACTIONS_WIDTH)).toBe(true);
  });

  it('vuelve a cerrarse si se arrastró poco', () => {
    expect(settle(-10)).toBe(false);
    expect(settle(0)).toBe(false);
  });
});
