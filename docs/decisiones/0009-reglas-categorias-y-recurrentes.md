# ADR 0009 — Cambio de tipo de categoría y edición de recurrentes

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 3
- **Modifica:** SRS 4.2 (cambio de tipo), 5.6 y 5.10

## Contexto
El SRS deja tres casos sin resolver:
- Si se puede cambiar el tipo de una categoría que usa un presupuesto o un recurrente.
- Qué pasa con `nextDate` al editar la frecuencia o `startDate` de un recurrente.
- Qué pasa con un recurrente cuya cuenta o categoría se archiva.

## Decisión
1. **Cambio de tipo de categoría:** se bloquea si la usa algún movimiento, presupuesto o recurrente no eliminado. Un presupuesto solo tiene sentido en una categoría de gasto.
2. **Editar la frecuencia o `startDate` de un recurrente:** el nuevo `nextDate` es la **primera fecha del calendario nuevo que sea ≥ al `nextDate` anterior y ≥ al nuevo `startDate`**. Todo lo anterior a `nextDate` ya fue confirmado o saltado, así que no se repite. Esto evita que una ocurrencia ya confirmada vuelva a quedar pendiente y, al confirmarla, pise el movimiento existente, que tiene el mismo ID fijo (ADR 0004). Si el nuevo `nextDate` supera `endDate`, el recurrente queda finalizado.
3. **Editar el monto, las cuentas, la categoría o la descripción** no toca `nextDate`.
4. **Archivar una cuenta o categoría que usa un recurrente activo:** se advierte al archivar. Los pendientes con una cuenta o categoría archivada **no se pueden confirmar**: se muestra *"La cuenta Efectivo está archivada"* con dos botones, "Editar recurrente" y "Saltar". Eliminar una cuenta o categoría que usa un recurrente no es posible (ADR 0005).

## Consecuencias
- Toda esta lógica vive en `src/domain/` (cálculo de ocurrencias y validaciones) y tiene tests en la Fase 1. Casos a cubrir: el cambio de frecuencia con un pendiente ya confirmado y el `startDate` movido hacia atrás y hacia adelante.
- La validación de transacciones (SRS 5.3) se aplica también al confirmar un pendiente.
