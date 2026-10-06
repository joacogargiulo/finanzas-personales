# ADR 0015 — Parser de frases para la carga por voz

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 1b (dominio)

## Contexto
La app va a permitir dictar un movimiento ("gasté dieciocho mil en el súper con efectivo"). El micrófono (Web Speech API) llega en la Fase 5. Antes hace falta convertir el texto dictado en los campos del formulario. Más adelante, el mismo código va a interpretar los mensajes de WhatsApp (Fase 11), y si no alcanza, se le va a pedir ayuda a una IA (Fase 10).

## Alternativas
1. **Reglas propias** (diccionarios de verbos, números en palabras y sinónimos): funcionan sin conexión, son gratis e instantáneas y se pueden testear. A cambio, no entienden frases que no se previeron.
2. **Un modelo de IA desde el principio**: entiende más variantes, pero necesita conexión y un servidor, tiene costo y no da siempre el mismo resultado.

## Decisión
Se adopta la opción 1, en `src/domain/voice/`. La IA queda como respaldo en la Fase 10, como se acordó en el plan.

*Nota (ADR 0029):* el dueño pidió que, con conexión, la IA se use siempre y no solo como respaldo; el parser queda para cuando no hay conexión. Se decide en detalle en la Fase 10.

*Nota (ADR 0031):* la IA devuelve el mismo `ParsedPhrase`, ampliado con el tipo `exchange` y `toAmount`. El cálculo de `missing` pasó a `missingFields`, que comparten el parser y la IA.

- **Siempre precarga, nunca guarda.** El resultado completa el formulario y el usuario confirma. Si un campo no se entendió, queda vacío y figura en `missing`.
- **Entiende:**
  - Tipo por el verbo: gasté, pagué o me cobraron → gasto; cobré o me pagaron → ingreso; transferí o pasé → transferencia.
  - Montos en cifras ("18.000", "$ 2.500,50", "5k"; también "$50 000", con los miles separados por espacios, como los escribe el dictado de Chrome) o en palabras ("dieciocho mil", "un millón doscientos mil", "dos lucas", "un palo y medio", "mil con cincuenta").
  - Fechas relativas: hoy, ayer, anteayer, "el lunes", "el 5", "el 5 de octubre" y "5/10". Siempre se interpreta la fecha pasada más cercana.
  - Cuentas y categorías del usuario por su nombre, sin acentos ni espacios.
  - Sinónimos para las categorías iniciales (súper → Comida, nafta → Transporte).
- **Si hay varios números, el monto es el más grande**: en "2 cafés 3000", el monto es 3000. Los números que forman parte de una fecha no cuentan.
- **Cuenta implícita:**
  - Si se nombra una moneda ("50 dólares") y hay una sola cuenta activa en esa moneda, se elige esa.
  - Si no se nombra cuenta y el usuario tiene una sola cuenta activa, se elige esa.
- **Los cambios de moneda quedan afuera** ("compré 100 dólares"): necesitan dos montos y dos cuentas, y es fácil entenderlos mal. Se marcan con `unsupported: 'exchange'` y el tipo queda vacío.
- **Descripción:** las palabras que sobran, sin artículos ni preposiciones en los bordes. Conserva los acentos de lo que se dictó ("Súper").

## Consecuencias
- El parser no conoce el micrófono ni WhatsApp: recibe texto y las cuentas y categorías. Sirve igual para la Fase 5, la 10 y la 11.
- Una frase nueva que no se entiende se arregla sumando un caso a los tests y la palabra al diccionario.
- `missing` le sirve a la Fase 10 para decidir cuándo pedirle ayuda a la IA.

## Nota (issue #22): dos categorías en la frase
Si la frase nombra dos o más categorías distintas, por nombre o por sinónimo ("comida para la Nala"), el parser no elige ninguna: la categoría queda en `missing` y el panel la marca con "No se entendió, revisalo", sin preseleccionar (decisión del dueño). El tipo se deduce igual si todas las candidatas son del mismo tipo. Dos palabras de la misma categoría ("cena en el súper") no son una duda.

## Nota (ADR 0031): miles con coma
En Android, el dictado de Chrome a veces escribe los miles con coma ("$38,700"). Una coma seguida de exactamente 3 cifras se toma como separador de miles: los centavos tienen 1 o 2 cifras, así que no hay ambigüedad. "1,5" sigue siendo 1 con 50 centavos.
