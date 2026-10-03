// Rutas de la app como texto del hash (ADR 0018). Funciones puras: leer y armar la dirección.
//
//   #/inicio                       → Inicio
//   #/movimientos?movimiento=nuevo → Movimientos con el panel de nuevo movimiento abierto
//   #/inicio?movimiento=abc123     → Inicio con el panel editando el movimiento abc123
//   #/inicio?cuenta=nueva          → Inicio con el panel de cuenta nueva

export const SCREENS = ['inicio', 'movimientos', 'estadisticas', 'ajustes'] as const;
export type Screen = (typeof SCREENS)[number];

/** Panel abierto encima de la pantalla. `id: null` = crear; con un ID = editar ese documento. */
export type Panel =
  { kind: 'transaction'; id: string | null } | { kind: 'account'; id: string | null };

export interface Route {
  screen: Screen;
  panel: Panel | null;
}

/** Parámetro del hash de cada tipo de panel, y el valor que significa "nuevo". */
const PANEL_PARAMS = {
  transaction: { param: 'movimiento', create: 'nuevo' },
  account: { param: 'cuenta', create: 'nueva' },
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function parsePanel(query: URLSearchParams): Panel | null {
  for (const kind of ['transaction', 'account'] as const) {
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
  return { screen, panel: parsePanel(new URLSearchParams(queryText)) };
}

export function formatHash({ screen, panel }: Route): string {
  if (!panel) return `#/${screen}`;
  const { param, create } = PANEL_PARAMS[panel.kind];
  return `#/${screen}?${param}=${panel.id ?? create}`;
}
