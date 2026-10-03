import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  addYearsClamped,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatDisplayDate,
  isLeapYear,
  isValidLocalDate,
  monthsBetween,
  today,
} from './dates';

describe('today', () => {
  // Los tests corren con TZ=America/Argentina/Buenos_Aires (vite.config.ts).
  // TC-16: a las 23:30 en Argentina ya son las 02:30 del día siguiente en UTC.
  it('los tests corren en la zona horaria de Argentina (UTC−3)', () => {
    expect(new Date('2026-10-03T12:00:00Z').getTimezoneOffset()).toBe(180);
  });

  it('usa la fecha local, no la de UTC (TC-16)', () => {
    const lateNight = new Date('2026-10-03T23:30:00-03:00');
    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-10-04'); // lo que NO hay que hacer
    expect(today(lateNight)).toBe('2026-10-03');
  });

  it('el 1 de enero a las 00:05 es el 1 de enero', () => {
    expect(today(new Date('2027-01-01T00:05:00-03:00'))).toBe('2027-01-01');
  });
});

describe('isValidLocalDate', () => {
  // Formato exacto YYYY-MM-DD y una fecha que exista en el calendario.
  it.each(['2026-10-03', '2024-02-29', '2026-12-31'])('"%s" es válida', (date) => {
    expect(isValidLocalDate(date)).toBe(true);
  });

  it.each(['2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-5', '03/10/2026', ''])(
    '"%s" no es válida',
    (date) => {
      expect(isValidLocalDate(date)).toBe(false);
    },
  );
});

describe('calendario', () => {
  it('años bisiestos', () => {
    expect([2024, 2000, 2026, 1900].map(isLeapYear)).toEqual([true, true, false, false]);
  });

  it('días del mes', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('aritmética de fechas', () => {
  // Sumar días cruza meses y años sin problemas de zona horaria.
  it('addDays', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween', () => {
    expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
    expect(daysBetween('2026-01-10', '2026-01-03')).toBe(-7);
  });

  // Fin de mes (SRS 5.10, TC-13): el día que no existe cae en el último del mes.
  it('addMonthsClamped con el día 31', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    // Con el día ancla, febrero no "arrastra" el 28 a los meses siguientes.
    expect(addMonthsClamped('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-11-15', 2)).toBe('2027-01-15');
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('addYearsClamped con el 29 de febrero', () => {
    expect(addYearsClamped('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYearsClamped('2024-02-29', 4)).toBe('2028-02-29');
  });

  it('monthsBetween ignora el día', () => {
    expect(monthsBetween('2026-01-31', '2026-03-01')).toBe(2);
    expect(monthsBetween('2025-11-10', '2026-02-10')).toBe(3);
  });
});

describe('formato', () => {
  it('formatDisplayDate y endOfMonth', () => {
    expect(formatDisplayDate('2026-10-03')).toBe('03/10/2026');
    expect(endOfMonth('2028-02-10')).toBe('2028-02-29');
  });
});
