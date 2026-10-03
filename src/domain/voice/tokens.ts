// Separación de una frase en palabras (tokens) para el parser de voz (ADR 0015).

import { normalizeText } from '../search';

export interface Token {
  /** Tal como se dictó, sin signos de puntuación en los bordes: "Súper". */
  raw: string;
  /** Sin acentos ni mayúsculas, para comparar: "super". */
  norm: string;
}

const EDGE_PUNCTUATION = /^[¿¡!?.,;:"'()«»]+|[¿¡!?.,;:"'()«»]+$/g;

export function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map((word) => word.replace(EDGE_PUNCTUATION, ''))
    .filter((raw) => raw !== '')
    .map((raw) => ({ raw, norm: normalizeText(raw) }));
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
