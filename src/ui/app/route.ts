// Rutas de la app como texto del hash (ADR 0018). Funciones puras: leer y armar la dirección.
//
//   #/inicio                       → Inicio
//   #/movimientos?movimiento=nuevo → Movimientos con el panel de nuevo movimiento abierto
//   #/inicio?movimiento=abc123     → Inicio con el panel editando el movimiento abc123
//   #/inicio?cuenta=nueva          → Inicio con el panel de cuenta nueva
//   #/ajustes?categoria=abc        → Ajustes con el panel editando la categoría abc
//   #/movimientos?capa=1           → Movimientos con un diálogo o un panel sin dirección propia
//                                    abierto (Filtros, una confirmación): Atrás lo cierra

export const SCREENS = ['inicio', 'movimientos', 'estadisticas', 'ajustes'] as const;
export type Screen = (typeof SCREENS)[number];

/** Panel abierto encima de la pantalla. `id: null` = crear; con un ID = editar ese documento. */
export type PanelKind = 'transaction' | 'account' | 'category';
export interface Panel {
  kind: PanelKind;
  id: string | null;
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

/** Parámetro del hash de cada tipo de panel, y el valor que significa "nuevo". */
const PANEL_PARAMS = {
  transaction: { param: 'movimiento', create: 'nuevo' },
  account: { param: 'cuenta', create: 'nueva' },
  category: { param: 'categoria', create: 'nueva' },
} as const;

const LAYER_PARAM = 'capa';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function parsePanel(query: URLSearchParams): Panel | null {
  for (const kind of ['transaction', 'account', 'category'] as const) {
    const { param, create } = PANEL_PARAMS[kind];
    const value = query.get(param);
    if (value === null) continue;
    if (value === create) return { kind, id: null };
    if (ID_PATTERN.test(value)) return { kind, id: value };
  }
  return null;
}

/** Lee el hash. Una dirección desconocida lleva a Inicio. */
export function parseHash(hash: string): Route {
  const [path = '', queryText = ''] = hash.replace(/^#\/?/, '').split('?');
  const screen = SCREENS.find((s) => s === path) ?? 'inicio';
  const query = new URLSearchParams(queryText);
  return { screen, panel: parsePanel(query), layer: query.get(LAYER_PARAM) === '1' };
}

export function formatHash({ screen, panel, layer }: Route): string {
  const params: string[] = [];
  if (panel) {
    const { param, create } = PANEL_PARAMS[panel.kind];
    params.push(`${param}=${panel.id ?? create}`);
  }
  if (layer) params.push(`${LAYER_PARAM}=1`);
  return params.length === 0 ? `#/${screen}` : `#/${screen}?${params.join('&')}`;
}
