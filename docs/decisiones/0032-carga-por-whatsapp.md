# ADR 0032 — Carga por WhatsApp: API oficial o Baileys

- **Estado:** propuesta
- **Fecha:** 2026-10-13
- **Fase:** 11a (análisis de WhatsApp)
- **Modifica:** nada todavía; la 11b va a modificar el SRS 4.9 y la sección Privacidad

## Contexto
Según el ADR 0029, la familia tiene que poder cargar movimientos mandando un mensaje de WhatsApp, de texto o de audio ("gasté 18 mil en el súper"). El bot responde con un resumen y guarda el movimiento recién cuando la persona confirma. Antes de programarlo hay que elegir cómo conectarse a WhatsApp. Hay dos caminos:
- **WhatsApp Cloud API:** la API oficial de Meta.
- **Baileys:** una librería no oficial de Node que se hace pasar por WhatsApp Web.

Restricciones que ya están decididas:
- **Firebase en plan Spark:** no hay Cloud Functions. El único servidor que hay es el Worker de Cloudflare del dictado (ADR 0031).
- **Todo gratis** y nada de servicios que entrenen modelos con los datos (memoria del alcance, ADR 0029).
- **App privada (ADR 0026):** solo pueden cargar las personas de la lista de la familia.
- **Las reglas de Firestore son la barrera de seguridad** (regla 10), pero un servidor con cuenta de servicio las saltea. Entonces el servidor tiene que validar con el dominio antes de escribir.
- **Ya está preparado:** `source: 'whatsapp'` en el modelo y en las reglas, y la colección `whatsappLinks/{telefono}`, cerrada al cliente (SRS 4.9, ADR 0010).

## Alternativas

### 1. WhatsApp Cloud API (oficial)
Meta aloja el número del bot. Cuando alguien le escribe, Meta hace un `POST` (un *webhook*) a una URL nuestra con el mensaje. Para responder, nuestro servidor llama a la API de Meta.
- **Costo:** los mensajes que manda la persona son gratis. Las respuestas que no son plantillas, enviadas dentro de las 24 horas desde el último mensaje de la persona (la *ventana de atención*), también son gratis según la [página de precios de Meta](https://developers.facebook.com/docs/whatsapp/pricing/). El bot solo responde, nunca escribe primero, así que no paga. Algunos proveedores anuncian que desde el 2026-10-01 estas respuestas se cobran después de 1.000 por mes y por número. La página de Meta no lo dice, y aunque fuera así, una familia no llega a ese número.
- **Número:** al crear la app en Meta se obtiene un **número de prueba gratis**, que puede escribirles a **hasta 5 números verificados** con un código. Para una familia alcanza, y además funciona como una lista de acceso extra. Si hiciera falta un número argentino, se puede registrar una segunda SIM; ese número no puede estar usándose en la app de WhatsApp.
- **Hosting:** el webhook es un pedido HTTP más, así que entra en el **Worker que ya existe**, sin estado y sin nada prendido todo el tiempo.
- **Audio:** el webhook trae el ID del audio. Con el token de Meta se pide la URL, que vence a los 5 minutos, y se descarga el OGG/Opus. Después se transcribe con **Whisper en Workers AI** (`@cf/openai/whisper-large-v3-turbo`, unas 47 neuronas por minuto de audio, que salen de las mismas 10.000 gratis por día del dictado).
- **Seguridad:** Meta firma cada webhook con HMAC-SHA256 usando el *app secret* (encabezado `X-Hub-Signature-256`). El Worker verifica la firma sobre el cuerpo exacto que recibió, y así nadie puede hacerse pasar por Meta.
- **Términos:** es el camino permitido. Desde enero de 2026 Meta prohíbe los asistentes de IA de **uso general** en esta API, pero un bot que hace una tarea concreta (cargar gastos) está permitido.
- **Privacidad:** el número del bot vive en los servidores de Meta, así que **Meta ve los mensajes que recibe el bot** (no tienen cifrado de punta a punta hasta nuestro servidor). Hay que decirlo en la sección Privacidad.
- **Configuración (manual, una vez):** cuenta de Meta for Developers, una app de tipo Business con el producto WhatsApp, un portafolio comercial (no hace falta verificarlo para el número de prueba), un **token permanente de usuario del sistema** (el que da la pantalla de inicio vence a las 24 horas) y verificar los números de la familia.
- **Mantenimiento:** bajo. La API tiene versiones y Meta avisa antes de dar de baja una.

### 2. Baileys (no oficial)
Baileys se conecta a WhatsApp como si fuera un **dispositivo vinculado** (igual que WhatsApp Web), usando un número común.
- **Costo:** la librería es gratis, pero necesita un **proceso de Node prendido todo el tiempo**, con un WebSocket abierto y un disco donde guardar las claves de la sesión. **No corre en Cloudflare Workers**, porque un Worker solo vive mientras atiende un pedido. Las opciones gratis tienen problemas: la compu del dueño no está siempre prendida, Render "duerme" el servicio y borra el disco, y una VM gratis de Oracle Cloud pide tarjeta y hay que mantenerla (actualizaciones, reinicios, seguridad).
- **Número:** cualquiera, también un número argentino. Si es el **número personal** del dueño, el bot lee todos sus chats y un baneo le hace perder su WhatsApp. Lo razonable sería una segunda SIM.
- **Términos y baneo:** los términos de WhatsApp prohíben el acceso automatizado no autorizado. Hay reportes de cuentas baneadas usando Baileys (por ejemplo, [el issue #2309](https://github.com/WhiskeySockets/Baileys/issues/2309)), sobre todo cuando mandan muchos mensajes. Con un uso familiar el riesgo es bajo, pero no es cero, no se puede medir y no hay a quién reclamar.
- **Audio:** Baileys descarga y descifra el audio. La transcripción igual tendría que ir a Workers AI (por su API REST, con otra clave) o correr en el servidor.
- **Seguridad:** no hay firma que verificar, porque el servidor es el propio cliente de WhatsApp. Lo que hay que proteger son las claves de la sesión en el disco: quien las tenga puede leer y escribir como ese número.
- **Privacidad:** los mensajes llegan cifrados de punta a punta hasta nuestro servidor. Meta no los ve.
- **Mantenimiento:** alto. Cuando WhatsApp cambia su protocolo, el bot deja de andar hasta que sale una versión nueva, y hubo meses sin versiones. A veces la sesión se cierra sola y hay que volver a escanear el QR.

### Comparación

| Criterio | Cloud API | Baileys |
|---|---|---|
| Costo | Gratis (el bot solo responde dentro de las 24 h) | Librería gratis; el servidor 24/7 no tiene una opción gratis buena |
| Dónde corre | El Worker que ya existe | Un proceso de Node con disco, siempre prendido |
| Número | De prueba de Meta (EE. UU.), hasta 5 destinatarios | Cualquiera; conviene una SIM aparte |
| Términos | Permitido | Prohibido; riesgo de baneo sin reclamo |
| Audio | Descarga con token + Whisper en Workers AI | Descarga en Baileys + Whisper por REST |
| Seguridad del canal | Firma HMAC de Meta | Claves de la sesión en el disco |
| Meta ve los mensajes | Sí | No |
| Mantenimiento | Bajo | Alto (cambios de protocolo, sesiones que se cierran) |
| Qué se aprende | Webhooks, firmas HMAC, APIs de terceros | WebSockets, procesos persistentes, hosting |

## Decisión (propuesta)
**WhatsApp Cloud API con el número de prueba de Meta**, con el webhook en el Worker de Cloudflare que ya existe. Pesa más que no haya que mantener un servidor, que el uso esté permitido y que no se arriesgue ningún número. A favor de Baileys quedan el número argentino y que Meta no vea los mensajes. El número argentino se puede tener igual con una segunda SIM en la Cloud API, si el de prueba molesta.

**El dueño decide.** Si elige Baileys, este ADR se reescribe con el plan de hosting antes de la 11b.

### Plan preliminar de la 11b (si se aprueba)
1. **Prueba de factibilidad primero:** con `wrangler dev` (usa la IA remota), mandarle a Whisper un audio real de WhatsApp en OGG/Opus. La documentación no dice qué formatos acepta. Si no acepta OGG, el bot pide que el mensaje se mande escrito, y el audio queda para más adelante.
2. **Vincular el número:** en Ajustes, "Vincular WhatsApp" le pide al Worker (con el token de Firebase y la lista de emails, igual que el dictado) un código de 6 cifras que vence a los 10 minutos y se guarda en KV. La persona le manda "vincular 123456" al bot, y el Worker guarda `whatsappLinks/{telefono} = { uid }`. Un número que no está vinculado no puede cargar nada. "Desvincular" y "Borrar mi cuenta" tienen que borrar ese vínculo a través del Worker, porque el cliente no puede.
3. **Webhook `POST /whatsapp`:** verificar la firma; responder 200 enseguida y hacer el trabajo con `ctx.waitUntil`, porque Meta reintenta si la respuesta tarda. `GET /whatsapp` contesta el desafío de verificación de Meta.
4. **Interpretar:** el texto (o la transcripción) pasa por el mismo `buildAiMessages` y `parseAiResult` del dictado, con las cuentas y categorías del usuario leídas de Firestore. Usa la misma cuota diaria.
5. **Confirmar antes de guardar:** el bot responde con el resumen ("Gasto de $18.000 en Comida, Efectivo, hoy. ¿Lo guardo? sí/no"). Lo pendiente queda en KV por 10 minutos. Si falta algún dato, el bot lo dice y no ofrece guardar.
6. **Escribir en Firestore por REST** con una **cuenta de servicio** (no hace falta Cloud Functions). El token de Google se firma con `jose` y se guarda en KV mientras dura (1 hora). Antes de escribir, el movimiento se valida con `src/domain/`. Se escribe con `source: 'whatsapp'` y `updatedAt` = hora del servidor (`REQUEST_TIME`), porque es el cursor de la sincronización. Así la app lo recibe por su listener, como si viniera de otro dispositivo.
7. **Secretos con `wrangler secret`:** el token de Meta, el *app secret*, el token de verificación del webhook y la clave de la cuenta de servicio. Nunca van al repo.
8. **Privacidad:** sumar a Meta (WhatsApp) en la sección y avisar que Meta ve los mensajes que recibe el bot.
9. **Pasos manuales del dueño:** crear la app en Meta y el token permanente, verificar los números de la familia, crear la cuenta de servicio en Google Cloud con el rol mínimo de Firestore, y cargar los secretos.

## Consecuencias
- **El Worker pasa a escribir en Firestore** con una cuenta de servicio que saltea las reglas. Por eso valida con el dominio, y sus tests tienen que cubrir que rechaza lo inválido. La clave de la cuenta de servicio es el secreto más sensible del proyecto.
- **Plan gratis de Workers:** cada pedido tiene 10 ms de CPU. Esperar a la IA o a Meta no cuenta, pero firmar el JWT de Google sí. Por eso el token se reutiliza en vez de firmarlo en cada mensaje.
- **Hasta 5 números** con el número de prueba. Para sumar más hace falta registrar un número propio.
- **Sumar un familiar** suma un paso: verificar su número en Meta, además de los hashes (ADR 0026 y 0031).
- **Meta ve los mensajes** que recibe el bot. Lo dice la sección Privacidad.
- **El SRS 4.9 se actualiza en la 11b** con el detalle de `whatsappLinks` y el flujo de vinculación.
