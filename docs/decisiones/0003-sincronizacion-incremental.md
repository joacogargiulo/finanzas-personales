# ADR 0003 — Sincronización incremental para leer poco

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 1
- **Modifica:** SRS 3.2 (flujo de datos), 4 (`updatedAt`) y 4.3 (borrado físico de transacciones)

## Contexto
El proyecto usa el plan **Spark** de Firebase: 50.000 lecturas de documentos por día **para todos los usuarios juntos**.

Firestore cobra 1 lectura por cada documento que devuelve el servidor (leer de la caché local es gratis) y como mínimo 1 por consulta. Mientras un listener (`onSnapshot`) está conectado, solo se paga lo que cambia. Pero **si estuvo desconectado más de unos 30 minutos, al volver se cobra la consulta completa otra vez**, aunque los datos ya estén en la caché.

El SRS asume que se escucha la colección completa de transacciones. Con 10.000 movimientos y 5 aperturas por día (separadas por más de 30 minutos), un solo usuario gasta unas 50.000 lecturas por día, es decir, toda la cuota. Calculadora usada para decidir: https://claude.ai/artifact/MLuZz3oAy6oJCA2RhTC9nF

## Opciones consideradas
1. **Escuchar todo** (lo que asume el SRS). Es simple, pero no escala: no entra ni un usuario con muchos datos.
2. **Escuchar una ventana de fechas y guardar saldos o cierres mensuales.** Lee poco, pero vuelve a guardar saldos (va contra la regla 2 de CLAUDE.md, porque un cierre puede desfasarse). Además, el historial y las estadísticas largas necesitan consultas extra.
3. **Sincronización incremental.** Se lee todo de la caché local y solo se le pide al servidor lo que cambió desde la última sincronización.

## Decisión
Se adopta la opción 3, y se aplica a **todas las colecciones del usuario** con un único mecanismo.

1. **Al abrir la app:** se cargan los documentos desde la caché (`getDocsFromCache`), lo que es gratis e instantáneo. Después se abre un listener con `where('updatedAt', '>', cursor)`.
2. **El cursor** es el `updatedAt` más alto ya confirmado por el servidor que hay en la caché, menos un **margen de solapamiento** de algunos minutos. El margen cubre escrituras que el servidor confirma un instante después de su marca de tiempo; volver a leer unos pocos documentos es barato y no duplica nada, porque se identifican por ID. El cursor se obtiene de la caché y no se guarda aparte: si la caché se borra, no queda un cursor viejo apuntando a datos que ya no están.
3. **Sin caché** (primer inicio de sesión en un dispositivo, o después de cerrar sesión): no hay cursor, así que se descarga todo una vez.
4. **`updatedAt` usa la hora del servidor** (`serverTimestamp()`), no `Date.now()`. Si el reloj de un dispositivo está atrasado, el otro nunca vería sus cambios. Las reglas exigen `updatedAt == request.time`. Mientras una escritura está pendiente, la UI usa el valor estimado (`serverTimestamps: 'estimate'`).
5. **`createdAt` sigue siendo la hora del cliente** (milisegundos epoch). Sirve para ordenar y no para sincronizar.
6. **Caché sin límite de tamaño** (`cacheSizeBytes: CACHE_SIZE_UNLIMITED`). Con el límite por defecto (40 MB), Firestore podría sacar de la caché documentos que no están en ningún listener activo, y la app los perdería.
7. **Lápidas:** ningún documento del usuario se borra físicamente en el uso normal. Borrar es marcar `deletedAt`. Si un documento desapareciera, la consulta "¿qué cambió?" nunca lo devolvería y el otro dispositivo lo seguiría mostrando. Para el usuario, un movimiento borrado desaparece igual. Excepción: "Borrar mi cuenta", que sí borra todo físicamente.

## Consecuencias
- **Cambia el SRS 4.3:** las transacciones también usan `deletedAt`. El borrado lógico es un detalle interno; en la interfaz se sigue llamando "eliminar".
- **Cambia el SRS 4:** `updatedAt` pasa a ser un *timestamp* de Firestore generado por el servidor (antes eran milisegundos del cliente).
- **Costo estimado por apertura:** unas pocas lecturas (como mínimo 1 por colección) más lo que haya cambiado. Con los números de ejemplo, entran unos 1.300 usuarios en la cuota, contra ninguno con la opción 1.
- **Costo de un dispositivo nuevo:** se descarga todo una vez (por ejemplo, 10.000 lecturas). Se acepta porque es raro.
- Las lápidas ocupan espacio para siempre. Con 1 GiB gratis y documentos de menos de 1 KB, no es un problema; si algún día lo fuera, se puede agregar una limpieza de lápidas viejas.
- El código de sincronización vive en `src/data/` y es más complejo que un `onSnapshot` simple: se testea contra el emulador (Fase 2).
- El ciclo de vida de cada colección quedó en el ADR 0005, y "Borrar mi cuenta", en el ADR 0006.
