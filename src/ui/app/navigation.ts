// Navegación por hash (ADR 0018): conecta las rutas puras de route.ts con el navegador.
//
// Cómo queda el historial, pensando en el botón Atrás de Android:
// - Desde Inicio, ir a otra pestaña agrega una entrada: Atrás vuelve a Inicio.
// - Entre las otras pestañas, se reemplaza la entrada: Atrás siempre vuelve a Inicio, y desde
//   Inicio sale de la app (como las apps nativas).
// - Abrir un panel agrega una entrada: Atrás lo cierra en vez de salir de la app.

import { useMemo, useSyncExternalStore } from 'react';
import { formatHash, parseHash, type Panel, type Route, type Screen } from './route';

/** Esta sesión agregó la entrada del historial de la pestaña actual (se puede volver con Atrás). */
let tabPushed = false;
/** Esta sesión agregó la entrada del historial del panel abierto. */
let panelPushed = false;

function current(): Route {
  return parseHash(window.location.hash);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
  };
}

if (typeof window !== 'undefined') {
  // Si el usuario volvió con Atrás, las entradas que agregamos ya no están.
  window.addEventListener('hashchange', () => {
    const route = current();
    if (!route.panel) panelPushed = false;
    if (route.screen === 'inicio') tabPushed = false;
  });
}

/** La ruta actual; el componente se vuelve a dibujar cuando cambia. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

function push(route: Route): void {
  window.location.hash = formatHash(route);
}

function replace(route: Route): void {
  // `location.replace` con solo el hash cambia la dirección sin agregar una entrada y avisa
  // con `hashchange`, igual que una navegación normal.
  window.location.replace(formatHash(route));
}

export function goTo(screen: Screen): void {
  const route = current();
  if (route.screen === screen && !route.panel) return;
  if (screen === 'inicio' && tabPushed) {
    window.history.back();
  } else if (route.screen === 'inicio') {
    push({ screen, panel: null });
    tabPushed = true;
  } else {
    replace({ screen, panel: null });
  }
}

export function openPanel(panel: Panel): void {
  const route = current();
  if (route.panel) {
    // De un panel a otro (por ejemplo, crear una cuenta desde el panel de movimiento):
    // se reemplaza, así Atrás sigue cerrando con un solo toque.
    replace({ screen: route.screen, panel });
    return;
  }
  push({ screen: route.screen, panel });
  panelPushed = true;
}

export function closePanel(): void {
  const route = current();
  if (!route.panel) return;
  if (panelPushed) window.history.back();
  else replace({ screen: route.screen, panel: null });
}
