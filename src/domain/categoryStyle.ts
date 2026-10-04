// Íconos y colores de las categorías: listas fijas de claves (SRS 4.3, ADR 0020).
// En Firestore se guarda solo la clave; el dibujo y el color real (que depende del tema) los
// pone la interfaz. Una clave desconocida (por ejemplo, de una versión más nueva de la app)
// se muestra con el valor por defecto, sin romper nada.

export const CATEGORY_ICONS = [
  'tag',
  'food',
  'cart',
  'transport',
  'car',
  'home',
  'bolt',
  'phone',
  'health',
  'education',
  'leisure',
  'travel',
  'gift',
  'pet',
  'clothes',
  'salary',
  'coins',
  'savings',
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  'gray',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'pink',
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

export const DEFAULT_CATEGORY_ICON: CategoryIcon = 'tag';
export const DEFAULT_CATEGORY_COLOR: CategoryColor = 'gray';

function isOneOf<T extends string>(list: readonly T[], key: string): key is T {
  return (list as readonly string[]).includes(key);
}

/** El ícono de una clave guardada, o el de por defecto si la app no la conoce. */
export function categoryIcon(key: string): CategoryIcon {
  return isOneOf(CATEGORY_ICONS, key) ? key : DEFAULT_CATEGORY_ICON;
}

/** El color de una clave guardada, o el de por defecto si la app no la conoce. */
export function categoryColor(key: string): CategoryColor {
  return isOneOf(CATEGORY_COLORS, key) ? key : DEFAULT_CATEGORY_COLOR;
}
