# ADR 0026 — Acceso por lista de emails

- **Estado:** aceptada
- **Fecha:** 2026-10-05
- **Fase:** 7a (acceso solo para la familia)
- **Modifica:** SRS 1.2, 7.3 y 13

## Contexto
La app iba a ser un producto abierto: cualquiera iniciaba sesión con Google y veía solo sus datos (ADR 0002). El dueño cambió el rumbo: por ahora la usan él y su familia. En la Fase 7 la app se publica en Firebase Hosting con un link público, y cualquiera que lo encuentre podría crearse una cuenta y gastar la cuota gratis del plan Spark (lecturas, escrituras y borrados diarios son del proyecto entero, no de cada usuario).

Restricciones:
- En Spark no hay Cloud Functions ni "blocking functions" de Auth: no se puede impedir que alguien inicie sesión. Firebase Auth crea el usuario igual, pero eso no gasta cuota de Firestore.
- La barrera real son las **reglas de Firestore**, y no tienen que gastar lecturas (ADR 0010: sin `get()`).
- El repositorio es **público** (ADR 0013): lo que esté en `firestore.rules` lo ve cualquiera.

## Alternativas
1. **Emails en texto plano en las reglas:** simple y legible, pero publica en GitHub los emails de la familia (spam, datos personales).
2. **Hash SHA-256 de cada email en las reglas:** las reglas calculan `hashing.sha256()` del email de la sesión y lo buscan en una lista fija. No gasta lecturas y el repo solo muestra hashes. Para sumar a alguien hay que editar las reglas y publicarlas.
3. **Un documento de Firestore con la lista,** consultado con `exists()`: se edita desde la consola sin tocar el repo, pero cada evaluación de las reglas gasta una lectura y rompe el principio "reglas sin `get()`".

## Decisión
**Hash SHA-256 en las reglas** (alternativa 2, elegida por el dueño):
- `isAllowed()` exige `email_verified == true` y que el SHA-256 del email **en minúsculas** esté en `allowedEmailHashes()`. Va dentro de `isOwner(uid)`, así cubre todas las colecciones.
- `npm run email-hash -- persona@gmail.com` imprime el hash listo para pegar. Después, `npm run deploy:rules`.
- **Cuentas de prueba:** los tests de reglas, de datos y E2E crean usuarios `@example.com` sin hash. Las reglas aceptan ese dominio porque es **reservado** (RFC 2606): nadie puede verificar una cuenta de Google con él, y las reglas exigen el email verificado. La lista trae además el hash de `familia@example.org` (también reservado) para probar la comparación de hashes.
- **En la app:** si el servidor rechaza la sincronización con `permission-denied`, la sesión detiene los listeners y muestra "Esta app es privada", con el botón "Usar otra cuenta" (cierra la sesión y borra la caché).

## Consecuencias
- Quien no está en la lista puede iniciar sesión, pero no lee ni escribe nada: lo único que gasta es el intento rechazado de cada listener.
- Un hash de email no es un secreto: quien sospeche un email puede calcular su hash y confirmarlo. Alcanza para no publicar la lista en texto plano.
- Como la app es offline-first, quien no tiene acceso ve la pantalla de Inicio vacía hasta que llega el rechazo del servidor (menos de un segundo con buena conexión, unos segundos con el emulador). Lo que intente cargar en ese rato queda solo en su caché, que se borra al cerrar la sesión.
- Si se saca a alguien de la lista, sus datos siguen en Firestore (no se borran) y en la caché de su dispositivo hasta que cierre la sesión. Al volver a conectarse ve la pantalla de app privada.
- Si en el futuro la app vuelve a abrirse al público, alcanza con sacar `isAllowed()` de `isOwner()`. Conviene sumar App Check (Fase 9).
  - *Nota (ADR 0029):* mientras la app sea familiar, App Check queda descartado.
