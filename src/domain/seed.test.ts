import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from './seed';
import { CATEGORY_NAME_MAX } from './validation';

describe('SEED_CATEGORIES (SRS 4.7)', () => {
  // Los IDs fijos son los del SRS: si cambiaran, dos dispositivos podrían sembrar duplicados.
  it('tiene los IDs del SRS', () => {
    expect(SEED_CATEGORIES.map((c) => c.id)).toEqual([
      'seed_comida',
      'seed_transporte',
      'seed_servicios',
      'seed_ocio',
      'seed_salario',
      'seed_otros_ingresos',
    ]);
  });

  // Las mismas restricciones que valida Firestore: claves en minúsculas y nombres cortos.
  it.each(SEED_CATEGORIES)('$id cumple el formato', (category) => {
    expect(category.icon).toMatch(/^[a-z0-9-]{1,30}$/);
    expect(category.color).toMatch(/^[a-z0-9-]{1,30}$/);
    expect(category.name.length).toBeLessThanOrEqual(CATEGORY_NAME_MAX);
  });
});
