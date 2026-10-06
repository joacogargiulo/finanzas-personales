# ADR 0030 — Cómo se implementa "Borrar mi cuenta"

- **Estado:** aceptada
- **Fecha:** 2026-10-06
- **Fase:** 9a (Borrar mi cuenta)
- **Completa:** ADR 0006

## Contexto
El ADR 0006 fijó los pasos de "Borrar mi cuenta":
1. Volver a iniciar sesión.
2. Borrar los documentos en lotes, con los IDs de la caché.
3. Borrar el perfil, después el usuario de Auth y por último la caché local.
4. Que el proceso se pueda retomar si se corta.

Al implementarlo aparecieron cinco problemas que el ADR no resolvía:
- **Inicio de sesión reciente:** Firebase solo deja borrar el usuario de Auth (`deleteUser()`) si el último inicio de sesión tiene menos de 5 minutos. Si no, responde `auth/requires-recent-login`.
- **Popup bloqueado:** volver a iniciar sesión con un redirect recarga la página, y el proceso se pierde.
- **IDs incompletos:** los IDs salen de la caché. Si el dispositivo no está al día, faltan los documentos creados en otros dispositivos.
- **Siembra:** cuando el perfil desaparece, la sesión cree que el usuario es nuevo y vuelve a sembrar las categorías iniciales (ADR 0004).
- **Pantalla:** al borrar el usuario de Auth, Firebase cierra la sesión y Ajustes desaparece. El aviso de "listo" tiene que mostrarse en otro lado.

## Alternativas
**Para el inicio de sesión reciente:**
1. **Pedirlo siempre:** simple, pero molesto si recién se inició sesión.
2. **Probar `deleteUser()` y pedirlo si falla:** para ese momento ya se borraron los datos. Si la persona cancela, queda una cuenta vacía con el usuario de Auth vivo.
3. **Mirar `authTime` del token antes de empezar:** se pide de nuevo solo si hace falta, y antes de borrar nada.

**Para el progreso:**
1. **No esperar los `commit()`**, como en el resto de la app: no hay forma de saber cuánto falta ni cuándo terminó.
2. **Esperar cada `commit()`:** muestra el progreso y el final.

## Decisión
- **Condiciones para empezar** (`canStartDeletion`, en el dominio): el dispositivo está al día con el servidor y no hay cambios pendientes. Si no, el botón queda deshabilitado y dice por qué.
- **Inicio de sesión reciente (alternativa 3):** se lee `authTime` con `getIdTokenResult()`.
  - Si tiene 4 minutos o más (`needsReauth`), se pide con `reauthenticateWithPopup` y `login_hint` con el email de la sesión. El margen de un minuto evita que venza mientras se borran los datos.
  - Si el navegador bloquea el popup, se usa `reauthenticateWithRedirect`. Al volver, el inicio de sesión ya es reciente y, al tocar de nuevo "Borrar", no se pide.
  - Si se elige otra cuenta de Google (`auth/user-mismatch`), se avisa y no se borra nada. Si se cierra la ventana, se vuelve a Ajustes sin error.
- **Lotes** (`deletionPlan`): hasta 500 documentos por `writeBatch`, mezclando colecciones. Las lápidas también se borran.
- **Excepción a la regla de no esperar escrituras:** acá sí se espera cada `commit()` (alternativa 2). El flujo exige conexión y la UI de datos sigue actualizándose por los listeners. Si la señal se corta a mitad, el lote queda en la cola de Firestore y la promesa se resuelve cuando vuelve.
- **Orden:**
  1. Lotes.
  2. Se detiene la sincronización. Así no se dispara la siembra.
  3. Perfil.
  4. `deleteUser()`.
  5. Preferencias del dispositivo (el tema) y caché de Firestore. Las cotizaciones quedan porque son del dispositivo, no de la persona.
- **Estado en el store** (`accountDeletion`, fuera de `UserState`): `App.tsx` muestra `DeletingAccountScreen` mientras exista, aunque la sesión se haya cerrado. Las etapas son confirmar la cuenta, borrar (con progreso), listo y error.
- **Errores** (`deletionFailure`): cuota diaria agotada (`resource-exhausted`), otra cuenta, inicio de sesión vencido, sin conexión y desconocido. Todos dicen que al repetir sigue desde donde quedó.
- **Confirmación reforzada:** escribir `BORRAR`. El diálogo aclara que no se borran la cuenta de Google ni la hoja de Sheets del Drive, y sugiere descargar antes el respaldo JSON.

## Consecuencias
- **Si se corta antes del perfil,** la cuenta sigue funcionando con lo que quedó. Al repetir, la caché ya no tiene lo borrado y el plan sale solo con lo que falta (está testeado con el emulador).
- **Si se corta entre el perfil y `deleteUser()`** (por ejemplo, si cerrás la app justo en ese momento), al volver a abrirla la siembra recrea el perfil y las 6 categorías. Repetir "Borrar mi cuenta" lo termina. Es poco probable, porque el inicio de sesión reciente se verifica antes de empezar.
- **Con la app abierta en otra pestaña,** `clearIndexedDbPersistence()` falla. La cuenta igual queda borrada en el servidor; la copia local se borra en el próximo cierre de sesión.
- **Con el emulador** (tests E2E) el inicio de sesión siempre es reciente: el popup no se prueba de forma automática. Se prueba a mano en producción con una cuenta de prueba que esté en la lista.
- **Un usuario con miles de movimientos** gasta esa cantidad de borrados de la cuota diaria del proyecto (20.000 en Spark, ADR 0006).
