# Control de Finanzas — Instrucciones para Claude Code

## Qué es este proyecto
PWA de finanzas personales offline-first, que se usa en un celular Android (como APK) y en una computadora, con los datos sincronizados por Firebase Firestore.

**Es un producto multiusuario:** cualquier persona inicia sesión con Google y ve solo sus datos (esto reemplaza al "único usuario" del SRS). Público: Argentina. Plan de Firebase: Spark (gratis), así que hay que diseñar para leer poco.

**La especificación completa está en `docs/SRS.md`. Leela antes de implementar cualquier cosa.** Si algo no está claro o el SRS parece contradecirse, preguntá antes de decidir por tu cuenta. Las decisiones que modifican el SRS quedan registradas en `docs/decisiones/` (ADRs); ante una diferencia, manda el ADR más reciente.

## Sobre el dueño del proyecto
- Es estudiante de Ingeniería Informática y está empezando en el desarrollo profesional. Sabe poco de testing y del flujo profesional de GitHub.
- Objetivos: usar la app a diario, **aprender** y sumarla a su portfolio.
- Explicá en español, con claridad, qué hiciste y por qué, sobre todo cuando aparece un concepto nuevo.
- Cuando haga falta una acción manual (consolas de Firebase o Google Cloud, claves, etc.), decilo explícitamente con pasos concretos.

## Stack
React + TypeScript (strict) + Vite · vite-plugin-pwa · Zustand · Firebase Firestore + Auth (Google) · Firebase Hosting · Vitest · Firebase Emulator Suite · Bubblewrap (APK).

## Estructura
```
src/
  domain/   # lógica de negocio pura: NO importa React ni Firebase
  data/     # Firestore, Auth, Bluelytics, Sheets, export/import
  ui/       # componentes, pantallas, modales
docs/SRS.md
```
Las dependencias van en una sola dirección: `ui → data → domain`.

## Comandos
- `npm run dev` — servidor local
- `npm test` — tests unitarios (Vitest)
- `npm run test:rules` — tests de reglas de Firestore con el emulador
- `npm run typecheck` — TypeScript sin emitir
- `npm run lint`
- `npm run build`

(Crearlos en la fase 0 si no existen.)

## Reglas que no se negocian
1. **Montos en centavos enteros.** Nunca guardar ni sumar montos como decimales. Parsear texto a centavos sin usar punto flotante.
2. **El saldo de una cuenta no se guarda**: se calcula siempre desde `initialBalance` + transacciones (SRS 5.2).
3. **Nunca `await` una escritura de Firestore para actualizar la UI.** Offline, esa promesa no se resuelve. La UI se actualiza a través de los listeners `onSnapshot`.
4. **Escrituras que tocan varios documentos → `writeBatch`.**
5. **Borrado lógico** (`deletedAt`) para cuentas, categorías y recurrentes. Nunca borrar en cascada transacciones.
6. **Fechas locales**: nunca usar `toISOString()` para obtener "hoy".
7. **IDs determinísticos** donde el SRS lo indica (categorías iniciales, presupuestos, transacciones de recurrentes) para evitar duplicados entre dispositivos.
8. Toda regla de negocio vive en `src/domain/` y tiene tests.
9. No subir secretos: `.env.local`, keystore del APK y sus contraseñas, van en `.gitignore`. La app vieja vive fuera del repo (ver "Uso de la app vieja").
10. **Las reglas de Firestore validan el esquema completo**: es multiusuario, así que son la barrera de seguridad real.

## Cómo trabajar
- **Por fases**, según el plan acordado: D (diseño UX/UI) → M (modelo de datos, didáctica) → 0 a 9. No empezar una fase sin que la anterior esté terminada y aprobada por el dueño.
- **El modelo de datos se decide con calma**: explicar cada concepto, proponer alternativas y registrar cada decisión en un ADR.
- **Antes de cada fase:** proponer un plan breve (archivos a crear o modificar, decisiones) y esperar aprobación.
- **Al terminar cada fase:** correr `typecheck`, `lint` y `test`; todo tiene que pasar. Después, resumir qué se hizo, cómo probarlo a mano (qué casos TC del SRS aplican) y qué queda pendiente.
- Cuando escribas tests, explicá brevemente qué verifica cada grupo, para que el dueño aprenda a leerlos.
- Commits chicos y descriptivos en español.
- **Flujo de GitHub profesional, explicado al dueño mientras se usa**: un issue por fase, una rama `fase-N-nombre`, un PR que cierra el issue, CI en verde, revisión y aprobación del dueño en GitHub, merge squash. `main` está protegida.
- Al cerrar cada fase: una explicación didáctica de los conceptos nuevos y los ADRs de las decisiones tomadas.

## Uso de la app vieja (referencia)
- Está **fuera del repo**, en `../finanzas-personales-referencia/` (al lado de esta carpeta), porque contiene una API key y Vite escaneaba sus archivos. Es **solo lectura**.
- Es **solo inspiración**: muestra en qué venía trabajando el dueño y qué funciones le interesan. Se arranca de cero y el diseño se rediseña (ver el ADR de diseño UX/UI).
- **No copiar su lógica de datos**: usa IndexedDB, saldos guardados, montos float y borrado en cascada, todo eso fue reemplazado.
- Ante cualquier diferencia entre la referencia y el SRS o los ADRs, mandan el SRS y los ADRs.

## Idioma
- Interfaz: español rioplatense (vos), formatos `es-AR`.
- Código (nombres de variables, funciones, tipos): inglés.
- Comentarios y mensajes de commit: español.
