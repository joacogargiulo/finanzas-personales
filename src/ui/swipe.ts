// Cálculos del gesto de arrastrar una fila hacia la izquierda para ver sus acciones. Son
// funciones puras: el componente SwipeRow solo les pasa cuánto se movió el dedo.

/** Ancho de los botones que aparecen (dos botones de 72 px). */
export const ACTIONS_WIDTH = 144;

/** Arrastrando más de la mitad, la fila queda abierta al soltar. */
export const OPEN_THRESHOLD = ACTIONS_WIDTH / 2;

/** Píxeles que hay que mover el dedo antes de decidir si es un arrastre o un scroll. */
export const GESTURE_SLOP = 8;

export type Gesture = 'undecided' | 'horizontal' | 'vertical';

/**
 * ¿El usuario quiere arrastrar la fila o desplazar la lista? Hasta moverse `GESTURE_SLOP`
 * píxeles no se sabe; después gana la dirección en la que más se movió. Si es vertical, la
 * fila no se mueve y el navegador hace el scroll normal.
 */
export function decideGesture(dx: number, dy: number): Gesture {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < GESTURE_SLOP) return 'undecided';
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
}

/**
 * Posición de la fila mientras se arrastra: parte de donde estaba (abierta o cerrada) y nunca
 * pasa de los extremos (no se va a la derecha ni más allá de los botones).
 */
export function dragOffset(wasOpen: boolean, dx: number): number {
  const start = wasOpen ? -ACTIONS_WIDTH : 0;
  return Math.min(0, Math.max(-ACTIONS_WIDTH, start + dx));
}

/** Al soltar: abierta si se arrastró más allá de la mitad de los botones. */
export function settle(offset: number): boolean {
  return offset <= -OPEN_THRESHOLD;
}
