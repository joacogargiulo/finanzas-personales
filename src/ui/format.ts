// Textos de la interfaz que se arman a partir de los datos: etiquetas, iniciales, antigüedad de
// la cotización. Los montos se formatean con `formatAmount` del dominio.

import { STALE_RATES_MS, toArs } from '../domain/consolidation';
import { addDays, parseLocalDate } from '../domain/dates';
import type { AccountKind, EpochMs, Frequency, LocalDate, TransactionType } from '../domain/model';
import { formatAmount } from '../domain/money';
import type { SyncStatus } from '../data/sync';

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Efectivo',
  bank: 'Banco',
  wallet: 'Billetera virtual',
  investment: 'Inversión',
  other: 'Otra',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  expense: 'Gasto',
  income: 'Ingreso',
  transfer: 'Transferencia',
  exchange: 'Cambio de moneda',
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

const MONTHS_SHORT = [
  'ene.',
  'feb.',
  'mar.',
  'abr.',
  'may.',
  'jun.',
  'jul.',
  'ago.',
  'sept.',
  'oct.',
  'nov.',
  'dic.',
];

const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `2026-10-03` → `oct.` */
export function monthShort(date: LocalDate): string {
  const parts = parseLocalDate(date);
  return parts ? (MONTHS_SHORT[parts.month - 1] ?? '') : '';
}

/** `2026-10-03` → `octubre` */
export function monthLong(date: LocalDate): string {
  const parts = parseLocalDate(date);
  return parts ? (MONTHS_LONG[parts.month - 1] ?? '') : '';
}

/** `2026-10-03` → `3 oct.` */
export function dayMonth(date: LocalDate): string {
  const parts = parseLocalDate(date);
  return parts ? `${String(parts.day)} ${monthShort(date)}` : date;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Encabezado de un día en Movimientos: "Hoy · sábado 3 de octubre", "Ayer · …" o
 * "jueves 1 de octubre". Con el año si no es el actual.
 */
export function dayHeading(date: LocalDate, today: LocalDate): string {
  const parts = parseLocalDate(date);
  if (!parts) return date;
  // Día de la semana con UTC: no depende de la zona horaria del dispositivo.
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : ` de ${String(parts.year)}`;
  const label = `${weekday ?? ''} ${String(parts.day)} de ${monthLong(date)}${year}`;
  if (date === today) return `Hoy · ${label}`;
  if (date === addDays(today, -1)) return `Ayer · ${label}`;
  return label;
}

/** Iniciales para el avatar: "Joaquín Gargiulo" → "JG". Sin nombre, la primera letra del email. */
export function initials(displayName: string | null, email: string | null): string {
  const words = (displayName ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words
      .slice(0, 2)
      .map((word) => word.charAt(0).toLocaleUpperCase('es-AR'))
      .join('');
  }
  return (email ?? '?').charAt(0).toLocaleUpperCase('es-AR');
}

/** Precio de 1 unidad en pesos, sin punto flotante: `1345.5` → `$ 1.345,50`. */
export function rateLabel(rate: number): string {
  return formatAmount(toArs(100, rate), 'ARS');
}

/**
 * Antigüedad de la cotización: "hace 12 min", "hace 3 h". Con más de 24 horas, la fecha y el
 * aviso "desactualizada" (SRS 5.7).
 */
export function ratesAge(fetchedAt: EpochMs, now: EpochMs): { label: string; stale: boolean } {
  const elapsed = Math.max(0, now - fetchedAt);
  if (elapsed > STALE_RATES_MS) {
    const date = new Date(fetchedAt);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return { label: `desactualizada (del ${day}/${month})`, stale: true };
  }
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return { label: 'recién actualizada', stale: false };
  if (minutes < 60) return { label: `hace ${String(minutes)} min`, stale: false };
  return { label: `hace ${String(Math.floor(minutes / 60))} h`, stale: false };
}

export type SyncState = 'offline' | 'syncing' | 'synced';

/**
 * Estado del indicador de sincronización (SRS 6.2). Sin conexión manda; con conexión, hay
 * cambios por subir o los listeners todavía no se pusieron al día → "Sincronizando…".
 */
export function syncState(sync: SyncStatus, online: boolean): SyncState {
  if (!online) return 'offline';
  return sync.pendingWrites || !sync.upToDate ? 'syncing' : 'synced';
}

/** Parte de un total (0 a 1) como porcentaje: `0.493` → `49 %`. Menos del 1 % → `< 1 %`. */
export function percentLabel(share: number): string {
  if (share > 0 && share < 0.005) return '< 1 %';
  // Armado a mano: según el motor, Intl escribe "49%" o "49 %".
  return `${String(Math.round(share * 100))} %`;
}

/** Momento de la última exportación: "5/10/2026 a las 14:32". Armado a mano, como `percentLabel`. */
export function exportedAtLabel(at: EpochMs): string {
  const date = new Date(at);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${String(date.getDate())}/${String(date.getMonth() + 1)}/${String(date.getFullYear())} a las ${hours}:${minutes}`;
}
