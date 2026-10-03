# ADR 0007 — Tipos de datos: montos, fechas, monedas y forma de los documentos

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 3
- **Modifica:** SRS 4 (introducción: tipo de las marcas de tiempo) y 4.3 (campos según el tipo)

## Contexto
Hay que fijar cómo se representa cada clase de dato en Firestore y en TypeScript. Los errores más comunes en apps de finanzas vienen de acá: montos con decimales flotantes, fechas que cambian de día por la zona horaria y documentos con campos que no corresponden a su tipo.

## Decisión
1. **Montos: enteros en centavos** (`number` entero en TS, `int` en Firestore). El máximo, `999.999.999.999,99`, son unos 10¹⁴ centavos: entra con margen en el rango de enteros exactos de JavaScript (2⁵³ ≈ 9 × 10¹⁵). El SDK guarda un `number` sin decimales como entero, y las reglas exigen `is int`. Las cotizaciones (`localStorage`) siguen siendo decimales, porque no son montos.
2. **Fechas calendario** (`date`, `startDate`, `nextDate` y `endDate`): texto `YYYY-MM-DD`. Un día del calendario no tiene hora ni zona horaria. Guardado como *timestamp*, las 23:30 de Argentina ya serían el día siguiente en UTC. Además, el texto se ordena igual que la fecha y permite consultas por rango.
3. **Instantes:**
   - `updatedAt`: *timestamp* del servidor (lo exige la sincronización, ADR 0003).
   - `createdAt`, `archivedAt` y `deletedAt`: milisegundos epoch del dispositivo (`Date.now()`). Son informativos y no sincronizan nada.
4. **Monedas:** código ISO 4217 como texto (`'ARS' | 'USD' | 'EUR'`). Sumar una moneda solo requiere ampliar el tipo y la lista de las reglas.
5. **Uniones discriminadas, sin campos `null` "que no corresponden":** en un documento solo existen los campos de su tipo. Por ejemplo, un gasto no tiene `toAccountId` (el campo no está, no vale `null`). En TypeScript se modela como una unión discriminada por `type`, y en las reglas cada tipo tiene su lista exacta de campos. `null` se reserva para campos que siempre existen y a veces están vacíos (`archivedAt`, `deletedAt`, `endDate`).

## Consecuencias
- El compilador impide leer `toAmount` en un movimiento que no es un cambio de moneda.
- Al cambiar el tipo de un movimiento en la edición, la escritura tiene que **quitar** los campos que dejan de aplicar (`deleteField()`), además de cargar los nuevos. Esto corresponde al SRS 6.7: "al cambiar el tipo, se limpian los campos que dejan de aplicar".
- Con valores reales, las sumas de saldos no se acercan al límite de los enteros exactos. Igual, el dominio controla que cada monto esté dentro del máximo.
