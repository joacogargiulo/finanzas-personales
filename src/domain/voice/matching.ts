// Búsqueda de cuentas y categorías del usuario dentro de una frase (ADR 0015).

import { normalizeText } from '../search';
import { STOPWORDS } from './tokens';

interface Named {
  id: string;
  name: string;
}

export interface NameMatch<T> {
  item: T;
  start: number;
  end: number;
}

/** Sin acentos, mayúsculas, espacios ni símbolos: "Mercado Pago" → "mercadopago". */
export function compact(text: string): string {
  return normalizeText(text).replace(/[^a-z0-9]/g, '');
}

/** Palabras de un nombre que sirven para reconocerlo solas ("Tarjeta de Crédito" → tarjeta, credito). */
function keywords(name: string): string[] {
  return normalizeText(name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
}

const MAX_SPAN = 6;

/**
 * Encuentra los elementos nombrados en la frase, sin superponerse, ordenados por posición.
 * 1. Nombre completo, sin espacios ni acentos ("mercadopago" o "mercado pago" → "Mercado Pago").
 *    Los nombres más largos se buscan primero.
 * 2. Una palabra del nombre, si ningún otro elemento la tiene ("tarjeta" → "Tarjeta de Crédito",
 *    salvo que también exista "Tarjeta Visa").
 * Cada elemento aparece como mucho una vez.
 */
export function findNamed<T extends Named>(
  norms: readonly string[],
  used: readonly boolean[],
  items: readonly T[],
): NameMatch<T>[] {
  const taken = norms.map((_, i) => used[i] === true);
  const matches: NameMatch<T>[] = [];
  const matched = new Set<string>();
  const free = (start: number, end: number) => taken.slice(start, end).every((t) => !t);
  const take = (item: T, start: number, end: number) => {
    matches.push({ item, start, end });
    matched.add(item.id);
    taken.fill(true, start, end);
  };

  const byLength = [...items].sort((a, b) => compact(b.name).length - compact(a.name).length);
  for (const item of byLength) {
    const target = compact(item.name);
    if (target === '') continue;
    search: for (let start = 0; start < norms.length; start += 1) {
      for (let end = start + 1; end <= Math.min(norms.length, start + MAX_SPAN); end += 1) {
        if (!free(start, end)) break;
        const span = compact(norms.slice(start, end).join(''));
        if (span === target) {
          take(item, start, end);
          break search;
        }
        if (!target.startsWith(span)) break;
      }
    }
  }

  // Palabras que identifican a un solo elemento.
  const owners = new Map<string, Set<string>>();
  for (const item of items) {
    for (const word of keywords(item.name)) {
      const set = owners.get(word) ?? new Set<string>();
      set.add(item.id);
      owners.set(word, set);
    }
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  norms.forEach((token, i) => {
    if (taken[i]) return;
    const ids = owners.get(token);
    if (ids?.size !== 1) return;
    const [id] = ids;
    const item = id === undefined ? undefined : byId.get(id);
    if (item && !matched.has(item.id)) take(item, i, i + 1);
  });

  return matches.sort((a, b) => a.start - b.start);
}
