# ADR 0010 — Qué validan las reglas de Firestore y qué valida el dominio

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 4
- **Modifica:** SRS 7.3 (reglas multiusuario con validación de esquema)

## Contexto
La app es multiusuario y la configuración de Firebase es pública: cualquiera puede saltearse la interfaz y escribirle a Firestore directamente. Las reglas son la barrera de seguridad real.

Algunas validaciones dependen de otros documentos (que la moneda de las dos cuentas de una transferencia coincida o que una cuenta no esté archivada). Para hacerlas, la regla necesita `get()`, que **cobra una lectura** por llamada, con un máximo de 10 por escritura y 20 por batch.

Además, la app funciona sin conexión y no espera las escrituras (regla 3 de CLAUDE.md). Si el servidor rechaza una escritura que se hizo sin conexión, **el SDK la descarta sin avisarle al usuario**. Ejemplo: en un dispositivo se archiva la cuenta "Efectivo" mientras otro, sin conexión, le carga un gasto. Si la regla valida "cuenta no archivada", el gasto se pierde al sincronizar.

## Opciones consideradas
1. **Las reglas validan cada documento por separado** y la coherencia entre documentos queda en el dominio.
2. **Las reglas también validan entre documentos con `get()`.**

## Decisión
Se adopta la opción 1, con este principio: **las reglas rechazan solo lo que la app legítima nunca podría producir.**

Las reglas validan, sin `get()`:
- **Dueño:** `request.auth.uid == uid`. Todo lo que no está permitido explícitamente queda denegado.
- **Campos exactos por tipo** (`keys().hasOnly()` / `hasAll()`), siguiendo las uniones discriminadas (ADR 0007).
- **Tipos, rangos y largos:** montos `int` entre 1 y 99.999.999.999.999 (`initialBalance` admite 0), textos con su largo máximo y valores de las listas permitidas (`type`, `currency`, `kind`, `source`, `frequency`).
- **Fechas** con una expresión regular `YYYY-MM-DD` (mes 01–12, día 01–31). Que la fecha exista en el calendario lo valida el dominio.
- **Claves de ícono y color:** texto corto en minúsculas (ADR 0008).
- **Campos que no se pueden cambiar** (`diff().affectedKeys()`): `createdAt` en todas las colecciones, `currency` e `initialBalance` en cuentas, `source` en movimientos, y `categoryId` y `currency` en presupuestos (forman su ID).
- **`updatedAt == request.time`** en cada escritura (ADR 0003).
- **IDs fijos:** el ID de un presupuesto coincide con `{categoryId}_{currency}`.
- **Borrado físico permitido** sobre los documentos propios, solo para "Borrar mi cuenta" (ADR 0006).
- **`whatsappLinks/{telefono}`** (colección raíz, Fase 11): `allow read, write: if false`. Solo la escribe el servidor con su cuenta de servicio, que saltea las reglas.

El **dominio** valida al escribir todo lo que depende de otros documentos:
- La cuenta y la categoría existen y están activas, y la categoría es del tipo correcto.
- La moneda coincide en las transferencias y difiere en los cambios.
- El saldo es 0 al archivar una cuenta.
- La cuenta o categoría no se usa al eliminarla, y no hay nombres repetidos.

Al leer, **la app tolera datos incoherentes**. Por ejemplo, un movimiento cuya cuenta no existe se muestra como "Cuenta desconocida" en vez de romper la pantalla.

## Consecuencias
- Ninguna escritura gasta lecturas extra, y una escritura hecha sin conexión no se pierde por un cambio de estado en otro dispositivo.
- Un usuario malicioso solo puede ensuciar **sus propios** datos; no es un problema de seguridad.
- Las reglas no pueden limitar *cuántos* documentos crea un usuario. El abuso de cuota se mitiga con **App Check** en la Fase 9.
- Las reglas reales (`firestore.rules`) y sus tests con el emulador se escriben en la Fase 2. Los tests cubren cada campo, cada tipo de movimiento, los campos que no se pueden cambiar y el acceso entre usuarios (TC-19).
