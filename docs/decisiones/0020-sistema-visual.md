# ADR 0020 — Sistema visual: tokens, temas, fuentes, íconos y alcance de la Fase 3

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 3 (paridad con la app actual)
- **Completa:** ADR 0001 · **Modifica:** SRS 12

## Contexto
El ADR 0001 eligió la dirección visual "Sereno" (colores, tipografías, navegación). Al construirla hubo que decidir detalles que el ADR no fijaba: cómo se definen los colores y el tema, de dónde salen las fuentes y los íconos, qué íconos y colores puede tener una categoría, y si el tipo "Cambio" entra ya o en la Fase 5.

## Alternativas
**Fuentes**
1. Google Fonts por `<link>`: simple, pero sin conexión las fuentes no cargan y la app se ve distinta.
2. **Fuentes locales con `@fontsource`**: los archivos vienen con la app y funcionan offline.

**Íconos**
1. Una librería de íconos (lucide-react, etc.): agrega una dependencia y muchos íconos que no se usan.
2. **SVG propios en un componente `Icon`**: solo los necesarios, con el mismo trazo y sin dependencias.

**Tipo "Cambio"**
1. Dejarlo para la Fase 5, como dice el SRS 12.
2. **Adelantarlo a la Fase 3**: el dominio ya lo soporta y el diseño lo muestra como cuarta pestaña del panel.

## Decisión
- **Tokens CSS** en `src/ui/styles/tokens.css`, con los valores del lienzo de diseño. CSS plano, sin Tailwind (ADR 0001).
- **Tema claro, oscuro o automático.** Automático (el valor por defecto) sigue al sistema con `prefers-color-scheme`. Elegido a mano, se guarda `data-theme` en `<html>`. La preferencia es de cada dispositivo y usuario (`localStorage`, SRS 4.8) y se cambia en Ajustes → Apariencia.
- **Fuentes locales**: DM Sans (400, 500, 600 y 700) y DM Mono (400 y 500), solo el subconjunto latino.
- **Íconos SVG propios** (`src/ui/components/Icon.tsx`), de trazo y con `aria-hidden`: el texto o el `aria-label` va en el botón.
- **Listas fijas de íconos y colores de categoría** en `src/domain/categoryStyle.ts`:
  - Íconos: `tag`, `food`, `cart`, `transport`, `car`, `home`, `bolt`, `phone`, `health`, `education`, `leisure`, `travel`, `gift`, `pet`, `clothes`, `salary`, `coins` y `savings`.
  - Colores: `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple` y `pink`. Cada uno tiene un valor por tema (`--cat-*`).
  - Una clave desconocida se muestra con `tag` / `gray` (SRS 4.3). Todas cumplen la regla `isKey` de `firestore.rules`.
- **El tipo "Cambio" se adelanta a la Fase 3** (decisión del dueño). La Fase 5 queda con presupuestos y recurrentes.
- **El teclado numérico** arma el monto como texto (`src/domain/amountInput.ts`): no deja escribir un segundo separador, más de 2 decimales ni más de 12 dígitos enteros. Al guardar, el texto pasa por `parseAmount` (SRS 5.1). En la compu también se puede escribir con el teclado físico (punto o coma).

## Consecuencias
- La app se ve igual con y sin conexión. Las fuentes suman unos 100 KB, que el service worker va a cachear (Fase 7).
- Agregar un ícono o un color de categoría es sumar la clave a la lista, su dibujo en `Icon.tsx` o su color en `tokens.css`, y nada más.
- El SRS sube a la versión 3.3.0: la Fase 3 incluye el tipo Cambio.
