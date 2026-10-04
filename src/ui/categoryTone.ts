// Color de una categoría como variable CSS `--tone` (la usan `.badge` y `.chip`). El valor
// real depende del tema claro u oscuro (`--cat-*` en tokens.css, ADR 0020).

import type { CSSProperties } from 'react';
import { categoryColor } from '../domain/categoryStyle';

export function categoryTone(color: string): CSSProperties {
  return { '--tone': `var(--cat-${categoryColor(color)})` } as CSSProperties;
}
