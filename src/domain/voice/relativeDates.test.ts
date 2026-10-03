import { describe, expect, it } from 'vitest';
import { findDate } from './relativeDates';
import { tokenize } from './tokens';

// Hoy es sábado 3 de octubre de 2026.
const TODAY = '2026-10-03';
const dateOf = (text: string) =>
  findDate(
    tokenize(text).map((t) => t.norm),
    [],
    TODAY,
  )?.date ?? null;

describe('findDate (ADR 0015)', () => {
  it.each([
    ['hoy', '2026-10-03'],
    ['ayer', '2026-10-02'],
    ['anteayer', '2026-10-01'],
    ['antes de ayer', '2026-10-01'],
  ])('"%s" → %s', (text, date) => {
    expect(dateOf(text)).toBe(date);
  });

  // Un día de la semana es el último que pasó; si es hoy, el de la semana anterior.
  it.each([
    ['el viernes', '2026-10-02'],
    ['el lunes', '2026-09-28'],
    ['el sábado', '2026-09-26'],
    ['el miércoles pasado', '2026-09-30'],
  ])('"%s" → %s', (text, date) => {
    expect(dateOf(text)).toBe(date);
  });

  // Un día del mes es el último que pasó: "el 5" todavía no llegó en octubre → 5 de septiembre.
  it.each([
    ['el 1', '2026-10-01'],
    ['el 5', '2026-09-05'],
    ['el día 3', '2026-10-03'],
    ['el treinta y uno', '2026-08-31'],
    ['el 5 de octubre', '2025-10-05'],
    ['el cinco de enero', '2026-01-05'],
    ['20 de septiembre', '2026-09-20'],
    ['el 29 de febrero', '2024-02-29'],
    ['5/10', '2025-10-05'],
    ['1/10/2026', '2026-10-01'],
  ])('"%s" → %s', (text, date) => {
    expect(dateOf(text)).toBe(date);
  });

  // Lo que no es una fecha: un monto suelto o un número que no puede ser un día.
  it.each(['gasté 5', 'el 50', 'el alquiler', 'mil pesos'])('"%s" no tiene fecha', (text) => {
    expect(dateOf(text)).toBeNull();
  });

  it('devuelve dónde está la fecha en la frase', () => {
    const match = findDate(['gaste', '300', 'el', '5', 'de', 'octubre'], [], TODAY);
    expect(match).toMatchObject({ start: 2, end: 6 });
  });
});
