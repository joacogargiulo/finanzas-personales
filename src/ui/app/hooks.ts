// Hooks que leen el store y calculan lo derivado con el dominio. Los cálculos se memorizan
// (`useMemo`): solo se rehacen cuando cambian los datos, no en cada dibujo (SRS 10: fluida con
// 10.000 movimientos).

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import { computeBalances } from '../../domain/balances';
import { indexById } from '../../domain/collections';
import { today } from '../../domain/dates';
import type { LocalDate } from '../../domain/model';
import type { DataState } from '../../data/store';
import { store } from '../session';

export function useData<T>(selector: (state: DataState) => T): T {
  return useStore(store, selector);
}

/** Índices por ID y saldos de todas las cuentas (SRS 5.2), memorizados. */
export function useLedger() {
  const accounts = useData((s) => s.accounts);
  const categories = useData((s) => s.categories);
  const transactions = useData((s) => s.transactions);

  const accountsById = useMemo(() => indexById(accounts), [accounts]);
  const categoriesById = useMemo(() => indexById(categories), [categories]);
  const balances = useMemo(() => computeBalances(accounts, transactions), [accounts, transactions]);

  return { accounts, categories, transactions, accountsById, categoriesById, balances };
}

/**
 * "Hoy" en la fecha local (SRS 5.11). Se recalcula cada minuto y al volver a la app, así no
 * queda la fecha de ayer si la app estuvo abierta durante la medianoche.
 */
export function useToday(): LocalDate {
  const [value, setValue] = useState(() => today());
  useEffect(() => {
    const update = () => {
      setValue(today());
    };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return value;
}

/** Hora actual en milisegundos, actualizada cada minuto (para "hace 12 min"). */
export function useNow(): number {
  const [value, setValue] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setValue(Date.now());
    }, 60_000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);
  return value;
}

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** Si el dispositivo tiene conexión, según el navegador. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}
