// Tema claro, oscuro o automático (ADR 0020). La preferencia es de cada dispositivo y usuario
// (src/data/preferences.ts). Se aplica con `data-theme` en <html>; sin el atributo, los
// estilos siguen al sistema (`prefers-color-scheme`).

import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { readTheme, writeTheme, type Theme } from '../../data/preferences';

const themeStore = createStore<{ theme: Theme }>(() => ({ theme: 'auto' }));

function apply(theme: Theme): void {
  themeStore.setState({ theme });
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset['theme'];
  else root.dataset['theme'] = theme;
}

/** Carga el tema guardado del usuario (o el automático si no hay sesión). */
export function loadTheme(uid: string | null): void {
  apply(uid ? readTheme(uid) : 'auto');
}

export function setTheme(uid: string, theme: Theme): void {
  writeTheme(uid, theme);
  apply(theme);
}

export function useTheme(): Theme {
  return useStore(themeStore, (s) => s.theme);
}
