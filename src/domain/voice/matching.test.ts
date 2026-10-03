import { describe, expect, it } from 'vitest';
import { SEED_CATEGORIES } from '../seed';
import { compact, findNamed } from './matching';
import { CATEGORY_SYNONYMS, SYNONYM_INDEX } from './synonyms';
import { tokenize } from './tokens';

const items = [
  { id: 'cash', name: 'Efectivo' },
  { id: 'mp', name: 'Mercado Pago' },
  { id: 'card', name: 'Tarjeta de Crédito' },
  { id: 'galicia', name: 'Galicia' },
  { id: 'galiciausd', name: 'Galicia USD' },
];

function found(text: string, list = items) {
  const norms = tokenize(text).map((t) => t.norm);
  return findNamed(norms, [], list).map((m) => m.item.id);
}

describe('compact', () => {
  it('quita acentos, espacios y símbolos', () => {
    expect(compact('Tarjeta de Crédito')).toBe('tarjetadecredito');
  });
});

describe('findNamed', () => {
  // El nombre completo se reconoce aunque el dictado lo separe o lo junte distinto.
  it.each([
    ['con efectivo', ['cash']],
    ['con mercado pago', ['mp']],
    ['con mercadopago', ['mp']],
    ['con la tarjeta de credito', ['card']],
  ])('"%s" → %j', (text, ids) => {
    expect(found(text)).toEqual(ids);
  });

  // Los nombres más largos ganan: "Galicia USD" no se confunde con "Galicia".
  it('prefiere el nombre más largo', () => {
    expect(found('del galicia usd')).toEqual(['galiciausd']);
  });

  // Una palabra sola alcanza si nadie más la tiene...
  it('reconoce una palabra que identifica a un solo elemento', () => {
    expect(found('con la tarjeta')).toEqual(['card']);
  });

  // ...pero si es ambigua, no adivina.
  it('no adivina con una palabra ambigua', () => {
    const list = [...items, { id: 'visa', name: 'Tarjeta Visa' }];
    expect(found('con la tarjeta', list)).toEqual([]);
  });

  // Varios elementos en la frase, en el orden en que aparecen.
  it('encuentra varios en orden', () => {
    expect(found('de mercado pago a efectivo')).toEqual(['mp', 'cash']);
  });
});

describe('sinónimos', () => {
  // Cada lista apunta a una categoría inicial que existe, y ninguna palabra está en dos listas.
  it('apuntan a categorías iniciales, sin repetidos', () => {
    const seedIds = SEED_CATEGORIES.map((c) => c.id);
    expect(Object.keys(CATEGORY_SYNONYMS).every((id) => seedIds.includes(id))).toBe(true);
    const total = Object.values(CATEGORY_SYNONYMS).flat().length;
    expect(SYNONYM_INDEX.size).toBe(total);
  });

  it('están normalizados', () => {
    for (const word of SYNONYM_INDEX.keys()) expect(word).toMatch(/^[a-z]+$/);
  });
});
