# ADR 0004 — IDs de documentos, siembra y forma de escribir

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 2
- **Modifica:** SRS 4.8 (siembra) y 5.10 (cálculo de `nextDate` al confirmar)

## Contexto
La app escribe sin conexión desde varios dispositivos. Cuando dos dispositivos modifican el mismo documento, Firestore aplica **"la última escritura gana"**: no mezcla los cambios, se queda con el último que llega al servidor. Hay que decidir cómo se eligen los IDs para no crear duplicados, cómo sembrar las categorías iniciales sin pisar datos del usuario y cómo escribir las ediciones para perder lo menos posible en un conflicto.

## Opciones consideradas
- **IDs:** aleatorios generados en el cliente (`doc(collection(...)).id`) o fijos, armados con datos del documento.
- **Siembra:** `set()` directo con IDs fijos (lo que dice el SRS), `runTransaction` que primero comprueba si ya se sembró, elegir las categorías en el onboarding o no sembrar.
- **Ediciones:** `set()` del documento completo o `update()` solo con los campos que cambiaron.

## Decisión
1. **IDs aleatorios generados en el cliente** para todo lo que crea el usuario: cuentas, categorías propias, movimientos y recurrentes. Funcionan sin conexión y no chocan entre sí.
2. **IDs fijos** solo donde "lo mismo" puede crearse desde dos dispositivos:
   - **Presupuestos:** `{categoryId}_{currency}`. Si dos dispositivos lo escriben, gana el último límite. Un presupuesto eliminado (lápida) se revive al volver a crearlo.
   - **Ocurrencias de recurrentes:** `rec_{recurringId}_{fechaDeOcurrencia}`. La fecha del ID es siempre la **de la ocurrencia**, aunque el usuario cambie la fecha del movimiento al confirmarlo.
   - **Categorías iniciales:** `seed_comida`, `seed_transporte`, `seed_servicios`, `seed_ocio`, `seed_salario` y `seed_otros_ingresos`.
3. **`nextDate` idempotente:** al confirmar o saltar una ocurrencia, `nextDate` pasa a ser *la ocurrencia siguiente a la confirmada*, no "la siguiente al `nextDate` actual". Si dos dispositivos confirman la misma, escriben el mismo valor. Idempotente quiere decir que repetir la operación da el mismo resultado que hacerla una vez.
4. **Siembra automática dentro de `runTransaction`:** se lee el perfil del usuario. Si tiene `seededAt`, no se hace nada; si no, se crean las 6 categorías del SRS y se marca `seededAt`. Así un segundo dispositivo nunca pisa una categoría que el usuario ya renombró o archivó. La transacción necesita conexión, y el primer inicio de sesión siempre la tiene. Si falla, se reintenta en la próxima apertura con conexión.
5. **Las ediciones usan `update()` solo con los campos que cambiaron.** `set()` queda para crear documentos nuevos. Así, dos ediciones de campos distintos hechas en dos dispositivos se conservan las dos.

## Consecuencias
- TC-14 (confirmar el mismo recurrente en dos dispositivos) da una sola transacción y un solo avance de `nextDate`.
- En un conflicto sobre el mismo campo (por ejemplo, el mismo presupuesto con límites distintos), gana el último. Se acepta: es raro y no rompe ningún saldo.
- Caso borde aceptado: si un dispositivo confirma una ocurrencia, el usuario elimina ese movimiento y otro dispositivo sin conexión confirma la misma ocurrencia más tarde, el movimiento reaparece. Es poco probable y se arregla eliminándolo otra vez.
- El documento de perfil (dónde vive `seededAt`) se define en el bloque 3.
