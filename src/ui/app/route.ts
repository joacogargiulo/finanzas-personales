// Rutas de la app como texto del hash (ADR 0018). Funciones puras: leer y armar la dirección.
//
//   #/inicio                       → Inicio
//   #/movimientos?movimiento=nuevo → Movimientos con el panel de nuevo movimiento abierto
//   #/inicio?movimiento=nuevo&dictar=1
//                                  → Inicio con el panel de nuevo movimiento, que empieza a
//                                    escuchar enseguida (ADR 0023; el atajo de la Fase 7)
//   #/inicio?movimiento=abc123     → Inicio con el panel editando el movimiento abc123
//   #/inicio?cuenta=nueva          → Inicio con el panel de cuenta nueva
//   #/ajustes?categoria=abc        → Ajustes con el panel editando la categoría abc
//   #/ajustes?presupuesto=nuevo    → Ajustes con el panel de presupuesto nuevo
//   #/ajustes?recurrente=abc       → Ajustes con el panel editando el recurrente abc
//   #/inicio?pendiente=rec_abc_2026-10-05
//                                  → Inicio con el panel para confirmar esa ocurrencia (el valor
//                                    es el ID fijo del movimiento que se va a crear, ADR 0004)
//   #/movimientos?capa=1           → Movimientos con un diálogo o un panel sin dirección propia
//                                    abierto (Filtros, una confirmación): Atrás lo cierra

export const SCREENS = ['inicio', 'movimientos', 'estadisticas', 'ajustes'] as const;
export type Screen = (typeof SCREENS)[number];

/**
 * Panel abierto encima de la pantalla. `id: null` = crear; con un ID = editar ese documento.
 * `occurrence` (confirmar un recurrente pendiente) siempre lleva el ID del movimiento a crear.
 */
export type PanelKind =
  'transaction' | 'account' | 'category' | 'budget' | 'recurring' | 'occurrence';
export interface Panel {
  kind: PanelKind;
  id: string | null;
  /** Empezar a dictar al abrir. Solo vale para un movimiento nuevo. */
  dictate?: true;
}

export interface Route {
  screen: Screen;
  panel: Panel | null;
  /**
   * Hay una "capa" abierta encima: un diálogo que no tiene dirección propia. Solo sirve para
   * que el botón Atrás la cierre (ver `useLayer` en navigation.ts).
   */
  layer: boolean;
}

/** Parámetro del hash de cada tipo de panel, y el valor que significa "nuevo" (si existe). */
const PANEL_PARAMS: Record<PanelKind, { param: string; create: string | null }> = {
  transaction: { param: 'movimiento', create: 'nuevo' },
  account: { param: 'cuenta', create: 'nueva' },
  category: { param: 'categoria', create: 'nueva' },
  budget: { param: 'presupuesto', create: 'nuevo' },
  recurring: { param: 'recurrente', create: 'nuevo' },
  occurrence: { param: 'pendiente', create: null },
};

const PANEL_KINDS = Object.keys(PANEL_PARAMS) as PanelKind[];

const LAYER_PARAM = 'capa';
const DICTATE_PARAM = 'dictar';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function parsePanel(query: URLSearchParams): Panel | null {
  for (const kind of PANEL_KINDS) {
    const { param, create } = PANEL_PARAMS[kind];
    const value = query.get(param);
    if (value === null) continue;
    if (create !== null && value === create) return { kind, id: null };
    if (ID_PATTERN.test(value)) return { kind, id: value };
  }
  return null;
}

/** Lee el hash. Una dirección desconocida lleva a Inicio. */
export function parseHash(hash: string): Route {
  const [path = '', queryText = ''] = hash.replace(/^#\/?/, '').split('?');
  const screen = SCREENS.find((s) => s === path) ?? 'inicio';
  const query = new URLSearchParams(queryText);
  let panel = parsePanel(query);
  if (panel?.kind === 'transaction' && panel.id === null && query.get(DICTATE_PARAM) === '1') {
    panel = { ...panel, dictate: true };
  }
  return { screen, panel, layer: query.get(LAYER_PARAM) === '1' };
}

export function formatHash({ screen, panel, layer }: Route): string {
  const params: string[] = [];
  if (panel) {
    const { param, create } = PANEL_PARAMS[panel.kind];
    const value = panel.id ?? create;
    if (value !== null) params.push(`${param}=${value}`);
    if (panel.dictate && panel.kind === 'transaction' && panel.id === null) {
      params.push(`${DICTATE_PARAM}=1`);
    }
  }
  if (layer) params.push(`${LAYER_PARAM}=1`);
  return params.length === 0 ? `#/${screen}` : `#/${screen}?${params.join('&')}`;
}
