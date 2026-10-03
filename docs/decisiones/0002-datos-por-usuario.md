# ADR 0002 — Los datos de cada usuario viven bajo `users/{uid}/`

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** M (modelo de datos), bloque 1

## Contexto
La app es multiusuario: cualquier persona inicia sesión con Google y tiene que ver **solo sus datos**. En Firestore los datos se guardan en documentos agrupados en colecciones, y un documento puede tener subcolecciones. Hay que decidir cómo separar los datos de cada usuario.

## Opciones consideradas
1. **Una "carpeta" por usuario:** `users/{uid}/accounts/…`, `users/{uid}/transactions/…`, etc.
2. **Colecciones comunes en la raíz** (`transactions/…`) con un campo `uid` en cada documento.

## Decisión
Se adopta la opción 1. Todas las colecciones del usuario son subcolecciones de `users/{uid}`.

- **Seguridad por ruta:** la regla base es "solo podés leer o escribir en `users/{uid}/…` si `request.auth.uid == uid`". La ruta lo garantiza, sin depender de que cada consulta filtre bien.
- **Consultas más simples:** no hace falta repetir `where('uid', '==', …)` en cada consulta.
- Si algún día hace falta consultar todos los usuarios juntos, existen las *collection group queries*. Hoy no se necesita.

## Consecuencias
- El SRS 4 ya usaba esta estructura: no cambia nada.
- Las reglas (bloque 4) parten de `match /users/{uid}/{document=**}` y agregan la validación de esquema de cada colección.
- "Borrar mi cuenta" significa borrar todo lo que está bajo `users/{uid}/` (se detalla en el bloque 2).
