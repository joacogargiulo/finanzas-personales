# ADR 0005 — Archivar (`archivedAt`) y eliminar (`deletedAt`) son cosas distintas

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 2
- **Modifica:** SRS 4.1, 4.2, 4.4, 4.5, 5.5, 5.6 y 6.6 (el `deletedAt` del SRS pasa a llamarse `archivedAt` en cuentas y categorías)

## Contexto
El SRS usa `deletedAt` para "archivar" cuentas, categorías y recurrentes. El ADR 0003 agregó las **lápidas**: ningún documento se borra físicamente y "eliminar" es marcar `deletedAt`. Así, el mismo campo tendría dos significados:

- **Archivar:** "ya no lo uso, pero es parte de mi historia". Desaparece de los selectores, sigue en el historial y las estadísticas y se puede restaurar.
- **Lápida:** "esto no existe más". Es invisible en toda la app y solo sirve para avisarle del borrado al otro dispositivo.

## Opciones consideradas
1. **Un solo campo `deletedAt`** cuyo significado depende de la colección. Es más simple, pero confuso al programar y al leer los datos.
2. **Dos campos:** `archivedAt` (archivar) y `deletedAt` (lápida).

## Decisión
Se adopta la opción 2.

| Colección | Archivar (`archivedAt`) | Eliminar (lápida `deletedAt`) |
|---|---|---|
| Cuentas | Sí, solo con saldo 0 (SRS 5.5) | Solo si ningún movimiento, presupuesto ni recurrente la usa |
| Categorías | Sí, siempre (SRS 5.6) | Solo si ningún movimiento, presupuesto ni recurrente la usa |
| Movimientos | — | Sí, con confirmación |
| Presupuestos | — | Sí. Con su ID fijo, se revive al volver a crearlo (ADR 0004) |
| Recurrentes | — | Sí. Los movimientos que ya generó quedan intactos |
| Perfil del usuario | — | Nunca; solo con "Borrar mi cuenta" (ADR 0006) |

- Los dos campos valen `null` o un *timestamp*. Una lápida no se "des-elimina" desde la interfaz; un archivado sí se restaura.
- "¿Se usa?" se comprueba en el dominio con los datos que están en el dispositivo (ADR 0003), sin costo de lecturas.
- **Restaurar con nombre repetido:** si ya existe una cuenta o categoría activa con el mismo nombre, no se restaura directamente. El mismo diálogo pide un nombre nuevo (*"Ya tenés una cuenta activa llamada Efectivo. Elegí otro nombre para restaurarla."*).
- **Unicidad de nombres "lo mejor posible":** la app evita los duplicados en todo lo que depende de ella. Dos dispositivos sin conexión igual pueden crear el mismo nombre a la vez, y las reglas de Firestore no pueden impedirlo sin un costo grande. Si pasa, se muestran los dos y el usuario renombra uno.

## Consecuencias
- Los recurrentes ya no se "archivan": se eliminan (lápida). Pausar un recurrente puede sumarse más adelante como función.
- Si una cuenta se elimina en un dispositivo mientras otro, sin conexión, le carga un movimiento, no se rompe nada: la lápida conserva el nombre y el historial muestra "Efectivo (eliminada)".
- Toda consulta del dominio filtra las lápidas. Las listas de selección filtran además lo archivado.
- La interfaz suma la acción "Eliminar" para cuentas y categorías sin uso, además de "Archivar".
