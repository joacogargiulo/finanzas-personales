# ESPECIFICACIÓN DE REQUISITOS DE SOFTWARE (SRS)
## Control de Finanzas Personales — Offline-First con Sincronización Multi-Dispositivo

**Versión:** 3.6.0
**Fecha:** 2026-10-04
**Reemplaza a:** SRS v3.0.0 (y este, a la v2.0.0, generada desde la app de Google AI Studio)
**Destinatario principal:** Claude Code (implementación) y el dueño del proyecto (revisión)

---

## 0. CAMBIOS

### 0.0 Cambios de la versión 3.6.0 (Fase 6a: exportar JSON y CSV)
| Tema | v3.5.1 | v3.6.0 | ADR |
|---|---|---|---|
| Restaurar desde JSON | Reemplaza todos los datos | Fuera de alcance: el JSON es una copia para guardar | 0024 |
| `schemaVersion` del JSON | 3 | El del esquema de los documentos (`SCHEMA_VERSION`) | 0024 |
| Origen de la exportación | Sin especificar | Los datos del dispositivo (sin lecturas); aviso si no está al día | 0024 |
| TC-23 | Exportar y restaurar | Exportar y verificar el contenido del JSON | 0024 |

### 0.0.1 Cambios de la versión 3.5.1 (Fase 5b: dictado)
| Tema | v3.5.0 | v3.5.1 | ADR |
|---|---|---|---|
| Dictado | Parser de frases sin micrófono | Micrófono en el panel de movimiento (Web Speech API), solo al crear y si el navegador lo soporta; precarga y espera Guardar | 0023 |
| Campos dudosos | Sin especificar | "No se entendió, revisalo." junto al campo; la cuenta queda la elegida | 0023 |
| Origen `voice` | Sin especificar | Si el formulario se precargó dictando, aunque después se corrija a mano | 0023 |
| Atajo "Dictar movimiento" | Fase 5 | Fase 7 (con el manifiesto); en la 5b queda la ruta `movimiento=nuevo&dictar=1` | 0023 |

### 0.0.2 Cambios de la versión 3.5.0 (Fase 5a: presupuestos y recurrentes)
| Tema | v3.4.0 | v3.5.0 | ADR |
|---|---|---|---|
| Pendientes en Inicio | Después del total y del resumen | Arriba de todo, porque piden una acción | 0022 |
| Confirmar un pendiente | Modal precargado | Panel con dirección propia (`pendiente=rec_…`), sin selector de tipo | 0022 |
| Saltar un pendiente | Sin confirmación | Con confirmación simple | 0022 |
| Confirmar en dos dispositivos | Mismo ID, mismo `nextDate` | Además, el rechazo del segundo lote por las reglas no se muestra como error | 0004 |

### 0.0.3 Cambios de la versión 3.4.0 (Fase 4: estadísticas y buscador)
| Tema | v3.3.0 | v3.4.0 | ADR |
|---|---|---|---|
| Gráficos de categorías | Tortas con porcentajes y leyenda | Donas con el total en el centro y una lista con ícono, monto y porcentaje; desde la sexta categoría, el resto se agrupa en "Otras" | 0021 |
| Gráficos | Sin especificar | SVG propio, sin librería; la geometría son funciones puras con tests | 0021 |
| Selector de moneda | ARS, USD y EUR | Solo las monedas que tienen alguna cuenta | 0021 |
| Botón Atrás | Cierra los paneles | También cierra los diálogos y el panel de Filtros (capa en el hash) | 0018 |

### 0.0.4 Cambios de la versión 3.3.0 (Fase 3: interfaz)
| Tema | v3.2.0 | v3.3.0 | ADR |
|---|---|---|---|
| Navegación | Sin especificar | Rutas propias por hash; el botón Atrás cierra los paneles | 0018 |
| Tests de la interfaz | Sin especificar | Lógica pura con Vitest, componentes con Testing Library (jsdom) y flujos e2e con Playwright | 0019 |
| Sistema visual | Colores y tipografías (ADR 0001) | Tokens CSS, tema claro/oscuro/automático, fuentes locales, íconos SVG propios y listas fijas de íconos y colores de categoría | 0020 |
| Cambio de moneda | Fase 5 | Fase 3 | 0020 |

### 0.0.5 Cambios de la versión 3.2.0 (Fase 2: datos y login)
| Tema | v3.1.0 | v3.2.0 | ADR |
|---|---|---|---|
| Listeners | Caché + listener `updatedAt > cursor` que alimenta la UI | Dos listeners: uno al servidor que solo llena la caché y otro solo a la caché que alimenta la UI | 0016 |
| Login | Popup en escritorio, redirect en modo instalado | Popup en todos lados, redirect si el popup está bloqueado | 0017 |

### 0.1 Cambios de la versión 3.1.0 (Fase M: modelo de datos)
Se incorporan las decisiones de los ADRs 0002 a 0012 (`docs/decisiones/`). Ante cualquier diferencia, mandan los ADRs.

| Tema | v3.0.0 | v3.1.0 | ADR |
|---|---|---|---|
| Usuarios | Uno solo, con su UID fijo en las reglas | Multiusuario: cada usuario ve solo lo suyo | 0002 |
| Lectura de datos | Listeners sobre colecciones completas | Sincronización incremental: caché local + listener `updatedAt > cursor` | 0003 |
| `updatedAt` | Milisegundos del cliente | Timestamp del servidor | 0003, 0007 |
| Borrar transacciones y presupuestos | Borrado físico | Lápida (`deletedAt`); físico solo en "Borrar mi cuenta" | 0003, 0005, 0006 |
| Archivar | `deletedAt` | `archivedAt` (cuentas y categorías). Las cuentas y categorías sin uso también se pueden eliminar | 0005 |
| Recurrentes | Se archivan | Se eliminan (lápida) | 0005 |
| Siembra | `set()` con IDs fijos | Dentro de `runTransaction`, verificando `seededAt` | 0004 |
| Ediciones | Sin especificar | `update()` solo con los campos que cambiaron | 0004 |
| `settings/main` | Documento de ajustes | Perfil en `users/{uid}` con `schemaVersion` | 0008, 0011 |
| Campos nuevos | — | `kind` (cuentas), `icon` y `color` (categorías), `source` (transacciones) | 0008 |
| Campos según el tipo | Sin especificar | Unión discriminada: los campos que no aplican no existen | 0007 |
| Saldo inicial | Puede ser negativo | ≥ 0 | Plan general |
| Reglas | UID fijo, sin validación | Validación completa de cada documento; la coherencia entre documentos queda en el dominio | 0010 |
| Recurrentes al editar | Sin especificar | Nuevo `nextDate` ≥ al anterior; pendientes con cuenta o categoría archivada no se confirman | 0009 |
| Migraciones | — | Expandir y contraer, migración perezosa, bloqueo de versiones viejas | 0011 |
| Índices | — | Ninguno compuesto | 0012 |

### 0.2 Cambios de la versión 3.0.0 respecto a la 2.0.0

Esta versión mantiene el funcionamiento general de la app actual (pantallas, navegación, flujo de carga) y corrige problemas de diseño detectados en la revisión. Resumen:

| Tema | v2.0.0 (app actual) | v3.0.0 (esta versión) | Motivo |
|---|---|---|---|
| Almacenamiento | IndexedDB local por dispositivo | Firebase Firestore con caché offline persistente | Uso en celular y computadora con los mismos datos |
| Google Sheets | Sync automática completa (fuente de respaldo) | Exportación manual opcional | La base ahora vive en Firestore |
| Login | Solo para Sheets | Obligatorio, con Google (Firebase Auth) | Los datos están en la nube |
| Saldo de cuentas | Campo `balance` guardado y actualizado con rollback & reapply | **Calculado** a partir de las transacciones; no se guarda | Imposible que se desfase |
| Montos | Decimales de JavaScript (float) | Enteros en centavos | Evita errores de redondeo |
| IDs | Autoincrementales | IDs de Firestore generados en el cliente | Dos dispositivos offline no chocan |
| Borrar cuenta/categoría | Borrado en cascada de transacciones y reversión de saldos | **Borrado lógico (archivar)**; el historial queda intacto | Borrar no debe cambiar la plata |
| Cambio de tipo de categoría | Permitido | Bloqueado si la categoría tiene movimientos | Evitaba gastos colgando de categorías de ingreso |
| Compra/venta de divisas | No soportado | Nuevo tipo de movimiento `exchange` | App bimonetaria |
| Separador decimal | Solo punto | Coma o punto | Uso en Argentina |
| Fecha por defecto | Posible fecha UTC | Fecha local del dispositivo | Evita cargar "mañana" después de las 21 hs |
| Sin cotización | Multiplicaba por 0 | Se excluye y se advierte explícitamente | El total no debe mentir |
| Estadísticas | Últimos 6 meses fijos | Período elegible | Pedido del usuario |
| Nuevas funciones | — | Buscador, presupuestos por categoría, movimientos recurrentes | Pedido del usuario |
| Importación | Mencionada pero no especificada | Restaurar desde respaldo JSON | Un respaldo sin importación no sirve |
| Android | PWA instalable | APK (Trusted Web Activity con Bubblewrap) | Pedido del usuario |

---

## 1. INTRODUCCIÓN

### 1.1 Propósito
Especificar los requisitos funcionales, no funcionales, reglas de negocio, modelo de datos e integraciones de la app **Control de Finanzas**, para reconstruirla desde cero con Claude Code.

### 1.2 Alcance
Aplicación web progresiva (PWA) de finanzas personales, **multiusuario**: cualquier persona inicia sesión con Google y ve solo sus datos. Cada usuario la usa desde un celular Android (como APK) y una computadora. Público: Argentina. Plan de Firebase: Spark (gratis), así que la app está diseñada para leer poco. Características principales:

1. Funciona completa sin conexión a internet (después del primer inicio de sesión).
2. Los datos se sincronizan automáticamente entre dispositivos mediante Firebase Firestore.
3. Soporte de tres monedas: ARS (moneda de consolidación), USD y EUR.
4. Cotización del Dólar Blue y Euro Blue (Bluelytics) para estimar el patrimonio total en ARS.
5. Exportación a JSON, CSV y Google Sheets (sin restauración, ADR 0024).

### 1.3 Fuera de alcance
- Datos compartidos entre personas (cada usuario tiene sus datos aislados).
- Tarjetas de crédito con cuotas.
- Notificaciones push.
- Publicación en Google Play.
- Otras cotizaciones además del blue (oficial, MEP, tarjeta).
- ~~Rediseño visual~~: sin efecto. La interfaz se rediseña desde cero (ADR 0001).

### 1.4 Definiciones
- **Offline-first:** la app lee y escribe primero en una copia local; la red se usa para sincronizar, nunca para bloquear al usuario.
- **Centavos:** unidad entera en que se guardan todos los montos. `$ 1.234,56` se guarda como `123456`.
- **Archivar:** marcar una cuenta o categoría con `archivedAt` para ocultarla de los selectores sin eliminarla ni alterar el historial. Se puede restaurar.
- **Lápida:** marcar un documento con `deletedAt` en vez de borrarlo físicamente. Es invisible en la app y sirve para que los otros dispositivos se enteren del borrado (ADR 0003, 0005).
- **Fecha local:** fecha calendario según la zona horaria del dispositivo, en formato `YYYY-MM-DD`.

---

## 2. STACK TECNOLÓGICO

| Capa | Tecnología | Notas |
|---|---|---|
| UI | React 18+ con TypeScript (modo `strict`) | |
| Build | Vite | |
| PWA | `vite-plugin-pwa` (Workbox) | Precache de assets, manifiesto |
| Estado | Zustand (o equivalente liviano) | Alimentado por listeners de Firestore |
| Base de datos | Firebase Firestore (SDK web modular) | Caché local persistente habilitada |
| Autenticación | Firebase Authentication — proveedor Google | |
| Hosting | Firebase Hosting | Mismo dominio que el handler de autenticación |
| Gráficos | La misma librería que usa la referencia si es razonable; si no, Recharts | |
| Estilos | Mantener el enfoque de la referencia (probablemente Tailwind) | |
| Tests | Vitest (lógica de dominio) + Firebase Emulator Suite (reglas de seguridad) | |
| APK Android | Bubblewrap (Trusted Web Activity) | |
| Exportación Sheets | Google Identity Services (token client) + Sheets API v4 | Scope `drive.file` únicamente |

---

## 3. ARQUITECTURA

### 3.1 Capas
El código se organiza en tres capas con dependencias en una sola dirección (`ui → data → domain`):

1. **`src/domain/`** — Lógica de negocio pura en TypeScript. **No importa React ni Firebase.** Contiene: tipos del modelo, cálculo de saldos, consolidación multi-moneda, validaciones, parseo y formateo de montos, fechas locales, cálculo de presupuestos, cálculo de ocurrencias recurrentes, búsqueda y filtros, agregaciones de estadísticas. Todo es testeable con Vitest sin emuladores.
2. **`src/data/`** — Acceso a Firestore y Auth: inicialización, listeners (`onSnapshot`), escrituras, batches, exportaciones/importaciones, cliente de Bluelytics, cliente de Sheets.
3. **`src/ui/`** — Componentes React, pantallas, modales, hooks de presentación.

### 3.2 Flujo de datos (sincronización incremental, ADR 0003 y 0016)
- Cada colección del usuario tiene **dos listeners**:
  - **A la caché** (`onSnapshot(colección, { source: 'cache', includeMetadataChanges: true })`): escucha la colección completa en la caché local, sin costo de lecturas. Recibe al instante las escrituras propias, aunque estén pendientes, y lo que trae el otro listener. **Es la única fuente del store.**
  - **Al servidor** (`where('updatedAt', '>', cursor)`): solo trae a la caché lo que cambió en otros dispositivos. El cursor es el `updatedAt` más alto de los documentos ya confirmados en la caché, menos un margen de 10 minutos. Sin caché, no hay cursor y se descarga todo una vez.
- No alcanza con un solo listener filtrado: un documento con `serverTimestamp()` pendiente no cumple `updatedAt > cursor` hasta que el servidor confirma la escritura (ADR 0016).
- El perfil (`users/{uid}`) se escucha con un listener directo sobre el documento.
- Los datos de los listeners alimentan el store. Todos los valores derivados (saldos, totales, estadísticas, progreso de presupuestos) se calculan con funciones de `domain/` a partir del store.
- Las escrituras se aplican localmente al instante; Firestore las encola y las sube cuando hay conexión.

### 3.3 Reglas críticas de Firestore offline
1. **La UI nunca debe esperar (`await`) la promesa de una escritura** para cerrar un modal o mostrar el resultado. Esa promesa se resuelve recién cuando el servidor confirma; sin conexión quedaría colgada. La UI se actualiza a través de los listeners.
2. Las operaciones que modifican varios documentos a la vez deben usar `writeBatch` para que sean atómicas.
3. Los IDs de documentos nuevos se generan en el cliente (`doc(collection(...)).id`), lo que funciona offline.
4. Configurar la caché con `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager(), cacheSizeBytes: CACHE_SIZE_UNLIMITED }) })`. El tamaño ilimitado es obligatorio para la sincronización incremental (ADR 0003).
5. Escuchar los metadatos (`includeMetadataChanges: true`) para conocer `hasPendingWrites` y `fromCache` y mostrar el estado de sincronización.
6. Las ediciones usan `update()` solo con los campos que cambiaron; `set()` queda para crear documentos (ADR 0004).
7. `updatedAt` se escribe siempre con `serverTimestamp()`. Para mostrar escrituras pendientes se usa `serverTimestamps: 'estimate'`.
8. Las reglas de seguridad no deben rechazar nada que la app legítima pueda haber escrito sin conexión: una escritura rechazada se pierde sin aviso (ADR 0010).

---

## 4. MODELO DE DATOS (FIRESTORE)

Los tipos TypeScript correspondientes están en `src/domain/model.ts`. Decisiones: ADRs 0002 a 0012.

### 4.0 Convenciones
- **Ubicación:** todos los datos del usuario viven en `users/{uid}` y sus subcolecciones (ADR 0002).
- **Montos:** enteros en centavos (`int`), entre 1 y 99.999.999.999.999 salvo que se indique otra cosa (ADR 0007).
- **Fechas calendario:** texto `YYYY-MM-DD`, fecha local.
- **Instantes:**
  - `updatedAt`: timestamp del servidor (`serverTimestamp()`), cursor de la sincronización (ADR 0003).
  - `createdAt`, `archivedAt` y `deletedAt`: milisegundos epoch del cliente (`Date.now()`).
- **Campos comunes** de `accounts`, `categories`, `transactions`, `budgets` y `recurring`: `createdAt` (inmutable), `updatedAt` y `deletedAt` (`null` = existe; con valor = lápida, invisible en la app). Ningún documento se borra físicamente, salvo en "Borrar mi cuenta" (ADR 0006).
- **Unión discriminada:** en los documentos con `type`, los campos que no corresponden a ese tipo **no existen** (no valen `null`). `null` se usa solo en campos que siempre existen y pueden estar vacíos (ADR 0007).
- **IDs:** aleatorios generados en el cliente, salvo los IDs fijos indicados (ADR 0004).

### 4.1 `users/{uid}`: perfil
| Campo | Tipo | Reglas |
|---|---|---|
| `schemaVersion` | int | Versión del esquema; empieza en 1 y nunca baja (ADR 0011) |
| `seededAt` | ms \| null | Momento de la siembra de categorías (4.7) |
| `sheetsSpreadsheetId` | string \| null | ID de la hoja de la exportación a Sheets |
| `createdAt` | ms | Inmutable |
| `updatedAt` | timestamp del servidor | |

### 4.2 `users/{uid}/accounts/{accountId}`
| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | Requerido, 1–50 caracteres, sin espacios al inicio ni al final. Único entre las cuentas activas, sin distinguir mayúsculas (lo controla el dominio "lo mejor posible", ADR 0005). |
| `currency` | `'ARS' \| 'USD' \| 'EUR'` | Requerido. **Inmutable.** |
| `initialBalance` | int (centavos) | Requerido, **≥ 0**. **Inmutable.** |
| `kind` | `'cash' \| 'bank' \| 'wallet' \| 'investment' \| 'other'` | Requerido. Define el ícono. Editable. |
| `archivedAt` | ms \| null | `null` = activa. Solo se archiva con saldo 0 (5.5). |
| `createdAt`, `updatedAt`, `deletedAt` | | Comunes. Solo se elimina si ningún movimiento, presupuesto ni recurrente la usa. |

**No existe campo `balance`.** El saldo se calcula (5.2).

### 4.3 `users/{uid}/categories/{categoryId}`
| Campo | Tipo | Reglas |
|---|---|---|
| `name` | string | Requerido, 1–40 caracteres. Único entre las categorías activas del mismo tipo (lo controla el dominio "lo mejor posible"). |
| `type` | `'income' \| 'expense'` | Requerido. Solo modificable si ningún movimiento, presupuesto ni recurrente la usa (ADR 0009). |
| `icon` | string | Clave de una lista fija de íconos. Si la app no la conoce, muestra uno por defecto. |
| `color` | string | Clave de una paleta fija; el color real depende del tema. |
| `archivedAt` | ms \| null | `null` = activa. |
| `createdAt`, `updatedAt`, `deletedAt` | | Comunes. Solo se elimina si nada la usa. |

### 4.4 `users/{uid}/transactions/{transactionId}`
| Campo | Tipo | Aplica a | Reglas |
|---|---|---|---|
| `type` | `'income' \| 'expense' \| 'transfer' \| 'exchange'` | todos | Requerido |
| `amount` | int > 0 | todos | En la moneda de `accountId` |
| `toAmount` | int > 0 | solo `exchange` | En la moneda de `toAccountId` |
| `date` | `YYYY-MM-DD` | todos | Fecha local; se admiten fechas futuras |
| `description` | string | todos | Puede ser `''`, máx. 200 caracteres |
| `accountId` | string | todos | Cuenta principal u origen |
| `toAccountId` | string | solo `transfer` y `exchange` | Cuenta destino |
| `categoryId` | string | solo `income` y `expense` | Categoría del mismo tipo |
| `source` | `'app' \| 'voice' \| 'whatsapp'` | todos | Origen de la carga. **Inmutable.** |
| `recurringId` | string | opcional | Solo si se generó desde un recurrente |
| `createdAt`, `updatedAt`, `deletedAt` | | todos | Comunes. `createdAt` desempata el orden dentro del mismo día. |

- La moneda **no** se guarda en el movimiento: se obtiene de la cuenta (ADR 0008).
- Eliminar un movimiento es marcar `deletedAt` (lápida). En la interfaz se sigue llamando "eliminar".
- Al editar y cambiar el tipo, se quitan con `deleteField()` los campos que dejan de aplicar.
- ID fijo de las ocurrencias de recurrentes: `rec_{recurringId}_{fechaDeOcurrencia}` (4.6).

### 4.5 `users/{uid}/budgets/{categoryId}_{currency}`
- **ID fijo** `{categoryId}_{currency}`: un solo presupuesto por categoría y moneda, aunque se cree desde dos dispositivos. Uno eliminado se revive al volver a crearlo.

| Campo | Tipo | Reglas |
|---|---|---|
| `categoryId` | string | Categoría de tipo `expense`. Inmutable. |
| `currency` | `'ARS' \| 'USD' \| 'EUR'` | Inmutable. |
| `amount` | int > 0 | Límite mensual en centavos |
| `createdAt`, `updatedAt`, `deletedAt` | | Comunes |

### 4.6 `users/{uid}/recurring/{recurringId}`
| Campo | Tipo | Reglas |
|---|---|---|
| `type` | `'income' \| 'expense' \| 'transfer'` | |
| `amount` | int > 0 | Monto sugerido |
| `accountId` | string | |
| `toAccountId` | string | Solo `transfer` |
| `categoryId` | string | Solo `income` y `expense` |
| `description` | string | Máx. 200 caracteres |
| `frequency` | `'weekly' \| 'monthly' \| 'yearly'` | |
| `startDate` | `YYYY-MM-DD` | Primera ocurrencia |
| `nextDate` | `YYYY-MM-DD` | Próxima ocurrencia pendiente |
| `endDate` | `YYYY-MM-DD` \| null | Opcional |
| `createdAt`, `updatedAt`, `deletedAt` | | Comunes. Los recurrentes se eliminan (lápida), no se archivan. |

### 4.7 Categorías iniciales (siembra)
En el primer inicio de sesión se ejecuta una `runTransaction` que lee el perfil (ADR 0004):
- Si `seededAt` tiene valor, no hace nada.
- Si no, crea el perfil (si no existe, con `schemaVersion: 1`) y las categorías con **IDs fijos**, y marca `seededAt`:
  - Gastos: `seed_comida` (Comida), `seed_transporte` (Transporte), `seed_servicios` (Servicios), `seed_ocio` (Ocio).
  - Ingresos: `seed_salario` (Salario), `seed_otros_ingresos` (Otros Ingresos).
  - Cada una con su `icon` y `color` por defecto.

La transacción necesita conexión, y el primer inicio de sesión siempre la tiene. Si falla, se reintenta en la próxima apertura con conexión.

### 4.8 Lo que no se guarda en Firestore
- **Cotizaciones:** en `localStorage` (clave `exchangeRates`) con la forma `{ USD_ARS: number, EUR_ARS: number, fetchedAt: number }`. Son decimales, no centavos (por ejemplo, `1345.5`).
- **Preferencias de cada dispositivo** (ADR 0008), en `localStorage` con el `uid` en la clave: el tema (claro, oscuro o automático) y el orden manual de las cuentas (opcional; una lista de IDs, con orden por defecto por moneda y nombre).

### 4.9 Colecciones del servidor
- `whatsappLinks/{telefono}` (Fase 11): vínculos entre números de WhatsApp y usuarios. Solo la escribe y lee el servidor; las reglas niegan todo acceso desde el cliente.

### 4.10 Índices
No hay índices compuestos. La única consulta al servidor (`updatedAt > cursor`) usa un índice automático de un solo campo. Opcional: excluir `description` y `name` de la indexación (ADR 0012).

### 4.11 Migraciones de esquema
Se prefieren los cambios aditivos. Un cambio incompatible sigue "expandir → migrar de a poco → contraer a los 60 días". Una app que lee un perfil con un `schemaVersion` mayor que el suyo deja de escribir y pide actualizarse (ADR 0011).

---

## 5. REGLAS DE NEGOCIO

### 5.1 Montos
- **Entrada:** se acepta un número con a lo sumo un separador decimal, que puede ser coma o punto, y hasta 2 decimales. Ejemplos válidos: `1500`, `1500,5`, `1500.50`, `0,99`. Inválidos: `1.500` (3 decimales: se rechaza para no confundir con separador de miles), `1,5,0`, `abc`, `0`, vacío.
- La conversión de texto a centavos debe hacerse **sin aritmética de punto flotante** (separar parte entera y decimal como texto).
- **Visualización:** formato `es-AR`. ARS: `$ 1.234,56`. USD: `US$ 1.234,56`. EUR: `€ 1.234,56`.
- Máximo: 999.999.999.999,99 en cualquier moneda.

### 5.2 Cálculo de saldo de una cuenta
```
saldo(c) = c.initialBalance
         + Σ amount    de income   con accountId = c
         − Σ amount    de expense  con accountId = c
         − Σ amount    de transfer con accountId = c
         + Σ amount    de transfer con toAccountId = c
         − Σ amount    de exchange con accountId = c
         + Σ toAmount  de exchange con toAccountId = c
```
Se calcula siempre a partir de los datos; nunca se persiste.

### 5.3 Validaciones de transacciones
- **income / expense:** cuenta activa; categoría activa del mismo tipo (en edición se admite la categoría ya asignada aunque esté archivada).
- **transfer:** cuenta origen y destino activas, distintas y **de la misma moneda**.
- **exchange:** cuenta origen y destino activas y **de distinta moneda**; `amount > 0` y `toAmount > 0`.
- `date` válida. Se permiten fechas futuras.
- Las transacciones que involucran una **cuenta archivada** se pueden ver pero **no editar ni eliminar** (eso cambiaría el saldo de una cuenta archivada, que debe ser 0). Para modificarlas hay que restaurar la cuenta.
- Estas validaciones dependen de otros documentos, así que las hace **el dominio al escribir**, no las reglas de Firestore (ADR 0010).
- **Tolerancia al leer:** por carreras entre dispositivos sin conexión, pueden aparecer datos incoherentes (un movimiento en una cuenta archivada o eliminada, un nombre repetido). La app nunca se rompe por eso. Muestra el dato con su marca ("archivada", "eliminada" o "Cuenta desconocida" si el documento no existe) y lo incluye en los saldos.

### 5.4 Cambio de moneda (`exchange`)
- Registra una compra o venta de divisas: sale `amount` de la cuenta origen y entra `toAmount` en la cuenta destino.
- **Cotización implícita**, mostrada en el modal mientras se escribe y en el historial:
  - Si una de las dos monedas es ARS: `ARS por unidad de la otra moneda` (ej. sale $130.000, entra US$ 100 → "1 USD = $ 1.300,00").
  - Si es USD ↔ EUR: `EUR por 1 USD`.
- **No cuenta** como ingreso ni gasto en estadísticas ni presupuestos.

### 5.5 Archivar cuentas
- Solo se puede archivar una cuenta si su saldo calculado es **exactamente 0**. Si no, se muestra: *"Esta cuenta tiene un saldo de {saldo}. Transferilo a otra cuenta antes de archivarla."*
- Confirmación reforzada: el botón queda deshabilitado hasta escribir el nombre exacto de la cuenta.
- Una cuenta archivada: no aparece en selectores de carga ni en "Mis Cuentas" del Dashboard; sigue apareciendo con su nombre en el historial, los filtros de historial (marcada "archivada") y las estadísticas.
- Se puede **restaurar** desde Ajustes → Cuentas archivadas. Si ya hay una cuenta activa con el mismo nombre, el mismo diálogo pide otro nombre: *"Ya tenés una cuenta activa llamada {nombre}. Elegí otro nombre para restaurarla."* (ADR 0005).
- Si un recurrente activo la usa, se advierte al archivar (ADR 0009).
- **Eliminar** (lápida) solo se permite si ningún movimiento, presupuesto ni recurrente usa la cuenta; si no, se ofrece archivar (ADR 0005).
- Si por una carrera entre dispositivos una cuenta archivada queda con saldo ≠ 0 (TC-25), Inicio muestra un aviso con el botón "Restaurar cuenta". Ese saldo no se suma al total mientras siga archivada.

### 5.6 Archivar categorías
- Se puede archivar en cualquier momento. No altera saldos ni transacciones.
- Confirmación reforzada escribiendo el nombre exacto.
- Una categoría archivada no aparece en selectores de carga ni en recurrentes nuevos; sigue apareciendo en historial y estadísticas. Restaurable desde Ajustes.
- Si tiene un presupuesto, el presupuesto se oculta mientras esté archivada.
- Si un recurrente activo la usa, se advierte al archivar.
- Al restaurar con un nombre repetido entre las activas del mismo tipo, se pide otro nombre (como en 5.5).
- **Eliminar** (lápida) solo si ningún movimiento, presupuesto ni recurrente la usa.
- **Cambiar el tipo** solo si ningún movimiento, presupuesto ni recurrente no eliminado la usa (ADR 0009).

### 5.7 Consolidación patrimonial
- `S_ARS`, `S_USD`, `S_EUR` = suma de saldos de cuentas **activas** de cada moneda.
- `Total estimado (ARS) = S_ARS + S_USD × USD_ARS + S_EUR × EUR_ARS`, donde cada término solo se suma si existe cotización.
- Si falta una cotización y hay saldo en esa moneda, el total se muestra con una advertencia visible: *"No incluye US$ X por falta de cotización"*.
- Si la cotización tiene más de 24 horas, se muestra la fecha con aviso "desactualizada".
- Cada cuenta USD/EUR muestra debajo `≈ $ {saldo × cotización} ARS` (si hay cotización).

### 5.8 Cotizaciones (Bluelytics)
- `GET https://api.bluelytics.com.ar/v2/latest`. Se usan `blue.value_avg` → `USD_ARS` y `blue_euro.value_avg` → `EUR_ARS`.
- Se consulta al abrir la app y al recuperar conexión, solo si `navigator.onLine` y la cotización guardada tiene más de 1 hora.
- Si la consulta falla, se mantiene la última guardada sin interrumpir al usuario.
- Validar la respuesta: valores numéricos finitos y positivos; si no, descartar.

### 5.9 Presupuestos
- Un presupuesto es un límite **mensual** para una categoría de gasto en una moneda.
- **Gastado del mes** = suma de `amount` de transacciones `expense` con esa categoría, cuya cuenta es de esa moneda y cuya `date` cae en el mes calendario actual.
- Se muestra con una barra de progreso: verde hasta 80 %, amarilla de 80 % a 100 %, roja por encima de 100 % (mostrando cuánto se excedió). **Sin alertas ni notificaciones.**

### 5.10 Movimientos recurrentes
- **No se cargan solos.** La app muestra los pendientes y el usuario confirma o salta cada uno.
- Una ocurrencia está **pendiente** si su fecha es ≤ hoy (fecha local). Si la app no se abrió por un tiempo, se listan todas las ocurrencias pendientes por separado.
- **Confirmar:** abre el modal de transacción precargado (el usuario puede ajustar monto, fecha, descripción). Al guardar, en un mismo `writeBatch`:
  - se crea la transacción con **ID determinístico** `rec_{recurringId}_{fechaDeOcurrencia}` y `recurringId` asignado. La fecha del ID es siempre la de la ocurrencia, aunque el usuario cambie la fecha del movimiento;
  - `nextDate` pasa a ser **la ocurrencia siguiente a la confirmada** (no "la siguiente al `nextDate` actual"), así la operación es idempotente (ADR 0004).
  Si dos dispositivos confirman la misma ocurrencia, escriben el mismo documento y el mismo `nextDate`: no hay duplicado.
- **Saltar:** solo avanza `nextDate`, con el mismo cálculo.
- **Pendiente con cuenta o categoría archivada:** no se puede confirmar. Se muestra *"La cuenta {nombre} está archivada"* (o la categoría), con dos botones: "Editar recurrente" y "Saltar" (ADR 0009).
- **Editar la frecuencia o `startDate`:** el nuevo `nextDate` es la primera fecha del calendario nuevo que sea ≥ al `nextDate` anterior y ≥ al nuevo `startDate`. Así ninguna ocurrencia ya confirmada vuelve a quedar pendiente. Editar el monto, las cuentas, la categoría o la descripción no cambia `nextDate` (ADR 0009).
- **Cálculo de la próxima fecha:**
  - `weekly`: +7 días.
  - `monthly`: mismo día del mes que `startDate`; si ese mes no tiene ese día, último día del mes (ej. inicio 31/01 → 28/02 o 29/02 → 31/03 → 30/04).
  - `yearly`: mismo día y mes; 29/02 en año no bisiesto → 28/02.
- Si `endDate` existe y la próxima fecha la supera, el recurrente queda finalizado (no genera más pendientes).

### 5.11 Fechas
- "Hoy" se calcula con la fecha local del dispositivo (componentes `getFullYear/getMonth/getDate`), **nunca** con `toISOString()`.
- Orden de transacciones: `date` descendente y, dentro del mismo día, `createdAt` descendente.

---

## 6. PANTALLAS Y EXPERIENCIA DE USUARIO

Mantener el aspecto y la navegación de la app actual: header superior y barra inferior fija con 4 pestañas (**Dashboard, Historial, Estadísticas, Ajustes**). Toda la interfaz en español rioplatense. Formularios con floating labels, como la referencia.

### 6.1 Pantalla de inicio de sesión
- Se muestra si no hay sesión. Botón "Continuar con Google".
- Si no hay conexión y no hay sesión guardada: *"Necesitás conexión a internet para iniciar sesión por primera vez."*
- Una vez iniciada, la sesión persiste y la app abre offline sin volver a pedir login.

### 6.2 Header
- Título "Control de Finanzas".
- **Indicador de sincronización:**
  - Sin conexión: ícono de nube tachada, "Sin conexión".
  - Con cambios pendientes: "Sincronizando…" (y la cantidad de cambios pendientes si es posible obtenerla).
  - Sincronizado: ícono discreto de check.
- Avatar con iniciales del usuario de Google; al tocarlo, menú con nombre, email y "Cerrar sesión".

### 6.3 Dashboard
1. **Pendientes de confirmar** (solo si hay recurrentes pendientes), arriba de todo (ADR 0022): lista con fecha, descripción y monto; botones "Confirmar" y "Saltar" (este último con confirmación). Con la cuenta o la categoría archivada, "Editar recurrente" en lugar de "Confirmar".
2. **Tarjeta de total estimado** en ARS, con las cotizaciones usadas y su fecha (y advertencias de 5.7), y los **totales por moneda**.
3. **Resumen del mes:** ingresos y gastos.
4. **Presupuestos del mes** (solo si hay presupuestos): barras de progreso compactas, con el porcentaje en texto.
5. **Mis Cuentas:** cuentas activas con nombre, moneda, saldo y equivalencia en ARS. Botón "+ Agregar cuenta". Si no hay cuentas, estado vacío que invita a crear la primera.
6. **Últimas transacciones:** las 5 más recientes; botón "Ver todas" → Historial.
7. Botón principal "+ Nueva transacción".

### 6.4 Historial
- **Buscador** de texto libre arriba de los filtros. Busca en descripción, nombre de categoría y nombres de cuentas. Sin distinguir mayúsculas ni acentos ("credito" encuentra "Crédito").
- **Filtros combinables:** tipo (Todos, Ingresos, Gastos, Transferencias, Cambios de moneda), cuenta (incluye archivadas, marcadas), categoría (deshabilitada si el tipo es Transferencia o Cambio), fecha desde/hasta, botón "Limpiar filtros".
- **Lista** con carga incremental (50 ítems y "Cargar más", o scroll infinito) para mantener fluidez con muchos movimientos.
- **Cada ítem:**
  - Ícono y color por tipo: ingreso verde, gasto rojo, transferencia azul, cambio violeta (ícono de divisas).
  - Fecha `DD/MM/YYYY`.
  - Título: descripción, o si está vacía, nombre de categoría / "Transferencia" / "Cambio de moneda".
  - Subtítulo: `Cuenta • Categoría` | `De: Origen → A: Destino` | `De: Origen → A: Destino • 1 USD = $ 1.300,00`.
  - Monto: `+ $ X` verde, `− $ X` rojo, `$ X` neutro para transferencias, `− $ X → + US$ Y` para cambios.
  - Acciones editar y eliminar (deshabilitadas con explicación si involucra una cuenta archivada).
  - Etiqueta "(archivada)" junto a cuentas o categorías archivadas.

### 6.5 Estadísticas
- **Selector de moneda:** ARS, USD, EUR; solo las que tienen alguna cuenta, archivadas incluidas (ADR 0021). Solo considera transacciones de cuentas de esa moneda.
- **Selector de período:** Este mes, Últimos 3 meses, Últimos 6 meses (por defecto), Últimos 12 meses, Este año, Personalizado (desde/hasta).
- **Gráfico 1:** barras agrupadas por mes del período, ingresos (verde) vs gastos (rojo).
- **Resumen del período:** ingresos, gastos y balance.
- **Gráfico 2:** dona de gastos por categoría en el período, con el total en el centro y una lista debajo (ícono, nombre, monto y porcentaje). Con más de 5 categorías, quedan las 4 más grandes y el resto se suma en "Otras" (ADR 0021).
- **Gráfico 3:** dona de ingresos por categoría en el período, igual que la de gastos.
- Transferencias y cambios de moneda **no** se incluyen. Las categorías archivadas sí se incluyen.
- Estado vacío si no hay datos en el período.

### 6.6 Ajustes
1. **Cuentas:** lista de activas con Editar (nombre y tipo de cuenta), Archivar y Eliminar (solo si no se usa). Botón "+ Añadir cuenta". Sección colapsable "Cuentas archivadas" con "Restaurar".
2. **Categorías:** lista con etiqueta [Ingreso]/[Gasto], Editar (nombre, ícono y color; tipo solo si no se usa), Archivar, Eliminar (solo si no se usa), "+ Añadir categoría". Sección "Categorías archivadas" con "Restaurar".
3. **Presupuestos:** lista con categoría, moneda y límite. Crear, editar límite, eliminar. Al crear: elegir categoría de gasto activa y moneda; si ya existe esa combinación, se edita la existente.
4. **Movimientos recurrentes:** lista con descripción, monto, frecuencia y próxima fecha. Crear, editar y eliminar (los movimientos ya generados quedan intactos).
5. **Respaldo y exportación:** ver sección 8.
6. **Cuenta de Google:** nombre, email, "Cerrar sesión".

### 6.7 Modales

**Transacción** (crear/editar):
- Selector de tipo: Gasto, Ingreso, Transferencia, Cambio.
- Monto (`inputMode="decimal"`, reglas 5.1). En Cambio, dos montos: "Sale" (moneda de origen) y "Entra" (moneda de destino), y la cotización implícita debajo.
- Fecha (por defecto hoy, fecha local).
- Descripción (opcional).
- Gasto/Ingreso: Cuenta + Categoría filtrada por tipo.
- Transferencia: Origen + Destino (solo cuentas activas de la misma moneda, distintas del origen).
- Cambio: Origen + Destino (solo cuentas activas de distinta moneda).
- Al cambiar el tipo, se limpian los campos que dejan de aplicar.
- Mensajes de validación en español junto a cada campo.

**Cuenta:** nombre; tipo de cuenta (efectivo, banco, billetera virtual, inversión, otra); moneda (solo al crear); saldo inicial (solo al crear; en edición, solo lectura con el texto: *"El saldo inicial no puede modificarse. Para ajustar el saldo, cargá un ingreso o un gasto."*).

**Categoría:** nombre; tipo (bloqueado con explicación si la usa algún movimiento, presupuesto o recurrente); ícono y color.

**Presupuesto:** categoría, moneda, límite mensual. Al editar, solo el límite (categoría y moneda forman el ID).

**Recurrente:** tipo (Gasto, Ingreso, Transferencia), monto, cuentas, categoría, descripción, frecuencia, fecha de inicio, fecha de fin opcional.

**Confirmar recurrente:** el panel de transacción precargado con la ocurrencia, sin selector de tipo (ADR 0022).

**Dictar** (ADR 0023): al crear una transacción, si el navegador soporta la Web Speech API, un botón de micrófono en el encabezado del panel. La frase precarga el formulario (parser del ADR 0015), muestra lo que se escuchó y marca los campos que no se entendieron; nunca guarda sola. Lo guardado lleva `source: 'voice'`. La dirección `movimiento=nuevo&dictar=1` abre el panel escuchando.

**Confirmaciones:** simple para eliminar transacciones; reforzada (escribir el nombre exacto) para archivar cuentas y categorías.

---

## 7. AUTENTICACIÓN Y SEGURIDAD

### 7.1 Firebase Authentication
- Proveedor Google únicamente.
- `authDomain` configurado con el dominio de Firebase Hosting donde se publica la app (ej. `<proyecto>.web.app`), para que el handler de autenticación esté en el mismo dominio que la app.
- Usar `signInWithPopup` y, si el navegador bloquea el popup, `signInWithRedirect` (ADR 0017). **Verificar explícitamente el login dentro del APK** (fase 8).
- Persistencia de sesión local (IndexedDB, la predeterminada del SDK web).

### 7.2 Cerrar sesión
- Si hay escrituras pendientes de sincronizar, advertir: *"Tenés cambios que todavía no se subieron. Si cerrás sesión ahora, se van a perder. ¿Querés esperar a tener conexión?"*
- Al cerrar sesión: detener listeners, `terminate()` de Firestore, `clearIndexedDbPersistence()`, limpiar el store y volver a la pantalla de login.

### 7.3 Reglas de seguridad de Firestore (multiusuario, ADR 0010)
**Principio:** las reglas rechazan solo lo que la app legítima nunca podría producir. Validan cada documento por separado, sin `get()`. La coherencia entre documentos la valida el dominio (5.3).

Borrador en pseudocódigo. Las reglas reales y sus tests se escriben en la Fase 2.
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) { return request.auth != null && request.auth.uid == uid; }
    function serverTime() { return request.resource.data.updatedAt == request.time; }
    function unchanged(fields) {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny(fields);
    }
    function isCents(v) { return v is int && v >= 1 && v <= 99999999999999; }
    function isDate(v) { return v is string && v.matches('^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'); }
    function isMs(v) { return v is int && v > 0; }
    function isMsOrNull(v) { return v == null || isMs(v); }
    function isKey(v) { return v is string && v.matches('^[a-z0-9-]{1,30}$'); }

    match /users/{uid} {
      allow read: if isOwner(uid);
      allow create: if isOwner(uid) && validProfile() && serverTime();
      allow update: if isOwner(uid) && validProfile() && serverTime()
                    && unchanged(['createdAt'])
                    && request.resource.data.schemaVersion >= resource.data.schemaVersion;
      allow delete: if isOwner(uid);   // solo "Borrar mi cuenta"

      match /accounts/{id} {
        allow read: if isOwner(uid);
        allow create: if isOwner(uid) && validAccount() && serverTime();
        allow update: if isOwner(uid) && validAccount() && serverTime()
                      && unchanged(['createdAt', 'currency', 'initialBalance']);
        allow delete: if isOwner(uid);
      }
      // categories: igual, con unchanged(['createdAt'])
      // transactions: hasOnly/hasAll según type; unchanged(['createdAt', 'source'])
      // budgets: id == categoryId + '_' + currency; unchanged(['createdAt', 'categoryId', 'currency'])
      // recurring: hasOnly/hasAll según type; unchanged(['createdAt'])
    }

    match /whatsappLinks/{phone} {
      allow read, write: if false;   // solo el servidor (Fase 11)
    }
  }
}
```
Cada función `validX()` comprueba:
- Campos exactos con `keys().hasOnly()` y `hasAll()`, según el tipo en las uniones discriminadas.
- Tipos y valores de las listas permitidas.
- Largos de los textos: `name` de 1 a 50 en cuentas y de 1 a 40 en categorías, sin espacios al inicio ni al final; `description` hasta 200.
- Montos con `isCents`, y `initialBalance` como `int` entre 0 y el máximo.
- Fechas con `isDate`; `createdAt` con `isMs`; `archivedAt` y `deletedAt` con `isMsOrNull`.
- `icon`, `color` y `kind` con `isKey` o con su lista.

Por defecto, todo lo demás queda denegado. Las reglas no limitan *cuántos* documentos crea un usuario; eso se mitiga con App Check (Fase 9).

### 7.4 Privacidad
- Sin analíticas ni telemetría de terceros.
- Las claves de configuración de Firebase son públicas por diseño; la protección está en las reglas de seguridad.
- El Client ID de OAuth para Sheets se restringe en Google Cloud Console a los orígenes de producción y `localhost`.

---

## 8. RESPALDO, EXPORTACIÓN E IMPORTACIÓN

Firestore es la fuente de verdad. Estas funciones son copias de seguridad y salidas de datos. Salen de los datos que ya están en el dispositivo, sin lecturas de Firestore; si el dispositivo no está al día con el servidor, se avisa (ADR 0024).

### 8.1 Exportar JSON
Descarga `finanzas_YYYY-MM-DD.json` con:
```json
{
  "format": "control-finanzas",
  "schemaVersion": 1,
  "exportedAt": 1759363200000,
  "accounts": [ ... ],
  "categories": [ ... ],
  "transactions": [ ... ],
  "budgets": [ ... ],
  "recurring": [ ... ]
}
```
Incluye registros archivados (no las lápidas) y conserva los IDs. `schemaVersion` es el del esquema de los documentos (ADR 0011).

### 8.2 ~~Restaurar desde JSON~~
Fuera de alcance (ADR 0024): reemplazar los datos rompería la sincronización de los otros dispositivos y chocaría con los campos inmutables de las reglas. El JSON es una copia para guardar.

### 8.3 Exportar CSV
- Descarga **un solo archivo ZIP** `finanzas_YYYY-MM-DD.zip` con `cuentas.csv`, `categorias.csv` y `movimientos.csv` (descargar varios archivos sueltos a la vez suele ser bloqueado por el navegador).
- Formato pensado para Excel en español: separador `;`, decimales con coma, codificación UTF-8 con BOM, campos con `;`, comillas o saltos de línea entre comillas dobles.
- `movimientos.csv` con columnas legibles: Fecha (`DD/MM/YYYY`), Tipo, Cuenta, Cuenta destino, Categoría, Descripción, Monto, Moneda, Monto destino, Moneda destino.
- `cuentas.csv`: Nombre, Moneda, Saldo inicial, Saldo actual, Estado (Activa/Archivada).
- `categorias.csv`: Nombre, Tipo, Estado.

### 8.4 Exportar a Google Sheets (opcional, manual)
- Botón "Exportar a Google Sheets". Requiere conexión.
- Obtiene un token con Google Identity Services (`google.accounts.oauth2.initTokenClient`) y scope **`https://www.googleapis.com/auth/drive.file`** únicamente (alcanza para crear y editar hojas creadas por la app).
- Si `sheetsSpreadsheetId` del perfil (`users/{uid}`) existe y es accesible, actualiza esa hoja; si no, crea "Control de Finanzas — Exportación" y guarda su ID.
- Pestañas: `Movimientos`, `Cuentas`, `Categorías`, con las mismas columnas que el CSV, montos como números con formato de moneda y fechas como fechas.
- **Para no dejar la hoja vacía si falla a mitad:** escribir primero los datos nuevos desde la fila 1 y recién después limpiar las filas sobrantes por debajo.
- Mostrar "Exportado el {fecha y hora}" y un link para abrir la hoja.
- No hay sincronización automática ni restauración desde Sheets.

---

## 9. PWA, HOSTING Y APK ANDROID

### 9.1 PWA
- `vite-plugin-pwa` con precache de todos los assets estáticos y actualización automática del service worker (avisar "Hay una versión nueva" y recargar).
- Manifiesto: `name` "Control de Finanzas", `short_name` "Finanzas", `display: standalone`, `orientation: portrait-primary`, `theme_color: #1a73e8`, `background_color`, `start_url: "/"`, íconos 192 y 512 px, incluido un ícono `maskable` de 512 px.
- Las peticiones a Bluelytics y Google no se cachean con el service worker (se manejan en código).

### 9.2 Firebase Hosting
- `firebase.json` con rewrite de todas las rutas a `/index.html` (SPA).
- Encabezado `Cache-Control: no-cache` para `index.html` y el service worker.
- Servir `/.well-known/assetlinks.json` (ver 9.3).

### 9.3 APK con Bubblewrap (Trusted Web Activity)
- Generar con `@bubblewrap/cli` a partir de la URL del manifiesto publicado.
- Nombre de paquete: a definir por el dueño (ej. `ar.joaco.finanzas`).
- **Digital Asset Links:** publicar `/.well-known/assetlinks.json` con el nombre de paquete y la huella SHA-256 de la clave de firma. Sin esto, la app abre mostrando la barra de direcciones.
- La clave de firma (keystore) y su contraseña **no se suben al repositorio** (agregar a `.gitignore`). El dueño la guarda en un gestor de contraseñas.
- El contenido se actualiza automáticamente desde el hosting; el APK solo se regenera si cambian nombre, ícono o configuración del manifiesto.
- Verificar en el APK: login con Google, funcionamiento offline, descargas de exportación.

---

## 10. REQUISITOS NO FUNCIONALES

- **Offline:** todas las funciones de carga, edición, consulta, filtros, búsqueda y estadísticas funcionan sin conexión después del primer login. Requieren conexión: login inicial, cotizaciones, exportar a Sheets.
- **Multi-dispositivo:** un cambio hecho con conexión en un dispositivo aparece en el otro (si está abierto y con conexión) en pocos segundos, sin recargar.
- **Rendimiento:** guardar un movimiento y ver el saldo actualizado se siente instantáneo (sin esperar a la red). La app debe mantenerse fluida con al menos 10.000 transacciones.
- **Compatibilidad:** Chrome en Android (APK y navegador) y Chrome/Edge/Firefox en escritorio. Diseño responsivo, pensado primero para celular.
- **Accesibilidad básica:** botones con etiquetas accesibles, contraste suficiente, no transmitir información solo con color (los montos llevan signo además del color).
- **Calidad de código:** TypeScript `strict` sin errores; lint sin errores; `npm test` pasa antes de dar una fase por terminada.

---

## 11. TESTS

### 11.1 Tests unitarios (Vitest) — `src/domain/`
Obligatorios para:
- Parseo de montos (todos los ejemplos de 5.1) y formateo `es-AR`.
- Cálculo de saldo (5.2) con todos los tipos de transacción.
- Consolidación (5.7), incluido el caso sin cotización.
- Validaciones de transacciones (5.3), incluidas cuentas archivadas.
- Cotización implícita de cambios (5.4).
- Regla de archivado de cuentas (saldo 0).
- Progreso de presupuestos (5.9).
- Cálculo de ocurrencias recurrentes (5.10): fin de mes, bisiestos, semanal, anual, `endDate`, múltiples pendientes, `nextDate` idempotente al confirmar y recálculo al editar la frecuencia o `startDate` (sin repetir ocurrencias ya confirmadas).
- Reglas de archivar y eliminar (ADR 0005): eliminar solo lo que no se usa, restaurar con nombre repetido y bloqueo del cambio de tipo de categoría.
- Filtrado de lápidas (`deletedAt`) en todas las consultas del dominio y tolerancia a referencias inexistentes.
- Fecha local (5.11): simular 23:30 en UTC−3.
- Búsqueda sin acentos y combinación de filtros.
- Agregaciones de estadísticas por período.

### 11.2 Tests de reglas de seguridad (Firebase Emulator)
Según 7.3, con un grupo por colección:
- Acceso: el dueño lee y escribe lo suyo; otro usuario autenticado y un usuario sin sesión no pueden leer ni escribir nada.
- Cada campo con un valor válido y uno inválido: tipo, rango, largo y lista permitida.
- Campos que sobran o faltan, por cada tipo de movimiento y de recurrente.
- Campos que no se pueden cambiar, `updatedAt == request.time` y `schemaVersion` que no baja.
- ID del presupuesto distinto de `{categoryId}_{currency}`.
- `whatsappLinks` inaccesible desde el cliente.

### 11.2.1 Tests de la capa data (Firebase Emulator)
- Sincronización incremental: cursor con margen de solapamiento, lápidas que llegan al otro cliente y descarga completa sin caché.
- Siembra con `runTransaction` desde dos clientes a la vez: queda una sola siembra y no se pisan las categorías renombradas.

### 11.3 Matriz de aceptación (pruebas manuales)

| ID | Escenario | Resultado esperado |
|---|---|---|
| TC-01 | Gasto de $500 en "Efectivo" (saldo $2.000) | Saldo $1.500; aparece en rojo en Historial |
| TC-02 | Transferir $1.000 de "Sueldo" ($5.000) a "Efectivo" ($1.000) | Sueldo $4.000, Efectivo $2.000, total sin cambios |
| TC-03 | Transferencia desde cuenta USD | Las cuentas ARS no aparecen como destino |
| TC-04 | Editar gasto de $300 a $500 | El saldo baja $200 respecto a antes de editar |
| TC-05 | Cambio: salen $130.000 de "Efectivo ARS", entran US$ 100 en "Caja USD" | ARS −130.000, USD +100, muestra "1 USD = $ 1.300,00"; no aparece en estadísticas |
| TC-06 | Archivar cuenta con saldo ≠ 0 | Bloqueado con mensaje |
| TC-07 | Archivar cuenta con saldo 0 | Desaparece de selectores y Dashboard; sus movimientos siguen en Historial |
| TC-08 | Archivar categoría "Comida" con gastos | Ningún saldo cambia; gastos siguen en Historial y estadísticas |
| TC-09 | ARS $100.000 + US$ 100, blue $1.300 | Total `$ 230.000,00` |
| TC-10 | US$ 100 sin cotización disponible | Total $100.000 con aviso "No incluye US$ 100,00…" |
| TC-11 | Modo avión, cargar 10 movimientos, reconectar | Todo fluido offline; al reconectar se sincroniza solo |
| TC-12 | Cargar en el celular con la compu abierta | Aparece en la compu en segundos |
| TC-13 | Recurrente mensual que empieza el 31/01 | Próximas: 28/02 (o 29/02), 31/03, 30/04 |
| TC-14 | Confirmar el mismo recurrente en dos dispositivos offline y reconectar | Una sola transacción |
| TC-15 | Presupuesto Comida ARS $100.000 con $85.000 gastados | Barra amarilla al 85 % |
| TC-16 | Abrir modal a las 23:30 hora Argentina | Fecha por defecto = hoy, no mañana |
| TC-17 | Montos "1500,50", "1.500", "0" | Válido; rechazado; rechazado |
| TC-18 | Buscar "credito" | Encuentra movimientos con "Crédito" |
| TC-19 | Otro usuario de Google inicia sesión | Usa la app normalmente con sus propios datos; no ve ni puede escribir los datos de otros |
| TC-20 | Cerrar sesión con cambios pendientes | Muestra advertencia |
| TC-21 | Abrir el APK | Pantalla completa, sin barra de direcciones; login funciona |
| TC-22 | Exportar CSV y abrir en Excel | Columnas separadas, acentos y decimales correctos |
| TC-23 | Exportar el JSON (ADR 0024) | Trae las cuentas, categorías y movimientos cargados, con los archivados y sin los eliminados |
| TC-24 | Eliminar un movimiento en el celular con la compu abierta | Desaparece en la compu en segundos (lápida) |
| TC-25 | Archivar "Efectivo" (saldo 0) en la compu mientras el celular, sin conexión, le carga un gasto; reconectar | El gasto no se pierde; aparece en el historial con la cuenta marcada "archivada" |
| TC-26 | Confirmar la ocurrencia de hoy de un recurrente mensual y después cambiarle la frecuencia a semanal | La ocurrencia de hoy no vuelve a quedar pendiente |
| TC-27 | Renombrar "Comida" en el celular y después iniciar sesión por primera vez en la compu | La compu muestra el nombre nuevo; la siembra no lo pisa |
| TC-28 | Abrir la app 5 veces en el día con 1.000 movimientos | En la consola de Firebase, las lecturas del día son decenas, no miles |

---

## 12. PLAN DE IMPLEMENTACIÓN SUGERIDO

Cada fase termina con: typecheck sin errores, tests pasando y una verificación manual del dueño.

1. **Fase 0 — Setup:** proyecto Vite + React + TS strict, lint, Vitest, Firebase SDK, emuladores, estructura de carpetas.
2. **Fase 1 — Dominio:** tipos y toda la lógica de `src/domain/` con sus tests unitarios (sin UI).
3. **Fase 2 — Datos y login:** Firebase Auth, Firestore con caché persistente, listeners, store, escrituras, categorías iniciales, reglas de seguridad y sus tests.
4. **Fase 3 — Paridad con la app actual:** Dashboard, Historial, Ajustes de cuentas y categorías (con archivado), modales (incluido el cambio de moneda, ADR 0020), indicador de sincronización.
5. **Fase 4 — Estadísticas y búsqueda:** período elegible y buscador.
6. **Fase 5 — Nuevas funciones:** presupuestos, recurrentes y dictado por voz (ADR 0023).
7. **Fase 6 — Respaldo:** exportar JSON, CSV y Google Sheets (sin restauración, ADR 0024).
8. **Fase 7 — PWA y publicación:** service worker, manifiesto (con el atajo "Dictar movimiento" a `#/inicio?movimiento=nuevo&dictar=1`), Firebase Hosting.
9. **Fase 8 — APK:** Bubblewrap, assetlinks, pruebas en el celular.

---

## 13. TAREAS MANUALES DEL DUEÑO

Claude Code no puede hacer estas tareas porque requieren cuentas y consolas web:

1. Crear el proyecto en la consola de Firebase.
2. Habilitar Authentication → proveedor Google.
3. Crear la base de datos Firestore (modo producción, región `southamerica-east1` o la más cercana).
4. Registrar una app web en Firebase y copiar la configuración al archivo `.env.local`.
5. Instalar Firebase CLI (`npm install -g firebase-tools`) y ejecutar `firebase login`.
6. ~~Copiar el UID en las reglas~~: ya no hace falta, las reglas son multiusuario (7.3).
7. En Google Cloud Console (mismo proyecto): habilitar Google Sheets API y Google Drive API, configurar la pantalla de consentimiento OAuth (modo prueba, con el dueño como usuario de prueba) y crear un Client ID de tipo "Aplicación web" con los orígenes autorizados.
8. Durante la fase 8: responder las preguntas interactivas de Bubblewrap, crear la clave de firma y guardarla en un lugar seguro.
9. Habilitar "Instalar apps desconocidas" en el celular para instalar el APK.

---

## 14. REFERENCIA

La carpeta `../finanzas-personales-referencia/` (fuera del repo, al lado del proyecto) contiene el código de la app actual generada con Google AI Studio. Se usa para replicar el aspecto visual, los textos y el flujo de pantallas. **Ante cualquier diferencia entre la referencia y este SRS, manda este SRS.**
