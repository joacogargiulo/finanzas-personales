import { describe, expect, it } from 'vitest';
import {
  dayHeading,
  dayMonth,
  initials,
  monthShort,
  rateLabel,
  ratesAge,
  syncState,
} from './format';

describe('initials', () => {
  it('usa las iniciales de las dos primeras palabras del nombre', () => {
    expect(initials('Joaquín Gargiulo', 'j@example.com')).toBe('JG');
    expect(initials('ana maría pérez', null)).toBe('AM');
    expect(initials('Cher', null)).toBe('C');
  });

  it('sin nombre, usa la primera letra del email', () => {
    expect(initials(null, 'joaco@example.com')).toBe('J');
    expect(initials('   ', 'z@example.com')).toBe('Z');
    expect(initials(null, null)).toBe('?');
  });
});

describe('fechas cortas', () => {
  it('muestran el mes en español', () => {
    expect(monthShort('2026-10-03')).toBe('oct.');
    expect(monthShort('2026-09-30')).toBe('sept.');
    expect(dayMonth('2026-10-03')).toBe('3 oct.');
  });
});

// Las cotizaciones son decimales: se convierten a centavos con enteros antes de mostrarlas.
describe('rateLabel', () => {
  it('muestra el precio de 1 unidad en pesos', () => {
    expect(rateLabel(1345.5)).toBe('$ 1.345,50');
    expect(rateLabel(1520)).toBe('$ 1.520,00');
  });
});

// SRS 5.7: con más de 24 horas, la cotización se marca como desactualizada.
describe('ratesAge', () => {
  const NOW = new Date(2026, 9, 3, 12, 0).getTime();
  const MIN = 60_000;

  it('dice hace cuánto se actualizó', () => {
    expect(ratesAge(NOW - 20_000, NOW)).toEqual({ label: 'recién actualizada', stale: false });
    expect(ratesAge(NOW - 12 * MIN, NOW)).toEqual({ label: 'hace 12 min', stale: false });
    expect(ratesAge(NOW - 3 * 60 * MIN, NOW)).toEqual({ label: 'hace 3 h', stale: false });
  });

  it('marca como desactualizada la de más de 24 horas', () => {
    const old = new Date(2026, 9, 1, 9, 0).getTime();
    expect(ratesAge(old, NOW)).toEqual({ label: 'desactualizada (del 01/10)', stale: true });
  });
});

// SRS 6.2: los tres estados del indicador de sincronización.
describe('syncState', () => {
  it('sin conexión manda, aunque haya cambios pendientes', () => {
    expect(syncState({ pendingWrites: true, upToDate: false }, false)).toBe('offline');
  });

  it('con conexión y cambios por subir, o sin ponerse al día: sincronizando', () => {
    expect(syncState({ pendingWrites: true, upToDate: true }, true)).toBe('syncing');
    expect(syncState({ pendingWrites: false, upToDate: false }, true)).toBe('syncing');
  });

  it('todo al día: sincronizado', () => {
    expect(syncState({ pendingWrites: false, upToDate: true }, true)).toBe('synced');
  });
});

// Encabezados de la lista de Movimientos agrupada por día.
describe('dayHeading', () => {
  const TODAY = '2026-10-03';

  it('marca hoy y ayer', () => {
    expect(dayHeading('2026-10-03', TODAY)).toBe('Hoy · sábado 3 de octubre');
    expect(dayHeading('2026-10-02', TODAY)).toBe('Ayer · viernes 2 de octubre');
  });

  it('muestra el día de la semana y la fecha', () => {
    expect(dayHeading('2026-09-29', TODAY)).toBe('martes 29 de septiembre');
  });

  it('agrega el año si no es el actual', () => {
    expect(dayHeading('2025-12-31', TODAY)).toBe('miércoles 31 de diciembre de 2025');
  });
});
