# ADR 0022 — Pendientes de recurrentes y presupuestos en la interfaz

- **Estado:** aceptada
- **Fecha:** 2026-10-04
- **Fase:** 5a (presupuestos y recurrentes)
- **Modifica:** SRS 6.3, 6.6 y 6.7

## Contexto
El dominio, las escrituras y las reglas de presupuestos y recurrentes ya existían desde las fases 1 y 2. Faltaban la interfaz y la escritura de "confirmar" (SRS 5.10). Al armarla hubo que decidir:
- **Dónde van los pendientes en Inicio.** El SRS 6.3 los pone después del total y del resumen.
- **Cómo se abre el panel para confirmar un pendiente.** Los paneles se abren con la dirección (ADR 0018), pero la dirección solo lleva un ID, no los datos para precargar el formulario.
- **Qué puede cambiar el usuario al confirmar**, y si "Saltar" pide confirmación.
- **Cómo se elige un presupuesto** que ya existe (su ID es fijo, `{categoryId}_{currency}`).

## Alternativas
**Lugar de los pendientes**
1. El orden del SRS: total, resumen, pendientes, presupuestos, cuentas.
2. **Arriba de todo**, junto a los avisos, porque son lo único de Inicio que pide una acción.

**Panel para confirmar**
1. Guardar los datos precargados en el estado de React, fuera de la dirección. Se pierden al recargar y Atrás no los cierra.
2. **Un tipo de panel propio, `pendiente=`, cuyo valor es el ID fijo del movimiento a crear** (`rec_{recurrente}_{fecha}`, ADR 0004). De ese ID salen el recurrente y la fecha; los datos se arman desde el store.

## Decisión
- **Los pendientes van arriba de todo** (decisión del dueño). La tarjeta aparece solo si hay pendientes, con una fila por ocurrencia (fecha, descripción, cuenta y monto) y los botones **Saltar** y **Confirmar**.
- **Rutas nuevas** (ADR 0018): `presupuesto=nuevo|<id>`, `recurrente=nuevo|<id>` y `pendiente=<rec_…>`. `parseOccurrenceId` (dominio, con tests) es la inversa de `recurringTransactionId`.
- **Confirmar** abre el panel de movimiento precargado con la ocurrencia (`occurrenceDraft`), con el título "Confirmar recurrente" y **sin selector de tipo**: el usuario ajusta el monto, la fecha, la descripción, la cuenta o la categoría. Si la ocurrencia ya no está pendiente (otro dispositivo la confirmó) o su cuenta o categoría están archivadas, el panel se cierra.
- **Saltar pide una confirmación simple**: no carga el movimiento y no se puede deshacer desde la app.
- **Pendiente con cuenta o categoría archivada** (ADR 0009): la fila muestra "La cuenta X está archivada." y cambia Confirmar por **Editar recurrente**.
- **Presupuestos del mes** va después del resumen del mes: una barra por presupuesto con el porcentaje en texto y, si se pasó, "Te pasaste por $ X". El color (verde, amarillo, rojo) nunca es la única señal (SRS 10).
- **Presupuesto nuevo:** se eligen una categoría de gasto activa, la moneda (solo las que tienen cuentas activas) y el límite. Si esa combinación ya existe, el panel lo avisa y al guardar edita la existente (o revive una eliminada). Al editar, solo cambia el límite: categoría y moneda forman el ID.
- **Recurrente:** su propio panel con tipo (Gasto, Ingreso, Transferir), monto, categoría, cuentas, descripción, frecuencia, primera vez y fecha de fin opcional. Si al editar cambia el calendario, el panel aclara que lo ya confirmado no se repite.
- **El monto en los paneles de presupuesto y recurrente es un campo de texto**, como el saldo inicial de una cuenta. El teclado propio queda para cargar movimientos, que es lo que se hace todos los días.

## Consecuencias
- El panel de movimiento acepta datos iniciales (`initial`), que también va a usar el dictado (Fase 5b).
- Los chips de categoría pasan a un componente compartido (`CategoryChips`).
- Tests: rutas, componentes (paneles y tarjetas, incluido TC-15) y dos flujos e2e (confirmar un recurrente; presupuesto al 85 %).
- La escritura de confirmar y el caso de dos dispositivos (TC-14) quedan en la nota de la Fase 5 del ADR 0004.
