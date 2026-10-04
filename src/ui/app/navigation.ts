// Navegación por hash (ADR 0018): conecta las rutas puras de route.ts con el navegador.
//
// Cómo queda el historial, pensando en el botón Atrás de Android:
// - Desde Inicio, ir a otra pestaña agrega una entrada: Atrás vuelve a Inicio.
// - Entre las otras pestañas, se reemplaza la entrada: Atrás siempre vuelve a Inicio, y desde
//   Inicio sale de la app (como las apps nativas).
// - Abrir un panel agrega una entrada: Atrás lo cierra en vez de salir de la app.
// - Abrir una capa (un diálogo sin dirección propia: Filtros, una confirmación) agrega otra
//   entrada, `?capa=1`: Atrás cierra solo el diálogo (ver `useLayer`).

import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { formatHash, parseHash, type Panel, type Route, type Screen } from './route';

/** Esta sesión agregó la entrada del historial de la pestaña actual (se puede volver con Atrás). */
let tabPushed = false;
/** Esta sesión agregó la entrada del historial del panel abierto. */
let panelPushed = false;
/** Esta sesión agregó la entrada del historial de la capa abierta. */
let layerPushed = false;
/** Algo que hacer cuando termine de volver atrás (`history.go` no es instantáneo). */
let afterBack: (() => void) | null = null;

function current(): Route {
  return parseHash(window.location.hash);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => {
    window.removeEventListener('hashchange', callback);
  };
}

function replace(route: Route): void {
  // `location.replace` con solo el hash cambia la dirección sin agregar una entrada y avisa
  // con `hashchange`, igual que una navegación normal.
  window.location.replace(formatHash(route));
}

if (typeof window !== 'undefined') {
  // Si el usuario volvió con Atrás, las entradas que agregamos ya no están.
  window.addEventListener('hashchange', () => {
    const route = current();
    if (!route.layer) layerPushed = false;
    if (!route.panel) panelPushed = false;
    if (route.screen === 'inicio') tabPushed = false;
    const next = afterBack;
    afterBack = null;
    next?.();
  });

  // Una capa no sobrevive a recargar la página (su diálogo vive en la memoria de React).
  const route = current();
  if (route.layer) replace({ ...route, layer: false });
}

/** La ruta actual; el componente se vuelve a dibujar cuando cambia. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return useMemo(() => parseHash(hash), [hash]);
}

function push(route: Route): void {
  window.location.hash = formatHash(route);
}

/** Vuelve `steps` entradas atrás y, al llegar, hace `then`. */
function back(steps: number, then?: () => void): void {
  afterBack = then ?? null;
  window.history.go(-steps);
}

export function goTo(screen: Screen): void {
  const route = current();
  if (route.screen === screen && !route.panel) return;
  if (screen === 'inicio' && tabPushed) {
    back(1);
  } else if (route.screen === 'inicio') {
    push({ screen, panel: null, layer: false });
    tabPushed = true;
  } else {
    replace({ screen, panel: null, layer: false });
  }
}

export function openPanel(panel: Panel): void {
  const route = current();
  if (route.panel) {
    // De un panel a otro (por ejemplo, crear una cuenta desde el panel de movimiento):
    // se reemplaza, así Atrás sigue cerrando con un solo toque.
    replace({ screen: route.screen, panel, layer: false });
    return;
  }
  push({ screen: route.screen, panel, layer: false });
  panelPushed = true;
}

export function closePanel(): void {
  const route = current();
  if (!route.panel) return;
  const target: Route = { screen: route.screen, panel: null, layer: false };
  // Si hay una capa encima del panel (la confirmación de "Eliminar"), se sacan las dos.
  const layerSteps = route.layer && layerPushed ? 1 : 0;
  if (panelPushed) {
    back(1 + layerSteps);
  } else if (layerSteps > 0) {
    back(layerSteps, () => {
      replace(target);
    });
  } else {
    replace(target);
  }
}

function openLayer(): void {
  const route = current();
  if (route.layer) return;
  push({ ...route, layer: true });
  layerPushed = true;
}

function closeLayer(): void {
  const route = current();
  if (!route.layer) return;
  if (layerPushed) back(1);
  else replace({ ...route, layer: false });
}

/** Cierre de una capa que todavía no se hizo (ver `useLayer`). */
let pendingClose: ReturnType<typeof setTimeout> | null = null;

/**
 * Conecta un diálogo con el botón Atrás: al abrirse agrega `?capa=1` a la dirección; si el
 * usuario vuelve atrás, llama a `onClose`; si el diálogo se cierra por su cuenta (Cancelar,
 * Aplicar), saca esa entrada del historial.
 *
 * El cierre espera un instante por dos casos en los que el diálogo se desmonta y se vuelve a
 * montar enseguida: el modo estricto de React en desarrollo, y pasar de un diálogo a otro.
 * Si otro diálogo se abre en ese instante, reutiliza la misma entrada.
 */
export function useLayer(onClose: () => void, enabled = true): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!enabled) return;
    if (pendingClose !== null) {
      clearTimeout(pendingClose);
      pendingClose = null;
    } else {
      openLayer();
    }

    let closedByBack = false;
    const onHashChange = () => {
      if (current().layer) return;
      closedByBack = true;
      onCloseRef.current();
    };
    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      if (closedByBack) return;
      pendingClose = setTimeout(() => {
        pendingClose = null;
        closeLayer();
      }, 0);
    };
  }, [enabled]);
}
