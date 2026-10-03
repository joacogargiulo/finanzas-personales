// Fechas calendario locales `YYYY-MM-DD` (SRS 5.11, ADR 0014).
// Como texto con ceros a la izquierda, el orden alfabético coincide con el cronológico:
// se pueden comparar con `<` y `>`.

import type { LocalDate } from './model';

const MS_PER_DAY = 86_400_000;

export interface DateParts {
  year: number;
  /** 1 a 12. */
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Días del mes (`month` de 1 a 12). */
export function daysInMonth(year: number, month: number): number {
  // El día 0 del mes siguiente es el último día de este mes.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Separa la fecha en números, o `null` si no es una fecha real (`2026-02-30`). */
export function parseLocalDate(date: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function isValidLocalDate(date: string): date is LocalDate {
  return parseLocalDate(date) !== null;
}

/** Igual que `parseLocalDate`, pero para fechas que ya se validaron. */
function partsOf(date: LocalDate): DateParts {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError(`Fecha inválida: ${date}`);
  return parts;
}

export function toLocalDate({ year, month, day }: DateParts): LocalDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * "Hoy" según el reloj y la zona horaria del dispositivo.
 * Nunca `toISOString()`: a las 23:30 en Argentina (UTC−3) ya es mañana en UTC (TC-16).
 */
export function today(now: Date = new Date()): LocalDate {
  return toLocalDate({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

/** Días como números enteros desde una fecha fija, sin zona horaria ni horario de verano. */
function dayNumber(date: LocalDate): number {
  const { year, month, day } = partsOf(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromDayNumber(days: number): LocalDate {
  const d = new Date(days * MS_PER_DAY);
  return toLocalDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromDayNumber(dayNumber(date) + days);
}

/** Días de `from` a `to` (negativo si `to` es anterior). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return dayNumber(to) - dayNumber(from);
}

/**
 * Suma meses manteniendo el día `anchorDay` (por defecto, el de `date`).
 * Si el mes no tiene ese día, usa el último: 31/01 + 1 mes → 28/02 o 29/02.
 */
export function addMonthsClamped(date: LocalDate, months: number, anchorDay?: number): LocalDate {
  const { year, month, day } = partsOf(date);
  const index = year * 12 + (month - 1) + months;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  return toLocalDate({
    year: newYear,
    month: newMonth,
    day: Math.min(anchorDay ?? day, daysInMonth(newYear, newMonth)),
  });
}

/** Suma años; el 29/02 cae en 28/02 si el año no es bisiesto. */
export function addYearsClamped(date: LocalDate, years: number): LocalDate {
  const { year, month, day } = partsOf(date);
  const newYear = year + years;
  return toLocalDate({ year: newYear, month, day: Math.min(day, daysInMonth(newYear, month)) });
}

/** Meses calendario de `from` a `to`, sin mirar el día (enero → marzo = 2). */
export function monthsBetween(from: LocalDate, to: LocalDate): number {
  const a = partsOf(from);
  const b = partsOf(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** `2026-10-03` → `2026-10`. */
export function monthKey(date: LocalDate): string {
  return date.slice(0, 7);
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${monthKey(date)}-01`;
}

export function endOfMonth(date: LocalDate): LocalDate {
  const { year, month } = partsOf(date);
  return toLocalDate({ year, month, day: daysInMonth(year, month) });
}

/** `2026-10-03` → `03/10/2026` (SRS 6.4). */
export function formatDisplayDate(date: LocalDate): string {
  const { year, month, day } = partsOf(date);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${String(year)}`;
}

export function maxDate(a: LocalDate, b: LocalDate): LocalDate {
  return a > b ? a : b;
}
