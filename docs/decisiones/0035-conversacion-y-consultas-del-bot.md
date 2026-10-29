# ADR 0035 — Conversación, consultas y charla del bot de WhatsApp

- **Estado:** aceptada
- **Fecha:** 2026-10-24
- **Fase:** 11e (conversación y consultas)
- **Modifica:** ADR 0034 (cuota diaria de 100; "sí" y "no" solo confirman si hay un movimiento esperando)

## Contexto
La 11d dejó un bot que cargaba un movimiento por mensaje. Cada mensaje era un caso aislado: si faltaba la cuenta, el bot decía qué faltaba y había que reescribir todo; y todo lo que no fuera un movimiento ("hola", "cuánta plata tengo") recibía "No entendí el movimiento". El dueño pidió tres cosas:
1. Que el bot **siga el hilo**: si pregunta algo, que se pueda contestar y que junte las dos partes.
2. Que **responda consultas**: cuánta plata tengo, cuánto gasté hoy, cuánto queda en una cuenta, cuáles son mis cuentas.
3. Que **razone qué responder** ante cualquier mensaje, incluso un saludo.

Restricciones: el plan Spark de Firebase (leer poco), el plan gratis de Workers (50 subpedidos y 10 ms de CPU por pedido) y la regla de que los montos no se calculan con decimales ni se inventan.

## Alternativas

### Entender el mensaje
1. **Reglas fijas (palabras clave).** Barato y predecible, pero no entiende "cuánto me quedó en el Mercado Pago" o "gasté 18 lucas con efectivo y 2 de nafta". Queda como **respaldo** sin IA.
2. **La IA clasifica la intención y extrae los datos (elegida).** Una sola llamada a Llama 3.3 devuelve `intent` (movimiento, consulta, saludo, gracias, ayuda, otra cosa) más los datos de cada caso.
3. **La IA responde con texto libre a todo.** Natural, pero puede inventar saldos, dar consejos de inversión o gastar cuota en charla. Descartada.

### Calcular las consultas
1. **Que la IA conteste con los números.** Descartada: los montos no pueden depender de un modelo, y habría que mandarle los saldos.
2. **El dominio calcula con los datos leídos (elegida).** La IA solo dice *qué* se pregunta (tipo de consulta, cuenta, categoría, período). Los números salen de `computeStats` y de las sumas de Firestore, y las respuestas se escriben con `formatAmount`.

### Leer los saldos
1. **Traer todos los movimientos y usar `computeBalances`.** Una lectura por documento: con miles de movimientos, unas pocas consultas gastarían las 50.000 lecturas diarias de Spark.
2. **Consultas de agregación de Firestore (`sum`) (elegida).** 1 lectura cada 1.000 entradas del índice. Seis sumas por cuenta (ingresos, gastos, transferencias enviadas y recibidas, cambios enviados y recibidos).

## Decisión

### Una llamada, una intención
`buildBotMessages` y `BOT_RESPONSE_SCHEMA` (en `src/domain/voice/botPrompt.ts`) amplían el prompt del dictado sin tocarlo: reutilizan sus reglas de movimientos (`MOVEMENT_RULES`) y suman la clasificación. La respuesta se valida en `parseBotIntent`:
- una intención que no existe, un tipo de consulta inventado o un ID que no es de la persona se descartan;
- un período raro es "este mes";
- si algo no cierra, devuelve `null` y el bot usa el **parser de reglas** (`rulesIntent`), que también cubre cuota agotada o IA caída.

**La IA nunca recibe saldos ni montos del usuario**: solo la fecha y los nombres e IDs de cuentas y categorías, como en el dictado.

### Charla "solo lo suyo" (decisión del dueño)
- Saludo, gracias y ayuda usan **textos fijos** (varios, elegidos según el ID del mensaje). Se reconocen con una regla (`quickIntent`) **antes** de gastar cuota o leer Firestore.
- Solo `other` usa una frase corta del modelo (hasta 280 caracteres), con reglas en el prompt: español rioplatense, sin cifras ni datos de la persona, sin consejos de inversión, sin prometer nada. Si viene vacía, larga o con algún dígito, se usa un texto fijo.

### Seguir el hilo
- Si falta un dato, el bot **pregunta de a uno**, en este orden: tipo, monto, monto de destino, cuenta, cuenta destino, categoría. La pregunta empieza por lo ya entendido ("Gasto de $ 18.000,00. ¿De qué cuenta?").
- Si el dato se puede elegir, la pregunta lleva **botones** (hasta 3) o una **lista desplegable** (hasta 10 filas). El ID viaja como `elegir:{campo}:{id}`. Tocar una opción completa el borrador **sin volver a llamar a la IA**.
- Si la persona contesta **escribiendo**, la IA recibe el mensaje nuevo junto al anterior (`previous`) y decide si lo completa o es otra cosa (una consulta, un saludo, otro movimiento). Sin IA, las reglas prueban los dos textos pegados.
- El borrador vive en el KV como `borrador:{número}` por 10 minutos. Borrador y pendiente no conviven. A la tercera pregunta sin resolver, el bot desiste y muestra un ejemplo.
- "sí" y "no" solo son una confirmación **si hay un movimiento esperando**; sin pendiente son charla.

### Consultas
| Consulta | Cómo se calcula |
|---|---|
| Cuentas | Lista de cuentas activas con su moneda. |
| Saldos | Seis sumas de agregación por cuenta (`accountBalances.ts`), verificadas contra `computeBalances`. Hasta 6 cuentas por respuesta. |
| Gasto, ingreso, resumen, por categoría | `runQuery` por rango de `date` y `computeStats`. Una cuenta o categoría nombrada filtra antes de sumar. Tope de 5.000 documentos. |

Períodos: hoy, ayer, esta semana (desde el lunes), este mes, el mes pasado y este año.

### Cuota
Un solo contador por persona (`uso:{uid}:{día}`) compartido con el dictado de la app, que pasa de **40 a 100** por día. Un mensaje gasta una unidad si pasa por la IA; un audio gasta una sola (Whisper y Llama juntos). Saludos, gracias y ayuda no gastan.

## Consecuencias
- **Tres índices compuestos nuevos** en `firestore.indexes.json` (`accountId`/`toAccountId`, `deletedAt`, `type` y `amount`/`toAmount`). Las sumas fallan sin ellos. Se publican con `npx firebase deploy --only firestore:indexes --project prod`.
- **Los saldos viajan por WhatsApp**, es decir, Meta los ve. La sección Privacidad se actualiza en la 11f.
- **Límites del plan gratis de Workers:** el saldo de cada cuenta son 6 sumas, así que hasta 6 cuentas por respuesta (36 sumas más el resto de los subpedidos, contra el límite de 50). Con más cuentas, el bot da el **total de cada moneda** sumando todas juntas con filtros `IN` (6 sumas por moneda, hasta 30 cuentas por consulta) e invita a preguntar por una cuenta. Se verificó contra Firestore real: los totales coinciden con la suma de saldos de la app.
- **Lecturas de Firestore:** una consulta de período lee un documento por movimiento del período (un mes son unos cientos). Los saldos casi no cuestan.
- **El respaldo por reglas es más limitado que la IA** (no entiende cualquier frase), pero cubre saludos, ayuda, cuentas, saldos y los períodos más comunes.
- **Variables:** `DAILY_LIMIT` pasa a 100 en `wrangler.jsonc`. No hay secretos nuevos.
- **Claves nuevas en el KV `WHATSAPP`:** `borrador:{número}` (10 minutos).
- **Queda para la 11f:** Privacidad, SRS 4.9 y el cierre del #46.

## Nota (prueba con el modelo real, 2026-10-24)
Antes de publicar se probó el prompt contra Llama 3.3 70B real, con 25 mensajes, desde un Worker descartable con `wrangler dev` (IA remota). Cada llamada tardó entre 2 y 5,5 segundos.
- **Intención:** acertó en todos los casos: saludos, gracias, ayuda, las ocho consultas probadas (cuentas, saldo total y de una cuenta, gasto de hoy, de la semana y de una categoría, por categoría del mes pasado, resumen del año, ingresos) y los movimientos (gasto, ingreso, transferencia y cambio).
- **Fuera de tema:** "quién ganó el partido", "cuánto está el dólar" y "me conviene comprar dólares" recibieron una frase corta que dice que solo ayuda con las finanzas, sin consejos.
- **Hilo:** "con efectivo" y "en comida" completaron un movimiento incompleto; "cuánto tengo" a mitad de un movimiento se tomó como una consulta.
- **Cuenta no nombrada:** con dos cuentas en pesos, "gasté 18 mil en el súper" quedó sin cuenta y el bot pregunta (la defensa de `parseAiResult` sigue funcionando).
- Un caso mejorable, que no cambia con este ADR: la IA puso "nafta" en Comida y no en Transporte. Se ve en el resumen antes de guardar.
- **Paso 0:** las sumas de agregación coinciden con los saldos de la app en las 8 cuentas del dueño. Hizo falta crear los índices compuestos.
