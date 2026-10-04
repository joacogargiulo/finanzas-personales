// Ancho real de un elemento en píxeles, para dibujar el SVG al tamaño justo (así el texto no se
// estira ni se achica). Se actualiza cuando cambia el tamaño de la ventana o del contenedor.

import { useLayoutEffect, useRef, useState } from 'react';

/** Ancho que se usa antes de medir, o donde no hay `ResizeObserver` (por ejemplo, jsdom). */
const FALLBACK_WIDTH = 320;

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, width };
}
