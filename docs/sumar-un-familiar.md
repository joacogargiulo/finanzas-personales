# Sumar a un familiar

La app es privada: solo entran las cuentas de Google de una lista (ADR 0026). Cada persona ve **solo sus propios datos**. Sumar a alguien no le da acceso a los tuyos, ni a vos a los suyos.

## 1. Lo que hace el dueño

1. **Pedile el email exacto de su cuenta de Google.** El que muestra Google en "Administrar tu cuenta de Google". En Gmail, `juan.perez@gmail.com` y `juanperez@gmail.com` entran a la misma casilla, pero las reglas comparan el texto exacto.
2. **Calculá el hash:**
   ```sh
   npm run email-hash -- persona@gmail.com
   ```
   Imprime una línea como `'3f1a…c9',`. Las mayúsculas no importan: el script y las reglas pasan el email a minúsculas.
3. **Pegala en `firestore.rules`**, dentro de `allowedEmailHashes()`, con un comentario que **no** diga el email. El repositorio es público.
   ```
   function allowedEmailHashes() {
     return [
       '19f4…ee5b',
       // Familiar 1
       '3f1a…c9',
       // familia@example.org: solo para los tests (example.org es un dominio reservado).
       '9be0…503e'
     ];
   }
   ```
4. **Corré los tests de reglas** (`npm run test:rules`), y después rama, PR y merge, como cualquier cambio.
5. **Publicá las reglas desde `main`:**
   ```sh
   git checkout main
   git pull
   npm run deploy:rules
   ```
   Hasta este paso, la persona ve "Esta app es privada".

## 2. Lo que hace el familiar

**En la computadora o en un celular sin el APK:**
1. Abrir https://finanzas-personales-jtg.web.app en Chrome.
2. Tocar **Continuar con Google** y elegir la cuenta que se sumó a la lista.
3. Si quiere tenerla como app, en el menú de Chrome: **Instalar app** (o **Agregar a la pantalla principal**).

**En Android, con el APK:**
1. El dueño le pasa el archivo `.apk`, por ejemplo por WhatsApp o Drive.
2. Al abrirlo, Android pide permiso para instalar apps de esa fuente: **Configuración → Permitir de esta fuente**. Ese permiso se da solo a esa app (WhatsApp, Archivos, etc.).
3. Instalar, abrir y entrar con Google. Si ya tenía la sesión abierta en Chrome, el APK la usa.

**La primera vez** ve la app vacía, con las 6 categorías iniciales. El primer paso es **Crear mi primera cuenta** (por ejemplo, "Efectivo" con lo que tiene en la billetera). En **Ajustes → Privacidad** se explica qué datos salen del dispositivo y a dónde.

## 3. Sacar a alguien

1. **Pedile que antes use Ajustes → Borrar mi cuenta.** Así sus datos se borran del servidor.
2. Quitá su hash de `firestore.rules` (PR y merge) y publicá con `npm run deploy:rules`.

Si se quita el hash sin que la persona borre su cuenta, sus datos quedan en Firestore: las reglas ya no la dejan leerlos, pero siguen ocupando lugar. Se pueden borrar a mano desde la consola de Firebase (`users/{uid}`).

## 4. Problemas comunes

| Qué pasa | Por qué | Qué hacer |
|---|---|---|
| "Esta app es privada" | Las reglas no están publicadas, el hash se copió mal o es de otro email | Revisar el email exacto, volver a calcular el hash y correr `npm run deploy:rules` desde `main` |
| Entró con otra cuenta de Google | Chrome eligió la cuenta que tenía abierta | En "Esta app es privada", tocar **Usar otra cuenta** |
| No aparece el micrófono | El dictado necesita Chrome (Firefox no lo soporta) | Usar Chrome o el APK |
| El APK abre con la barra de direcciones | Chrome no verificó el sitio | Ver `android/README.md` (huella de `assetlinks.json`) |

## 5. Prueba con un familiar (TC-19)

Para confirmar que cada persona ve solo lo suyo:
1. El familiar entra y carga un movimiento.
2. El dueño, en su app, confirma que no aparece nada del familiar.
3. El familiar confirma que no ve nada del dueño.

Resultado: *pendiente* (se completa al hacer la prueba).
