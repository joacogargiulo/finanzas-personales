// Fechas dichas en voz alta: "ayer", "el lunes", "el 5 de octubre" (ADR 0015).
// Siempre se interpreta la fecha pasada más cercana: nadie dicta un gasto de la semana que viene.

import { addDays, daysInMonth, parseLocalDate, toLocalDate } from '../dates';
import type { LocalDate } from '../model';
import { readNumber } from './numbers';

const WEEKDAYS: Readonly<Record<string, number>> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
};

const MONTHS: Readonly<Record<string, number>> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

export interface DateMatch {
  date: LocalDate;
  start: number;
  end: number;
}

function dayOfWeek(date: LocalDate): number {
  const parts = parseLocalDate(date);
  if (!parts) throw new RangeError(`Fecha inválida: ${date}`);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** El último día `day` (de `month`, si se indica) que no sea posterior a hoy. */
function mostRecent(day: number, month: number | null, today: LocalDate): LocalDate | null {
  const now = parseLocalDate(today);
  if (!now) return null;
  // Se prueban meses hacia atrás hasta encontrar uno donde la fecha exista y ya haya pasado.
  // 8 años alcanzan para cualquier 29 de febrero.
  for (let back = 0; back < 12 * 8; back += 1) {
    const index = now.year * 12 + (now.month - 1) - back;
    const year = Math.floor(index / 12);
    const m = (index % 12) + 1;
    if (month !== null && m !== month) continue;
    if (day > daysInMonth(year, m)) continue;
    const date = toLocalDate({ year, month: m, day });
    if (date <= today) return date;
  }
  return null;
}

/** "el 5", "el día 5", "el cinco de octubre", "5 de octubre". */
function dayOfMonthAt(
  norms: readonly string[],
  i: number,
  used: readonly boolean[],
  today: LocalDate,
): DateMatch | null {
  let pos = i;
  const hasArticle = norms[pos] === 'el';
  if (hasArticle) pos += 1;
  if (norms[pos] === 'dia') pos += 1;
  const number = readNumber(norms, pos, used);
  if (!number || number.hasMultiplier || number.cents % 100n !== 0n) return null;
  const day = Number(number.cents / 100n);
  if (day < 1 || day > 31) return null;

  let end = number.end;
  let month: number | null = null;
  const monthWord = norms[end + 1];
  if (norms[end] === 'de' && monthWord !== undefined && MONTHS[monthWord] !== undefined) {
    month = MONTHS[monthWord];
    end += 2;
  }
  // Sin "el" ni mes ("gasté 5"), el número es un monto, no una fecha.
  if (!hasArticle && month === null) return null;
  const date = mostRecent(day, month, today);
  return date ? { date, start: i, end } : null;
}

/** "5/10" o "5/10/2026". */
function slashDateAt(token: string, today: LocalDate): LocalDate | null {
  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(token);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (match[3] === undefined) return mostRecent(day, month, today);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = toLocalDate({ year, month, day });
  return parseLocalDate(date) ? date : null;
}

/** La primera fecha que aparece en la frase, o `null` (el parser usa hoy). */
export function findDate(
  norms: readonly string[],
  used: readonly boolean[],
  today: LocalDate,
): DateMatch | null {
  for (let i = 0; i < norms.length; i += 1) {
    if (used[i] === true) continue;
    const token = norms[i] ?? '';

    if (token === 'hoy') return { date: today, start: i, end: i + 1 };
    if (token === 'ayer') return { date: addDays(today, -1), start: i, end: i + 1 };
    if (token === 'anteayer' || token === 'antier') {
      return { date: addDays(today, -2), start: i, end: i + 1 };
    }
    if (token === 'antes' && norms[i + 1] === 'de' && norms[i + 2] === 'ayer') {
      return { date: addDays(today, -2), start: i, end: i + 3 };
    }

    // "el lunes", "el viernes pasado": el último de ese día, sin contar hoy.
    const weekdayIndex = token === 'el' ? i + 1 : i;
    const weekday = WEEKDAYS[norms[weekdayIndex] ?? ''];
    if (weekday !== undefined) {
      const diff = (dayOfWeek(today) - weekday + 7) % 7 || 7;
      let end = weekdayIndex + 1;
      if (norms[end] === 'pasado') end += 1;
      return { date: addDays(today, -diff), start: i, end };
    }

    const slash = slashDateAt(token, today);
    if (slash) return { date: slash, start: i, end: i + 1 };

    const dayMatch = dayOfMonthAt(norms, i, used, today);
    if (dayMatch) return dayMatch;
  }
  return null;
}
