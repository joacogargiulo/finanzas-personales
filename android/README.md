# APK (Trusted Web Activity)

Proyecto Android generado con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) a partir del manifiesto publicado (SRS 9.3, ADR 0028). Abre `https://finanzas-personales-jtg.web.app` en Chrome, a pantalla completa.

## Cuándo regenerar el APK
El contenido de la app viene de Hosting: publicar con `npm run deploy` alcanza para que el APK muestre la versión nueva. Solo hace falta un APK nuevo si cambian el nombre, los íconos, los colores, los atajos o la configuración de `twa-manifest.json`.

## Cómo regenerarlo
Desde esta carpeta, en una PowerShell **fuera de VS Code**, porque las preguntas de Bubblewrap no se ven en la terminal integrada:

1. Subir `appVersionCode` (y `appVersionName`) en `twa-manifest.json`. Android no instala encima un APK con el mismo número de versión.
2. `bubblewrap update`: regenera el proyecto a partir de `twa-manifest.json`.
3. `bubblewrap build`: pide las contraseñas de la clave y genera `app-release-signed.apk`, que no se sube al repo.

## Requisitos
- `npm install -g @bubblewrap/cli`
- `~/.bubblewrap/config.json` con `jdkPath` apuntando a un **JDK 17 de 64 bits**, en una ruta **sin espacios**. Con el JDK de 32 bits que descarga Bubblewrap, Gradle se queda sin memoria (ADR 0028).
- La clave de firma `C:\Users\joaco\claves\finanzas-apk.keystore`, que nunca va en el repo.

## La huella y el assetlinks.json
`public/.well-known/assetlinks.json` tiene la huella SHA-256 del certificado de la clave. Si cambia la clave, hay que actualizar la huella ahí y en `fingerprints` de `twa-manifest.json`. Para ver la huella de un APK firmado:

```powershell
java -jar $env:USERPROFILE\.bubblewrap\android_sdk\build-tools\<versión>\lib\apksigner.jar verify --print-certs app-release-signed.apk
```
