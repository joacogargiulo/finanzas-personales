import { describe, expect, it } from 'vitest';
import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  categoryColor,
  categoryIcon,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
} from './categoryStyle';
import { SEED_CATEGORIES } from './seed';

// Las claves de ícono y color se guardan en Firestore: la app tiene que tolerar las que no conoce.
describe('categoryIcon y categoryColor', () => {
  it('devuelven la clave si la conocen', () => {
    expect(categoryIcon('food')).toBe('food');
    expect(categoryColor('teal')).toBe('teal');
  });

  it('usan el valor por defecto con una clave desconocida', () => {
    expect(categoryIcon('cohete')).toBe(DEFAULT_CATEGORY_ICON);
    expect(categoryColor('dorado')).toBe(DEFAULT_CATEGORY_COLOR);
    expect(categoryIcon('')).toBe(DEFAULT_CATEGORY_ICON);
  });
});

// Las claves tienen que pasar la regla `isKey` de firestore.rules.
describe('listas fijas', () => {
  it('no tienen claves repetidas', () => {
    expect(new Set(CATEGORY_ICONS).size).toBe(CATEGORY_ICONS.length);
    expect(new Set(CATEGORY_COLORS).size).toBe(CATEGORY_COLORS.length);
  });

  it('son claves cortas en minúsculas', () => {
    for (const key of [...CATEGORY_ICONS, ...CATEGORY_COLORS]) {
      expect(key).toMatch(/^[a-z0-9-]{1,30}$/);
    }
  });

  it('incluyen los íconos y colores de las categorías iniciales', () => {
    for (const category of SEED_CATEGORIES) {
      expect(CATEGORY_ICONS).toContain(category.icon);
      expect(CATEGORY_COLORS).toContain(category.color);
    }
  });
});
