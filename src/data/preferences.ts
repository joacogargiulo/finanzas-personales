// Preferencias de cada dispositivo (SRS 4.8, ADR 0008): van en `localStorage`, con el `uid` en
// la clave, así dos personas que usan la misma compu no se pisan el tema.
// `localStorage` puede no estar disponible (ventana privada, datos bloqueados): todo acceso va
// dentro de try/catch y, si falla, se usa el valor por defecto.

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

function themeKey(uid: string): string {
  return `prefs:${uid}:theme`;
}

export function readTheme(uid: string): Theme {
  try {
    const value = window.localStorage.getItem(themeKey(uid));
    return THEMES.find((theme) => theme === value) ?? 'auto';
  } catch {
    return 'auto';
  }
}

export function writeTheme(uid: string, theme: Theme): void {
  try {
    window.localStorage.setItem(themeKey(uid), theme);
  } catch {
    // Sin almacenamiento, el tema elegido dura hasta cerrar la app.
  }
}
