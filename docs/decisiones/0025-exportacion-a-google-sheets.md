# ADR 0025 — Exportación a Google Sheets

- **Estado:** aceptada
- **Fecha:** 2026-10-05
- **Fase:** 6b (Google Sheets)
- **Modifica:** SRS 7.4, 8.4 y 13

## Contexto
El SRS 8.4 pide un botón "Exportar a Google Sheets" que cree una hoja en el Drive del usuario o actualice la que ya creó, con las mismas tablas que el CSV (ADR 0024). Para escribir en Drive hace falta un **token de acceso** de Google con un permiso (*scope*) que lo autorice. Había que decidir:
- **Cómo se pide ese permiso** y cuál.
- **Cómo se escribe** para que la hoja nunca quede vacía o a medias si algo falla.
- **Cómo se ven** los montos y las fechas.

## Alternativas
**Permiso**
1. **Google Identity Services (GIS)**, el "token client": un popup aparte del login que pide solo el permiso de Drive, en el momento de exportar.
2. **Volver a iniciar sesión con Firebase** sumando el scope: no necesita otro script, pero mezcla el login con la exportación y repite el inicio de sesión cada vez que el token vence (1 hora).

**Escritura**
1. **Escribir y después limpiar** (lo que proponía el SRS): primero los datos nuevos desde la fila 1 y después borrar las filas sobrantes, en pedidos separados.
2. **Un solo `batchUpdate`** con todo: Google aplica la lista de cambios entera o no aplica nada.

## Decisión
- **GIS con el scope `drive.file`** (alternativa 1, elegida por el dueño). `drive.file` solo deja tocar los archivos que creó la app: no ve el resto del Drive. Google lo considera un permiso **no sensible**, así que publicar la app (Fase 9) no requiere la verificación larga.
  - *Nota (ADR 0029):* la app no se publica; es solo para la familia.
- **Se reutiliza el Client ID web que creó Firebase** ("Web client (auto created by Google Service)"), en la variable `VITE_GOOGLE_CLIENT_ID`. No es un secreto: viaja a cada navegador. Sin la variable, el botón no aparece.
- **El script de Google se precarga al mostrar la tarjeta.** El navegador solo deja abrir un popup durante el toque de un botón; si antes hubiera que esperar la descarga del script, lo bloquearía. Por la misma razón, al tocar el botón lo primero que se hace es pedir el token, sin ninguna espera antes.
- **`login_hint` con el email de la sesión**, para que Google sugiera la misma cuenta. Con el consentimiento por partes, la persona puede destildar el permiso de Drive y Google igual devuelve un token; la app lo comprueba con `hasGrantedAllScopes`.
- **El token se guarda solo en memoria** hasta que vence (con un minuto de margen): una segunda exportación no abre otro popup. Si Google responde 401, se olvida.
- **Un solo `batchUpdate` atómico** (alternativa 2) con las tres pestañas. Por pestaña: agrandar la grilla si hace falta, escribir desde A1, dar formato por columna, y dejar la grilla con las filas justas (así desaparecen las filas viejas). Cumple el objetivo del SRS 8.4 (la hoja nunca queda vacía) mejor que el orden de dos pasos.
- **Qué hoja se usa:** la de `sheetsSpreadsheetId` del perfil. Si no existe, no hay acceso (404/403) o está en la papelera (lo dice la API de Drive: la de Sheets la abre igual), se crea "Control de Finanzas — Exportación" y se guarda el nuevo ID. Si falta una pestaña, se vuelve a crear.
- **Formato:** la hoja se crea con la configuración regional `es_AR` (muestra `1.234,56` y `04/10/2026`). Las fechas van como fechas (`dd/mm/yyyy`) y los montos como **número** con dos decimales (`#,##0.00`), no como moneda: en una misma columna hay filas en pesos y en dólares, y la columna Moneda lo indica. El formato va por columna y no por celda, para que con 10.000 movimientos el pedido no pese varios MB.
- **El monto como decimal** (`centavos / 100`) existe solo en el valor que se manda a Sheets. Es una salida, como mostrarlo en pantalla: la app no lo vuelve a leer ni lo suma (regla 1).
- Los textos van como `stringValue`: Sheets nunca los interpreta como fórmulas.

## Consecuencias
- El usuario ve dos consentimientos de Google (el login y el de Drive); la tarjeta lo avisa: "Google te va a pedir permiso para crear y editar esta hoja en tu Drive".
- Exportar a Sheets requiere conexión: el botón se deshabilita sin ella.
- Tareas manuales (SRS 13): habilitar las APIs de Sheets y Drive, agregar el scope a la pantalla de consentimiento y autorizar los orígenes (con el puerto, `http://localhost:5173`) en el Client ID. La pantalla de consentimiento ya está en producción (Firebase la publicó para el login) y se deja así: en modo prueba, solo los usuarios de prueba podrían iniciar sesión. Como `drive.file` no es sensible, sumarlo no requiere verificación.
- **Fase 7:** cuando se agregue una Content-Security-Policy, tiene que permitir `accounts.google.com` (script y popup), `sheets.googleapis.com` y `www.googleapis.com`. El dominio de Hosting se suma a los orígenes autorizados.
- **Fase 8:** dentro del APK el permiso y la exportación funcionan (ADR 0028).
- Los tests no hablan con Google: los unitarios usan un `fetch` falso y los E2E reemplazan el script y las APIs.
