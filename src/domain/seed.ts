// Categorías iniciales con IDs fijos (SRS 4.7, ADR 0004).
// Solo los datos: la escritura, dentro de una runTransaction, va en src/data/ (Fase 2).
// Las claves de ícono y color salen de las listas fijas de categoryStyle.ts (ADR 0020).

import type { Category } from './model';

export type SeedCategory = Pick<Category, 'id' | 'name' | 'type' | 'icon' | 'color'>;

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { id: 'seed_comida', name: 'Comida', type: 'expense', icon: 'food', color: 'orange' },
  { id: 'seed_transporte', name: 'Transporte', type: 'expense', icon: 'transport', color: 'blue' },
  { id: 'seed_servicios', name: 'Servicios', type: 'expense', icon: 'bolt', color: 'yellow' },
  { id: 'seed_ocio', name: 'Ocio', type: 'expense', icon: 'leisure', color: 'purple' },
  { id: 'seed_salario', name: 'Salario', type: 'income', icon: 'salary', color: 'green' },
  {
    id: 'seed_otros_ingresos',
    name: 'Otros Ingresos',
    type: 'income',
    icon: 'coins',
    color: 'teal',
  },
];
