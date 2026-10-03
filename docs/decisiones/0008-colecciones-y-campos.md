# ADR 0008 — Colecciones y campos del modelo

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 3
- **Modifica:** SRS 4.1 a 4.6 y 4.8

## Contexto
Con los ADR 0002 a 0007 decididos, faltaba recorrer cada colección y cerrar cuatro preguntas: si cada movimiento guarda la moneda de su cuenta, si se registra el origen del movimiento, qué datos de apariencia se guardan y dónde van las preferencias de cada dispositivo.

## Decisión

### Perfil: el documento `users/{uid}`
Reemplaza a `users/{uid}/settings/main`. Ese documento existe igual como "padre" de las colecciones, y hay un solo perfil por usuario.

| Campo | Tipo |
|---|---|
| `schemaVersion` | int (migraciones, bloque 4) |
| `seededAt` | ms \| null (ADR 0004) |
| `sheetsSpreadsheetId` | string \| null |
| `createdAt` / `updatedAt` | ms / timestamp del servidor |

### Campos comunes
Todas las colecciones (`accounts`, `categories`, `transactions`, `budgets` y `recurring`) tienen `createdAt`, `updatedAt` y `deletedAt` (ADR 0003, 0005 y 0007). Las cuentas y las categorías tienen además `archivedAt`.

### Campos nuevos
- **Cuentas: `kind`**, que vale `'cash' | 'bank' | 'wallet' | 'investment' | 'other'`. Define el ícono y distingue el efectivo, el banco y las billeteras virtuales (Mercado Pago). Es obligatorio y se puede editar.
- **Categorías: `icon` y `color`.** Guardan **claves** de una lista fija (por ejemplo, `'cart'` y `'teal'`), no colores ni SVG. El tema claro u oscuro decide el color real, y el set de íconos puede cambiar sin migrar datos. Las reglas validan solo el formato (texto corto en minúsculas); si la app recibe una clave que no conoce, muestra un ícono por defecto. La siembra asigna un ícono y un color a cada categoría inicial.
- **Movimientos: `source`**, que vale `'app' | 'voice' | 'whatsapp'`. Se fija al crear el movimiento y no se puede cambiar. Sirve para saber cuánto se usa cada canal y para depurar errores.

### Lo que no se guarda en Firestore
- **La moneda en cada movimiento.** Se obtiene de la cuenta, y la búsqueda es gratis porque los datos están en el dispositivo. No puede desfasarse, porque la moneda de una cuenta no se puede cambiar, y así no hay un campo más que validar.
- **Preferencias de cada dispositivo**, guardadas en `localStorage` con el `uid` en la clave:
  - **Tema** claro, oscuro o automático.
  - **Orden manual de las cuentas** (opcional, se implementa con la UI): una lista de IDs. Las cuentas que no están en la lista van al final, y los IDs de cuentas que ya no existen se ignoran. El orden por defecto es por moneda y nombre.

## Consecuencias
- Cada dispositivo tiene su tema y su orden; no se sincronizan. Se acepta porque son preferencias de visualización y así no gastan escrituras.
- El detalle campo por campo de cada colección queda en la sección 4 del SRS 3.1 y en `src/domain/model.ts`, al cerrar la fase.
- El SRS 4.6 (`settings/main`) desaparece.
