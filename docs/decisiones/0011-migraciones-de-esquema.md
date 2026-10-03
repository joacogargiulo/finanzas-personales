# ADR 0011 — Migraciones de esquema: expandir y contraer, de a poco

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 4

## Contexto
Firestore no tiene esquema propio: el esquema son los tipos de TypeScript y las reglas. El modelo va a cambiar con el tiempo, y en esta app eso tiene dos complicaciones:

- **Versiones viejas de la app:** el service worker de la PWA (y por lo tanto el APK) puede seguir con una versión vieja guardada, y un celular sin conexión puede pasar días con ella. Si las reglas ya exigen el esquema nuevo, rechazan lo que escribe esa versión, y esas escrituras se pierden sin aviso (ADR 0010).
- **Costo:** reescribir 10.000 movimientos son 10.000 escrituras, y Spark da 20.000 por día **para todo el proyecto**.

## Opciones consideradas
1. **Migración completa inmediata:** al iniciar sesión, la app reescribe todos los documentos del usuario. Es simple, pero cara y no protege a las apps viejas.
2. **Expandir y contraer, con migración perezosa** (los documentos se convierten de a poco, a medida que se editan) y bloqueo de las versiones viejas.

## Decisión
Se adopta la opción 2.

1. **Preferir los cambios aditivos:** un campo opcional nuevo o un valor nuevo en una lista no necesitan migración. Al leer, si falta el campo, se usa un valor por defecto.
2. **Cambio incompatible, en tres pasos:**
   - **Expandir:** las reglas aceptan la forma vieja y la nueva. La app nueva escribe la forma nueva y, al leer, convierte la vieja con funciones de `src/data/` que tienen tests.
   - **Migrar de a poco:** cada movimiento pasa a la forma nueva cuando se edita. Las colecciones chicas (cuentas, categorías, presupuestos, recurrentes) se pueden migrar todas juntas en un batch al iniciar sesión con conexión.
   - **Contraer:** después de **60 días**, las reglas dejan de aceptar la forma vieja. Antes de eso se migran los documentos que quedan sin migrar, si conviene.
3. **Bloqueo de versiones viejas:**
   - El perfil (`users/{uid}`) guarda `schemaVersion`, y cada build de la app conoce su propia versión.
   - Si una app lee un perfil con un `schemaVersion` mayor que el suyo, **deja de escribir** y muestra *"Hay una versión nueva. Actualizá la app para seguir cargando movimientos."*, con un botón para recargar.
   - Las reglas impiden que `schemaVersion` baje.
4. **Arranque:** el modelo de esta fase es `schemaVersion: 1`.

## Consecuencias
- Cada cambio incompatible futuro tiene su propio ADR, con el paso actual (expandir, migrar, contraer) y la fecha en que se contrae.
- Un movimiento viejo nunca editado puede quedar en la forma anterior para siempre. No es un problema mientras la conversión al leer exista. Si en algún momento hace falta sacarla, se hace una migración completa planificada para ese momento.
- Una app vieja **sin conexión** no ve el bloqueo hasta que sincroniza. Por eso el período de gracia de las reglas hace falta igual.
