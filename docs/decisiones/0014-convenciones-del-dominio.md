# ADR 0014 — Convenciones del dominio: errores, aritmética de montos y fechas

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 1 (dominio)

## Contexto
`src/domain/` concentra todas las reglas de negocio. Lo van a usar la UI (Fase 3), el parser de voz (Fase 1b) y, más adelante, un Worker de Cloudflare para WhatsApp (Fase 11). Antes de escribir los módulos hay que fijar tres cosas que se repiten en todos:
1. Cómo avisa una función que algo está mal (un monto inválido, una cuenta archivada).
2. Cómo se hacen las cuentas con montos sin perder precisión (CLAUDE.md, regla 1).
3. Cómo se opera con fechas `YYYY-MM-DD` sin que la zona horaria cambie el día (SRS 5.11).

## Alternativas
**Errores**
1. **Lanzar excepciones** (`throw new Error('Monto inválido')`): es lo habitual en JavaScript, pero el tipo de la función no dice que puede fallar, y es fácil olvidarse del `try/catch`.
2. **Devolver un resultado** `Result<T, E>`: `{ ok: true, value }` o `{ ok: false, error }`. TypeScript obliga a mirar `ok` antes de usar `value`.

**Texto del error**
1. Mensaje en español escrito en cada función.
2. **Código** (`'amount.tooManyDecimals'`) con sus datos, más una sola función que lo traduce a español.

**Multiplicar centavos por una cotización** (`1345.5`)
1. `Math.round(cents * rate)`: multiplica un entero por un decimal en punto flotante; con montos grandes puede perder precisión.
2. **`BigInt`**: la cotización se pasa a un entero escalado (millonésimas) y se multiplica y divide con enteros de precisión ilimitada, con redondeo explícito.

## Decisión
- **`Result` para los errores esperables** (datos que escribe el usuario, reglas de negocio). Las excepciones quedan para errores de programación (llamar una función con un dato que nunca debería llegar).
- **Errores como códigos** (`DomainError`, en `errors.ts`) y `errorMessage(error)` los traduce al español rioplatense. La UI, la voz y WhatsApp muestran los mismos textos, y los tests comparan códigos, no frases.
- **Montos:**
  - Se suman como `number` enteros, que son exactos hasta `Number.MAX_SAFE_INTEGER` (unos 90 billones de pesos).
  - El texto se convierte a centavos separando la parte entera y la decimal como texto, con `BigInt`, sin punto flotante.
  - Los productos por una cotización y la cotización implícita se calculan con `BigInt` y se redondean "al más cercano" (la mitad se aleja del cero).
  - `formatAmount` arma `$ 1.234,56` con operaciones de texto, sin dividir por 100. Si recibe un número que ya no es un entero seguro (una suma irreal que se pasó del máximo), devuelve el texto *"monto fuera de rango"* en vez de un número incorrecto, y la app no se rompe.
- **Fechas:**
  - Se guardan y comparan como texto `YYYY-MM-DD`. El orden alfabético coincide con el cronológico.
  - Para sumar días o meses se usan sus componentes y `Date.UTC`, que no tiene horario de verano.
  - "Hoy" sale de `getFullYear/getMonth/getDate` de un `Date` que se recibe como parámetro, así se puede testear.
  - Los tests corren con `TZ=America/Argentina/Buenos_Aires`, así dan lo mismo en la compu del dueño y en el CI, que corre en UTC.
- **Colecciones:** las funciones reciben arrays con todos los documentos, filtran las lápidas (`deletedAt`) y toleran referencias a documentos que no existen (SRS 5.3).

## Consecuencias
- Cada función que puede fallar tiene un tipo de retorno explícito; la UI decide cómo mostrar el error.
- Agregar un error nuevo exige agregar su mensaje: `errorMessage` usa un `switch` exhaustivo y TypeScript avisa si falta un caso.
- Los montos negativos (saldos) se muestran con el signo menos tipográfico: `− $ 1.234,56`.
