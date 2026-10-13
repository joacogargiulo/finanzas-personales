# ADR 0033 — El vínculo de WhatsApp vive en un KV del Worker

- **Estado:** aceptada
- **Fecha:** 2026-10-13
- **Fase:** 11c (vincular el número de WhatsApp)
- **Modifica:** ADR 0010 (`whatsappLinks`) y 0032 (paso 2 del plan); SRS 4.9, 7.2.1, 7.3 y 11.2

## Contexto
Para que el bot de WhatsApp (ADR 0032) sepa a quién cargarle un movimiento, cada número tiene que estar vinculado con un usuario. El ADR 0010 y el SRS 4.9 habían reservado una colección raíz de Firestore, `whatsappLinks/{telefono}`, cerrada al cliente: solo la iba a leer y escribir el servidor con una cuenta de servicio.

Al planificar la 11c apareció que el único que usa ese dato es el Worker, y que hay otro lugar donde guardarlo: **Workers KV**, el almacén clave → valor de Cloudflare que el Worker ya usa para la cuota del dictado (ADR 0031).

## Alternativas

### 1. Firestore (`whatsappLinks/{telefono}`), lo decidido antes
- A favor: ya estaba en el SRS, el ADR 0010 y las reglas (con un test). Es durable y se ve en la consola de Firebase.
- En contra:
  - Adelanta a la 11c la cuenta de servicio de Google, su clave privada y la firma del token (un JWT que dura una hora). Hace falta en la 11d para escribir movimientos, pero vincular no la necesita.
  - Cada mensaje al bot gasta una lectura de Firestore para saber de quién es el número. En el plan Spark sobra, pero va contra "leer poco".
  - Para mostrar en Ajustes qué número tiene la persona hace falta la búsqueda al revés (uid → número): un segundo documento o una consulta por REST.
  - Firmar el token gasta CPU, y el plan gratis de Workers da 10 ms por pedido.

### 2. Workers KV, un namespace nuevo (`WHATSAPP`)
- A favor:
  - Simple: dos claves por vínculo, `tel:{número}` → uid y `uid:{uid}` → número.
  - Vincular no necesita la cuenta de servicio, que queda toda para la 11d.
  - No gasta lecturas de Firestore. KV gratis da 100.000 lecturas y 1.000 escrituras por día.
  - Igual de cerrado que la colección: solo el Worker lo puede leer o escribir.
- En contra:
  - **Consistencia eventual:** un cambio puede tardar hasta 60 segundos en verse en todos los servidores de Cloudflare. Si alguien desvincula, el bot puede seguir reconociendo el número durante un minuto.
  - No hay una consola cómoda para verlo (se mira con `wrangler kv key list`).
  - Si se borrara el namespace, se perderían los vínculos. No son datos financieros: se rehacen vinculando de nuevo.

## Decisión
**El vínculo vive en el KV `WHATSAPP` del Worker** (el dueño lo eligió el 2026-10-13). Es un dato chico del servidor, que se rehace fácil, y no vale la pena sumar Firestore y la cuenta de servicio solo para eso.

Claves del KV:

| Clave | Valor | Vence |
|---|---|---|
| `codigo:{código}` | uid | 10 minutos |
| `tel:{número}` | uid | no |
| `uid:{uid}` | número | no |
| `fallos:{número}` | códigos equivocados | 1 hora |
| `msg:{id del mensaje}` | `1` (ya se procesó) | 1 día |

El número es el `wa_id` que manda Meta: solo cifras, con el código de país (por ejemplo, `5491123456789`).

### Flujo
1. En Ajustes → WhatsApp, "Vincular WhatsApp" pide `POST /whatsapp/codigo` (token de Firebase y lista de emails, como el dictado). El Worker sortea un código de 6 cifras con `crypto.getRandomValues` y lo guarda por 10 minutos.
2. La app muestra el código y un botón que abre WhatsApp con "vincular 123456" ya escrito (`wa.me`).
3. El webhook recibe el mensaje y, si el código existe, guarda las dos claves, borra el código y contesta "Listo". Un usuario tiene un solo número y un número es de un solo usuario: vincular otro reemplaza el anterior.
4. Después de 5 códigos equivocados en una hora, ese número no puede vincular hasta que pase la hora. Así nadie puede probar códigos al azar.
5. `GET /whatsapp/vinculo` devuelve el número con el medio oculto (`+54 ••• 6789`) y `DELETE /whatsapp/vinculo` desvincula.
6. **"Borrar mi cuenta" desvincula primero**, antes de borrar cualquier dato. Si no puede, se corta sin borrar nada: un vínculo que quedara apuntando a una cuenta borrada dejaría al bot escribiendo en ella.

### El webhook en la 11c
El webhook (`GET` y `POST /whatsapp`) se programa en esta fase, para poder vincular de verdad. Verifica la firma HMAC de Meta, responde 200 enseguida y procesa con `waitUntil`, y descarta los mensajes repetidos. Por ahora solo entiende "vincular NNNNNN". A cualquier otro mensaje responde que el número no está vinculado o que todavía no sabe cargar movimientos (eso llega en la 11d).

## Consecuencias
- **Se saca `whatsappLinks` de las reglas de Firestore y del SRS.** Sigue cerrada igual, porque las reglas niegan todo lo que no permiten, y el test de reglas lo sigue comprobando.
- **Desvincular puede tardar hasta un minuto** en llegar al bot. Para una familia alcanza.
- **El número en Argentina:** Meta manda los celulares con un 9 (`549…`), pero a veces solo acepta responder sin ese 9 (`54…`). Si Meta contesta que el número no está permitido (error 131030), el Worker reintenta sin el 9. Se confirma en la prueba en producción.
- **Un KV más** que crear a mano (`npx wrangler kv namespace create WHATSAPP`), con su ID en `worker/wrangler.jsonc`.
- **Tres secretos nuevos** en el Worker: `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`.
- La sección Privacidad y el detalle del SRS 4.9 se completan en la 11e.

## Nota (prueba en producción, 2026-10-13)
Se configuró la app de Meta con el número de prueba, se publicó el Worker y se probó desde el celular del dueño, con la app corriendo en `localhost` contra el Firebase real.

| Prueba | Resultado |
|---|---|
| Verificación de la URL (`GET /whatsapp`), token equivocado, firma falsa y pedido de código sin sesión | Desafío devuelto, 403, 401 y 401 |
| "hola" desde un número sin vincular | Responde "no está vinculado" |
| Vincular con el código de Ajustes | Responde "¡Listo!" y Ajustes muestra el número enmascarado |
| "hola" desde el número vinculado | Responde "todavía no sé cargar movimientos" |
| Desvincular y volver a escribir | Responde "no está vinculado" |
| Vincular con la cuenta de prueba y borrarla | Termina en "Tu cuenta se borró" y el bot responde "no está vinculado" |

Lo que se aprendió al configurar Meta:
- **Hacen falta dos suscripciones.** Configurar el webhook en el panel suscribe la *app* a los campos (entre ellos `messages`), pero la *cuenta de WhatsApp Business* también tiene que suscribirse a la app: `POST /{id de la cuenta}/subscribed_apps` con el token. Sin eso, el botón "Probar" del panel llega al Worker, pero los mensajes reales no.
- **El token del Worker es el de un usuario del sistema** (rol Empleado, caducidad "Nunca", permisos `whatsapp_business_messaging` y `whatsapp_business_management`). El del "Paso 1. Pruébalo" vence a las 24 horas.
- **El panel usa la Graph API v25.0** para WhatsApp. Se fijó esa versión en `GRAPH_API_VERSION`.
- **El 9 de Argentina no dio problemas:** las respuestas llegaron sin errores en los logs. El reintento sin el 9 queda por si hace falta con otro número.
- El MCP oficial de Meta (`whatsapp_business_tools`) se agregó a Claude Code, pero no llegó a usarse: necesita el inicio de sesión con `/mcp`, y todo se pudo hacer desde el panel.
