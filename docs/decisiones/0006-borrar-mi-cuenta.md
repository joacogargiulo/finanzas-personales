# ADR 0006 — Cómo funciona "Borrar mi cuenta"

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 2 (se implementa en la Fase 9)

## Contexto
Un producto multiusuario tiene que permitir que el usuario borre todos sus datos (lo exige la Ley 25.326 de protección de datos personales y lo pide Google Play). En el plan Spark no hay Cloud Functions, así que el borrado se hace desde el cliente. Además, Spark limita los borrados a **20.000 por día para todo el proyecto**: un usuario con 10.000 movimientos usa la mitad. Firebase exige un inicio de sesión reciente para borrar el usuario de Auth (`user.delete()`).

## Decisión
Es el **único caso de borrado físico** (ver ADR 0003). Pasos:

1. Exigir conexión y **volver a iniciar sesión antes de empezar**. Si se pidiera a mitad del proceso, podrían quedar los datos borrados a medias.
2. Borrar los documentos de todas las colecciones en `writeBatch` de hasta 500 operaciones, mostrando el progreso. Los IDs salen de la caché local (ADR 0003), así que no hacen falta lecturas.
3. Borrar el documento de perfil al final, después el usuario de Firebase Auth (`user.delete()`) y por último la caché local (`terminate()` + `clearIndexedDbPersistence()`).
4. **Reanudable:** si se corta (sin señal, cuota agotada), volver a ejecutarlo sigue con lo que queda. Mientras el perfil exista, la cuenta sigue siendo usable.

## Consecuencias
- Si se agota la cuota diaria de borrados, el proceso queda a medias hasta el día siguiente. Se avisa con un mensaje claro.
- La política de privacidad (Fase 9) describe este proceso.
- Las reglas tienen que permitir el `delete` físico de los documentos propios. Eso no rompe las lápidas: la app solo lo usa en este flujo.
