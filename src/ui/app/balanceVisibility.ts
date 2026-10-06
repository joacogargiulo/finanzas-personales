// Ocultar el patrimonio y los saldos (el ojo de Inicio). Como el tema, la elección es de cada
// dispositivo y usuario (src/data/preferences.ts) y se recuerda al volver a abrir la app.

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { readHideBalances, writeHideBalances } from '../../data/preferences';

const visibilityStore = createStore<{ hidden: boolean }>(() => ({ hidden: false }));

/** Carga la elección guardada del usuario. */
export function loadHideBalances(uid: string): void {
  visibilityStore.setState({ hidden: readHideBalances(uid) });
}

export function setHideBalances(uid: string, hidden: boolean): void {
  writeHideBalances(uid, hidden);
  visibilityStore.setState({ hidden });
}

export function useHideBalances(): boolean {
  return useStore(visibilityStore, (s) => s.hidden);
}
