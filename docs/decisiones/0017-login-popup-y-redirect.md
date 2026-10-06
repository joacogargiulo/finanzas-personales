# ADR 0017 — Login con popup y redirect de respaldo

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 2 (datos y login)
- **Modifica:** SRS 7.1

## Contexto
Firebase Auth ofrece dos formas de iniciar sesión con Google:
- **Popup** (`signInWithPopup`): abre una ventana chica con la cuenta de Google y, al terminar, vuelve a la app sin recargarla.
- **Redirect** (`signInWithRedirect`): la pestaña entera va a Google y después vuelve a la app, que se recarga.

El SRS 7.1 propone popup en escritorio y redirect en la PWA instalada o el APK. Pero hoy los navegadores bloquean el almacenamiento de terceros, y el redirect solo funciona bien cuando el `authDomain` es el **mismo dominio** donde corre la app (el de Firebase Hosting). En `localhost`, el redirect falla o necesita configuración extra.

## Alternativas
1. **Popup en todos lados, con redirect de respaldo** si el navegador bloquea el popup.
2. **Popup en escritorio y redirect en modo instalado** (lo que dice el SRS).

## Decisión
Se adopta la opción 1:
- Primero se intenta `signInWithPopup`.
- Si el navegador lo bloquea (`auth/popup-blocked`) o no lo soporta (`auth/operation-not-supported-in-environment`), se usa `signInWithRedirect`. Al abrir la app se llama a `getRedirectResult` para mostrar un error que haya ocurrido durante el redirect.
- Si el usuario cierra el popup, no se muestra ningún error.
- Sin conexión, se muestra *"Necesitás conexión a internet para iniciar sesión por primera vez."* (SRS 6.1).
- En producción, `authDomain` es el dominio de Hosting (SRS 7.1), así el respaldo con redirect también funciona.

## Consecuencias
- En desarrollo funciona sin configuración extra, contra el emulador de Auth o contra el proyecto real en `localhost`.
- Dentro del APK (TWA), el popup corre en Chrome. Se verificó en la Fase 8 (TC-21, ADR 0028): funciona; el popup se abre como una pestaña a pantalla completa.
