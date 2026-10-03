# ADR 0016 — Sincronización con dos listeners: uno al servidor y otro a la caché

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 2 (datos y login)
- **Modifica:** ADR 0003 (punto 1) y SRS 3.2

## Contexto
El ADR 0003 decide que cada colección se lee de la caché y que después se abre un listener `where('updatedAt', '>', cursor)` que alimenta la interfaz.

Al revisar el SDK de Firestore (`FieldFilter.matches`) apareció un problema. Mientras una escritura está pendiente, el campo `updatedAt` guarda un `serverTimestamp()` **todavía sin resolver**. El SDK solo compara valores del mismo tipo, y un timestamp pendiente es de otro tipo que un timestamp común. Por eso **el documento no cumple el filtro `>`** hasta que el servidor confirma la escritura. Si ese listener alimentara la interfaz:
- Un gasto cargado sin conexión **no aparecería** hasta volver a tener conexión.
- Un movimiento editado **desaparecería** de la lista mientras la edición está pendiente.

Eso rompe el funcionamiento sin conexión, que es el corazón de la app.

## Alternativas
1. **Actualizar el store "a mano" después de cada escritura** (actualización optimista). Funciona, pero duplica la lógica: el store podría mostrar algo distinto de lo que quedó en la caché, y va contra la idea de que la interfaz se actualiza solo con los listeners (CLAUDE.md, regla 3).
2. **Escribir `updatedAt` con la hora del dispositivo.** Descartado en el ADR 0003: un reloj atrasado haría que el otro dispositivo nunca viera los cambios.
3. **Dos listeners por colección:** uno al servidor, que solo trae los cambios a la caché, y otro **solo a la caché**, que alimenta la interfaz.

## Decisión
Se adopta la opción 3. Para cada colección del usuario:

1. **Listener a la caché**: `onSnapshot(colección, { source: 'cache', includeMetadataChanges: true })`. Escucha la colección completa, pero **solo en la caché local**, así que no cuesta lecturas. Recibe al instante las escrituras propias (aunque estén pendientes) y todo lo que el otro listener trae del servidor. Es la única fuente del store.
2. **Listener al servidor**: `onSnapshot(query(colección, where('updatedAt', '>', cursor)))`. La app no usa sus datos: su trabajo es traer a la caché lo que cambió en otros dispositivos. Sus metadatos (`fromCache`) indican si la app está al día con el servidor.
3. **El cursor** se calcula con la primera foto del listener a la caché: es el `updatedAt` más alto entre los documentos **sin** escrituras pendientes, menos un margen de **10 minutos**. Sin documentos en la caché no hay cursor, y se descarga todo una vez. Con documentos de menos de 1 KB, volver a leer lo que cambió en los últimos 10 minutos cuesta muy poco.
4. **El perfil** (`users/{uid}`) se escucha con un listener directo, como decía el SRS 3.2.

## Consecuencias
- El costo en lecturas es el mismo que en el ADR 0003: el listener a la caché es gratis.
- Si la app pierde el listener al servidor (por ejemplo, porque el usuario cerró la app) justo después de reconectarse, puede pasar algo raro: el servidor confirma una escritura propia antes de que llegue un cambio viejo de otro dispositivo. Si ese cambio es más de 10 minutos anterior a la escritura propia, queda por debajo del cursor y este dispositivo no lo ve. La ventana dura unos segundos y se acepta. Si alguna vez pasa, se puede agregar en Ajustes un "volver a descargar todo" (que cuesta una lectura por documento).
- Hay tests contra el emulador que verifican el problema y su solución: una escritura sin conexión aparece al instante y una edición pendiente no hace desaparecer el documento.
- El SRS 3.2 se actualiza con este esquema.
