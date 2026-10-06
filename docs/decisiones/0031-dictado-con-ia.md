# ADR 0031 — Dictado con IA

- **Estado:** aceptada
- **Fecha:** 2026-10-06
- **Fase:** 10 (dictado con IA)
- **Modifica:** ADR 0015, 0023 y 0026; SRS 6.7 y 7.4

## Contexto
Según el ADR 0029, con conexión el dictado tiene que interpretarse siempre con IA. El parser de reglas (ADR 0015) queda para cuando no hay conexión o la IA falla. Restricciones:
- **Firebase en plan Spark:** no hay Cloud Functions. Hace falta otro servidor que guarde la clave de la IA y controle quién la usa.
- **App privada (ADR 0026):** solo la familia puede usar la IA. La cuota gratis es de toda la cuenta: si se agota, nadie tiene IA hasta el día siguiente.
- **Montos en centavos enteros** (regla 1): un modelo de lenguaje no garantiza el formato de los números.
- **La IA se equivoca:** puede inventar IDs, elegir una categoría del tipo equivocado o una fecha futura.

## Alternativas
**Dónde corre:**
1. **Cloudflare Workers + Workers AI:** gratis (10.000 "neuronas" por día y 100.000 pedidos por día al Worker), sin servidor que mantener, y el modelo corre en la misma red.
2. **La API de Gemini desde el cliente:** su plan gratis usa los datos para entrenar modelos, y la clave quedaría expuesta en la app.
3. **Un servidor propio:** hay que mantenerlo, y gratis no hay ninguno confiable.

**Modelo** (decisión del dueño):
1. **Llama 3.3 70B** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`): entiende mejor el rioplatense. Cuesta unas 40 neuronas por dictado, así que alcanza para unos 240 por día.
2. **Llama 3.1 8B:** unas 7 neuronas por dictado, pero se equivoca más.

## Decisión
- **Un Worker de Cloudflare** (alternativa 1) en `worker/`, con el modelo **Llama 3.3 70B** y salida JSON con esquema (`response_format: json_schema`) y `temperature: 0`. El modelo es una variable de `wrangler.jsonc`, así se cambia sin tocar el código.
- **`POST /interpretar`**, que recibe la frase, la fecha de hoy, y las cuentas y categorías activas (ID, nombre, y moneda o tipo). **Nunca saldos ni movimientos.** Los controles van del más barato al más caro:
  1. **CORS:** solo la app publicada y `localhost:5173`.
  2. **Token de Firebase:** el JWT se verifica con `jose`, con las claves públicas de Google (JWKS). Se comprueban el emisor y la audiencia del proyecto, el vencimiento y `email_verified`. Si falla, 401.
  3. **Lista de emails:** los mismos hashes SHA-256 que `firestore.rules`. Si el email no está, 403. Un test compara las dos listas.
  4. **Forma y tamaño del pedido** (`validateAiInput`): frase de hasta 300 caracteres, y hasta 100 cuentas y 200 categorías. Si no cumple, 400.
  5. **Cuota:** 40 dictados por persona y por día de Argentina, contados en Workers KV (la clave vence a las 48 horas). Si se pasa, 429.
  6. **La IA:** si falla, 502.
- **El Worker no guarda la frase** ni la escribe en los logs (`observability` apagado).
- **El dominio valida la respuesta** (`parseAiResult`) y la convierte en el mismo `ParsedPhrase` del parser. Así el panel no cambia su lógica:
  - **IDs:** tienen que existir y estar activos.
  - **Categoría:** solo en gastos e ingresos, y del mismo tipo.
  - **Transferencia:** misma moneda en las dos cuentas. **Cambio de moneda:** distinta.
  - **Fecha:** válida y no futura; si no, hoy.
  - **Lo que no cierra** queda en `missing`, para revisar. Si la respuesta no tiene forma, se usa el parser.
- **Montos como texto:** la IA devuelve "18000" o "2500,50" y se convierten con `parseAmount`, el mismo del formulario. Si pone separador de miles ("18.000"), se quita antes.
- **Cambios de moneda dictados** (pedido del dueño): la IA devuelve `amount` (lo que sale) y `toAmount` (lo que entra). `ParsedPhrase` suma el tipo `exchange` y `toAmount`. El parser de reglas sigue sin interpretarlos.
- **Los campos faltantes se calculan con una sola función** (`missingFields`), que comparten el parser y la IA.

## Consecuencias
- **Sumar un familiar** ahora requiere pegar el hash en dos lugares: `firestore.rules` y `worker/src/access.ts`. Se publican las dos cosas (`deploy:rules` y `deploy:worker`). Si alguien se olvida de una, el test lo detecta.
- **Lo que recibe Cloudflare:** la frase dictada y los nombres de las cuentas y categorías. La sección Privacidad lo dice (Fase 10b).
- **Sin conexión, o con la IA caída o la cuota agotada,** el dictado sigue funcionando con el parser, que entiende menos.
- **KV no es transaccional:** dos dictados simultáneos pueden contarse como uno. Para un límite orientativo alcanza.
- **El dueño crea la cuenta de Cloudflare y el KV, y publica el Worker** (los pasos están en el PR de la 10a). Los IDs del KV no son secretos y van en `wrangler.jsonc`.
- **Tests:** el Worker se prueba en Node con dependencias falsas (token, KV e IA). El token se firma con un par de claves generado en el test. La respuesta real del modelo se prueba a mano con `curl`.
