// Separación de una frase en palabras (tokens) para el parser de voz (ADR 0015).

import { normalizeText } from '../search';

export interface Token {
  /** Tal como se dictó, sin signos de puntuación en los bordes: "Súper". */
  raw: string;
  /** Sin acentos ni mayúsculas, para comparar: "super". */
  norm: string;
}

const EDGE_PUNCTUATION = /^[¿¡!?.,;:"'()«»]+|[¿¡!?.,;:"'()«»]+$/g;

/** El comienzo de un número con miles: "50", "$50", "1.500" (hasta 3 cifras por grupo). */
const THOUSANDS_HEAD = /^(\$|us\$|u\$s|€)?\d{1,3}(\.\d{3})*$/i;
/** Un grupo de miles que sigue, con centavos opcionales: "000", "500,50". */
const THOUSANDS_GROUP = /^\d{3}(,\d{1,2})?$/;

/**
 * El dictado de Chrome escribe los miles separados por un espacio: "$50 000", "1 500 000".
 * Se juntan en un solo número con punto de miles ("$50.000"), como si se hubiera escrito así.
 */
function joinThousands(words: readonly string[]): string[] {
  const joined: string[] = [];
  for (const word of words) {
    const last = joined.at(-1);
    if (last !== undefined && THOUSANDS_HEAD.test(last) && THOUSANDS_GROUP.test(word)) {
      joined[joined.length - 1] = `${last}.${word}`;
    } else {
      joined.push(word);
    }
  }
  return joined;
}

export function tokenize(text: string): Token[] {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((raw) => raw !== '');
  return joinThousands(words).map((raw) => ({ raw, norm: normalizeText(raw) }));
}

/** Artículos, preposiciones y otras palabras que no aportan a la descripción. */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'desde',
  'el',
  'en',
  'hacia',
  'la',
  'las',
  'lo',
  'los',
  'me',
  'mi',
  'mis',
  'para',
  'por',
  'que',
  'un',
  'una',
  'unos',
  'unas',
  'y',
]);
