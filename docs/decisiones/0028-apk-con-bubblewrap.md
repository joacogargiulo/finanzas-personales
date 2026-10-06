# ADR 0028 — APK con Bubblewrap

- **Estado:** aceptada
- **Fecha:** 2026-10-06
- **Fase:** 8 (APK)
- **Modifica:** SRS 9.2, 9.3 y 13

## Contexto
La app se usa en un celular Android como APK (SRS 9.3). El APK es una **Trusted Web Activity** (TWA): una app mínima que abre el sitio publicado en Chrome, a pantalla completa. El contenido sigue viniendo de Hosting, así que una versión nueva de la app no requiere un APK nuevo.

Para ocultar la barra de direcciones, Android verifica que el sitio "confíe" en la app. Para eso, el sitio publica `/.well-known/assetlinks.json` con el nombre de paquete y la huella SHA-256 del certificado que firma el APK (Digital Asset Links). Si no coinciden, la app abre igual, pero con la barra de direcciones visible.

Faltaba decidir:
- El nombre de paquete, que no se puede cambiar sin desinstalar la app.
- Dónde vive el proyecto Android y dónde la clave de firma.
- Cómo se distribuye el APK.

## Alternativas
**Proyecto Android**
1. **En `android/`, dentro del repo:** el APK se puede regenerar desde el repo y el proyecto queda a la vista en el portfolio. Hay que cuidar que no se suban secretos ni salidas del build.
2. **Fuera del repo:** el repo queda más chico, pero el proyecto vive en una sola compu.

**Distribución**
1. **Instalación manual del `.apk`:** sin costo. Una sola clave, así que una sola huella.
2. **Play Store:** cuenta de desarrollador (USD 25), un `.aab` y una segunda huella, la de la clave con la que Google vuelve a firmar (Play App Signing).

## Decisión
- **Paquete `ar.jtg.finanzas`.**
- **Proyecto en `android/`**, generado con `bubblewrap init` a partir del manifiesto publicado. Se sube `twa-manifest.json`: tiene la ruta y el alias de la clave, no las contraseñas. Se ignoran los `.apk`, `.aab` y las carpetas de build. Prettier no formatea `android/`, porque Bubblewrap lo regenera.
- **La clave de firma, fuera del repo** (`C:\Users\joaco\claves\finanzas-apk.keystore`). Sus contraseñas van en el gestor de contraseñas del dueño, con una copia del archivo en otro lugar seguro.
- **Instalación manual**, así que `assetlinks.json` lleva una sola huella. También se guarda en `fingerprints` de `twa-manifest.json`, para que `bubblewrap fingerprint generateAssetLinks` la reproduzca.
- **`assetlinks.json` en `public/.well-known/`.** Vite lo copia al build. `firebase.json` dejó de ignorar los archivos que empiezan con punto, porque el build no tiene otros. El service worker no responde `/.well-known/` con `index.html`.
- **Tests:** uno unitario compara el paquete de `assetlinks.json` con el de `twa-manifest.json` y revisa el formato de la huella; un E2E verifica que el servidor devuelve el archivo.
- **JDK 17 de 64 bits para Bubblewrap.** El JDK que descarga Bubblewrap en Windows es de 32 bits: Gradle se queda sin memoria (*metaspace*) y se cierra. Se instaló Temurin 17 x64 y `~/.bubblewrap/config.json` apunta a él a través de una *junction* sin espacios (`~/.bubblewrap/jdk17`), porque Bubblewrap no pone comillas en la ruta de Java al firmar. Windows y Firebase siguen usando Java 21.

## Consecuencias
- El APK solo se regenera si cambian el nombre, los íconos, los colores o el manifiesto. Para hacerlo: subir `appVersionCode` en `twa-manifest.json`, correr `bubblewrap update` y `bubblewrap build` (ver `android/README.md`).
- Si se pierde la clave, no se puede actualizar la app instalada: hay que desinstalarla, crear otra clave y publicar la huella nueva.
- Si en algún momento se publica en Play Store, hay que sumar a `assetlinks.json` la huella de Play App Signing.
- Si la huella publicada no coincide, el APK abre con la barra de direcciones. Chrome guarda en caché el resultado de la verificación: después de corregirla, hay que borrar los datos de la app.
## Resultado de las pruebas en el celular (2026-10-06)
- **TC-21:** abre a pantalla completa, sin barra de direcciones. Google confirma la relación (API de Digital Asset Links).
- **Login:** `signInWithPopup` funciona. Dentro de la TWA el popup se abre como una pestaña a pantalla completa y vuelve a la app sin recargar. No hace falta usar el redirect en el APK (ADR 0017).
- **Sesión compartida con Chrome:** el APK usa los datos de Chrome para el sitio. Si ya había una sesión abierta en Chrome, el APK abre con esa sesión.
- **Descargas** (CSV y JSON, TC-22 y TC-23): se guardan en la carpeta Descargas del celular.
- **Google Sheets:** el permiso y la exportación funcionan (ADR 0025).
- Sin conexión, sincronización con la compu, atajo "Dictar movimiento" y micrófono: funcionan.
