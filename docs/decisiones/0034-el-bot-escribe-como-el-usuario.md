# ADR 0034 — El bot de WhatsApp escribe en Firestore como el usuario

- **Estado:** aceptada
- **Fecha:** 2026-10-14
- **Fase:** 11d (cargar movimientos por WhatsApp)
- **Modifica:** ADR 0032 (paso 6 del plan y la primera consecuencia) y ADR 0033 (suma claves al KV)

## Contexto
El ADR 0032 decidió que el bot escribe los movimientos en Firestore por la API REST, y propuso hacerlo con una **cuenta de servicio** con un rol de Firestore. Una cuenta de servicio con ese rol **saltea las reglas de seguridad**: puede leer y escribir cualquier documento de cualquier usuario. El CLAUDE.md dice que las reglas son la barrera de seguridad real (regla 10). Con ese diseño, la barrera de la escritura pasaría a ser solo el código del Worker, y la clave de la cuenta de servicio sería el secreto más sensible del proyecto.

## Alternativas

### 1. Cuenta de servicio con un rol de Firestore (lo propuesto en el ADR 0032)
- A favor: simple; no hace falta canjear tokens.
- En contra:
  - Saltea las reglas. Un error en el Worker (o una clave filtrada) podría leer o pisar los datos de toda la familia.
  - Las reglas validan el esquema completo; el Worker tendría que repetir todo ese control.

### 2. Custom token: el Worker actúa **como la persona**
- La cuenta de servicio `whatsapp-bot` **no tiene ningún rol**. Solo sirve para firmar un *custom token* de Firebase Auth para el uid de la persona. Ese token se canjea (`accounts:signInWithCustomToken`) por un **ID token** de esa persona, y con él se llama a la REST de Firestore.
- A favor:
  - **Las reglas se aplican igual que si escribiera la app**: el bot solo puede tocar los datos de la persona que escribió, y solo con el esquema que las reglas aceptan.
  - Si se filtra la clave, un atacante puede hacerse pasar por cualquier uid, pero **solo contra las reglas**: la lista de emails y el esquema siguen valiendo. No llega a nada que la app no pudiera hacer.
  - Es lo que recomienda Firebase para servidores que actúan en nombre de un usuario.
- En contra:
  - Un paso más: firmar con RSA (gasta CPU en el plan gratis de Workers) y canjear.
  - Un ID token dura 1 hora y hay que guardarlo.

## Decisión
**Custom token (alternativa 2).** El dueño la eligió el 2026-10-13.

### Cómo funciona
1. `customToken()` firma con `jose` (RS256) un JWT con `iss` y `sub` = el email de la cuenta de servicio, `aud` de Identity Toolkit, `uid` = el de la persona y vencimiento a 1 hora.
2. `userIdToken()` lo canjea por un ID token. Lo guarda en el KV `WHATSAPP` como `idtoken:{uid}` por **50 minutos**: así se firma con RSA una vez por hora y por persona, no en cada mensaje.
3. Con ese token, `firestoreRest.ts` lee el perfil, las cuentas y las categorías (con `mask.fieldPaths`, para traer solo lo necesario) y escribe el movimiento con un `commit`:
   - `updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]`, el equivalente a `serverTimestamp()`. `updatedAt` es el cursor de sincronización (ADR 0003): la app recibe el movimiento por su listener, como si viniera de otro dispositivo.
   - `currentDocument: { exists: false }`: repetir la escritura no pisa nada.
4. Los montos viajan como `integerValue` (texto): nunca como decimales (regla 1).

### El resto del flujo
- **Email en el KV (`email:{uid}`):** se guarda al pedir el código de vinculación (el Worker lo sabe por el token de Firebase de la app). Antes de gastar IA, el bot controla que ese email esté en la lista de acceso (ADR 0026). Las reglas lo vuelven a controlar al escribir. Los vínculos de la 11c no tienen el email: el bot pide volver a vincular.
- **Botones:** el resumen se manda como mensaje interactivo con "Guardar" y "Cancelar". También se acepta escribir "sí" o "no".
- **Pendiente:** `pendiente:{número}` en el KV por 10 minutos, con el ID del movimiento y el borrador. Un mensaje nuevo reemplaza al pendiente; el botón trae el ID, y si no coincide con el pendiente el bot responde que venció.
- **ID fijo:** `wa_` + los primeros 20 caracteres hex del SHA-256 del ID del mensaje original (regla 7). Si Meta reintenta o se toca "Guardar" dos veces, no se duplica: si el documento ya existe, cuenta como guardado (el mismo criterio que `confirmOccurrence`).
- **Se valida dos veces:** al interpretar y al confirmar, con las cuentas y categorías leídas en ese momento, porque en 10 minutos pudo archivarse una cuenta. Si el esquema del perfil es más nuevo que el del bot (ADR 0011), no escribe.
- **IA:** comparte la cuota diaria con el dictado (`uso:{uid}:{día}`). Sin cuota o si la IA falla, un texto se interpreta con el parser de reglas; un audio no se puede transcribir y se pide escribirlo. Un audio tiene un tope de 1 MB.

## Consecuencias
- **Se actualiza el ADR 0032:** el paso 6 ya no usa una cuenta de servicio con rol de Firestore, y la primera consecuencia ("saltea las reglas") deja de valer.
- **Claves nuevas en el KV `WHATSAPP`** (ADR 0033):

| Clave | Valor | Vence |
|---|---|---|
| `email:{uid}` | email de la cuenta | no (se borra al desvincular) |
| `idtoken:{uid}` | ID token de la persona | 50 minutos |
| `pendiente:{número}` | `{ txId, draft }` | 10 minutos |

- **Un secreto nuevo:** `FIREBASE_SERVICE_ACCOUNT` (el JSON de `whatsapp-bot`), y una variable: `FIREBASE_API_KEY` (la API key web, que no es un secreto: está en el código de la app).
- **Si se filtra la clave de la cuenta de servicio**, se borra la clave en Google Cloud y se crea otra. Sin roles, el daño queda limitado por las reglas.
- **El ID token en el KV** es una credencial de una hora: quien pudiera leer el KV tendría acceso a los datos de esa persona durante ese tiempo. El KV solo lo lee el Worker.
- **La persona tiene que haber abierto la app una vez** (sin perfil no hay categorías iniciales): si no, el bot lo avisa.
- **El token es de proveedor `custom`**, no `google.com`. Ninguna regla pide el proveedor: validan `email` y `email_verified`.
- **Queda para la 11e:** el detalle del SRS 4.9 y la sección Privacidad.

## Nota (prueba de factibilidad, 2026-10-14)
Antes de programar se comprobó, con un script descartable y la clave de `whatsapp-bot` (creada **sin ningún rol**):
- Firebase **aceptó el custom token** y devolvió un ID token.
- El ID token **trae `email: joacogargiulo04@gmail.com` y `email_verified: true`**, que son los datos que exigen las reglas. Además trae las identidades de la cuenta (`google.com`).
- `GET users/{uid}` por REST con ese token **devolvió 200**: las reglas dejaron leer a la cuenta de servicio como si fuera la persona, sin ningún rol de IAM.
- `sign_in_provider` es `custom`.
- La API key web no tiene restricciones, así que sirve desde el Worker (no manda *referrer*).
