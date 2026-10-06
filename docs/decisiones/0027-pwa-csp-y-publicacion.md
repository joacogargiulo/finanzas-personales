# ADR 0027 — PWA, Content-Security-Policy y publicación

- **Estado:** aceptada
- **Fecha:** 2026-10-05
- **Fase:** 7b (PWA, CSP y Hosting)
- **Modifica:** SRS 9.1, 9.2 y 13

## Contexto
La app tiene que poder instalarse, abrir sin conexión y publicarse en Firebase Hosting (SRS 9). El SRS fija las herramientas (`vite-plugin-pwa` y Hosting), pero al implementarlo hubo que decidir:
- **Cómo se actualiza** una app instalada cuando se publica una versión nueva.
- **Dónde va la Content-Security-Policy** (CSP) y cómo se prueba. El ADR 0025 la había dejado pendiente.
- **De qué color es** la barra del sistema: el SRS dice `#1a73e8`, pero el diseño "Sereno" (ADR 0001) usa otro acento.
- **Cómo se publica.**

## Alternativas
**Actualización**
1. **`autoUpdate`:** la versión nueva se activa y la página se recarga sola. Puede borrar un movimiento a medio cargar.
2. **`prompt`:** la versión nueva queda esperando, la app avisa "Hay una versión nueva" y se activa cuando la persona toca Actualizar.

**CSP**
1. **Encabezado HTTP en `firebase.json`:** es la forma clásica, pero solo existe en Hosting. Los E2E corren con `vite preview` y no la probarían: un error en la CSP aparecería recién en producción.
2. **`<meta http-equiv>` en `index.html`, generada en `vite.config.ts`:** vale igual en Hosting y en `vite preview`, así los E2E la prueban. No admite `frame-ancestors`, que va en un encabezado.

**Publicación**
1. **`npm run deploy` desde la compu del dueño:** compila con su `.env.local` y sube. No hace falta guardar secretos en GitHub.
2. **Deploy automático con GitHub Actions** en cada merge a `main`: necesita una cuenta de servicio de Google guardada como secreto.

## Decisión
- **`prompt`** (alternativa 1 de actualización descartada). Las escrituras pendientes no se pierden al recargar porque viven en IndexedDB. Como una PWA puede quedar abierta días, la app pregunta cada hora (si hay conexión) si hay una versión nueva. El aviso de esquema más nuevo (ADR 0011) también ofrece Actualizar cuando la versión está lista.
- **CSP como `<meta>`** generada por un plugin chico de `vite.config.ts`, solo en el build (en `npm run dev` Vite usa scripts en línea). Permite lo que la app usa, y nada más:

  | Directiva | Origen | Para qué |
  |---|---|---|
  | `script-src` | `apis.google.com` | Popup de login de Firebase Auth |
  | `script-src` | `accounts.google.com` | Google Identity Services, para el permiso de Sheets |
  | `connect-src` | `firestore`, `identitytoolkit` y `securetoken.googleapis.com` | Firestore y Auth |
  | `connect-src` | `api.bluelytics.com.ar` | Cotizaciones |
  | `connect-src` | `sheets.googleapis.com` y `www.googleapis.com` | Sheets y Drive |
  | `frame-src` | el `authDomain` y `accounts.google.com` | Iframes de login |
  | `img-src` | `www.google.com` | Sin conexión, Firestore prueba la red pidiendo una imagen (`cleardot.gif`); lo detectaron los E2E |

  En modo emulador se suman `127.0.0.1:9099` y `127.0.0.1:8080`. Los E2E fallan si el navegador reporta cualquier bloqueo de la CSP (`e2e/fixtures.ts`).
- **Encabezados de Hosting:** `frame-ancestors 'self'` (no `'none'`: el iframe propio de Firebase Auth vive en el mismo sitio), `X-Content-Type-Options: nosniff` y `Referrer-Policy`. `no-cache` para `/`, `index.html`, `sw.js` y el manifiesto; un año e `immutable` para `/assets/`, que llevan un hash en el nombre.
- **Service worker:** precachea todo el build (JS, CSS, HTML, fuentes e íconos). No cachea pedidos a Bluelytics ni a Google. Las navegaciones abren `index.html`, salvo `/__/`, donde vive el handler de login de Firebase.
- **`theme_color: #0f6b5f`**, el acento de "Sereno". El `#1a73e8` del SRS es anterior al rediseño.
- **Íconos propios:** el "$" de la marca del login sobre el acento, con versión `maskable` (fondo hasta el borde, dibujo en la zona segura). El atajo "Dictar movimiento" (ADR 0023) lleva el micrófono de `Icon.tsx`. Los PNG salen de los SVG de `icons/` con `npm run icons` (sharp) y se suben al repo.
- **Deploy manual** con `npm run deploy` (elegido por el dueño). Se puede automatizar en otra fase.
- **Dominio:** `finanzas-personales-jtg.web.app`, que también es el `authDomain` (SRS 7.1). Así el handler del login está en el mismo sitio que la app.

## Consecuencias
- Sumar un servicio externo nuevo implica agregarlo a la CSP de `vite.config.ts`. Si alguien se olvida, los E2E lo detectan, siempre que un test use ese servicio.
- La primera vez que se abre, la app descarga ~1,1 MB para el modo sin conexión.
- `npm run dev` no registra el service worker. Para probar la PWA hay que usar `npm run build` y `npm run preview`.
- El emulador de Hosting no aplica los encabezados de `firebase.json`: se verifican con `curl -I` contra el sitio publicado.
- `firebase.json` ignora los archivos que empiezan con punto (`**/.*`). En la Fase 8, para servir `/.well-known/assetlinks.json`, hay que ajustar ese `ignore`.
