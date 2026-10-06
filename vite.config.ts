import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// Colores del manifiesto: el acento y el fondo claro de "Sereno" (src/ui/styles/tokens.css).
const ACCENT = '#0f6b5f';
const BACKGROUND = '#f6f7f5';

/**
 * Content-Security-Policy (ADR 0027): la lista de sitios con los que la app puede hablar. Si
 * alguien lograra inyectar código, el navegador no lo dejaría cargar scripts de otro lado ni
 * mandar datos a otro servidor. Va como `<meta>` en index.html para que valga igual en Hosting
 * y en `vite preview`, donde corren los tests E2E (si la CSP bloquea algo, fallan).
 */
function contentSecurityPolicy(authDomain: string, emulators: boolean): string {
  // Con los emuladores, Auth y Firestore corren en esta misma compu.
  const local = emulators ? ['http://127.0.0.1:9099', 'http://127.0.0.1:8080'] : [];
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // apis.google.com: lo carga Firebase Auth para el popup. accounts.google.com: Google
    // Identity Services, para el permiso de Sheets (ADR 0025).
    'script-src': ["'self'", 'https://apis.google.com', 'https://accounts.google.com'],
    'connect-src': [
      "'self'",
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://api.bluelytics.com.ar',
      'https://sheets.googleapis.com',
      'https://www.googleapis.com',
      'https://accounts.google.com',
      ...local,
    ],
    // El iframe de Firebase Auth vive en el authDomain; el de Google, en accounts.google.com.
    'frame-src': ["'self'", `https://${authDomain}`, 'https://accounts.google.com', ...local],
    // www.google.com: sin conexión, Firestore prueba la red pidiendo una imagen (cleardot.gif).
    'img-src': ["'self'", 'data:', 'https://www.google.com'],
    // React y Google Identity Services ponen estilos en línea.
    'style-src': ["'self'", "'unsafe-inline'", 'https://accounts.google.com'],
    'font-src': ["'self'", 'data:'],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/** Agrega la CSP al index.html del build. En `npm run dev` no: Vite usa scripts en línea. */
function cspPlugin(policy: string): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const emulators = env.VITE_USE_EMULATORS === 'true';
  const authDomain = env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost';

  return {
    plugins: [
      react(),
      cspPlugin(contentSecurityPolicy(authDomain, emulators)),
      // PWA (SRS 9.1, ADR 0027): service worker que guarda la app para abrir sin conexión, y
      // manifiesto para instalarla.
      VitePWA({
        // Una versión nueva espera a que la persona toque "Actualizar" (src/data/appUpdate.ts).
        registerType: 'prompt',
        // El registro lo hace src/ui/session.ts con `virtual:pwa-register`.
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        workbox: {
          // Todo lo del build: JS, CSS, HTML, fuentes e íconos.
          globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
          // Cualquier ruta abre la app (navegación por hash, ADR 0018), salvo /__/: ahí está el
          // handler de login de Firebase, que tiene que llegar siempre al servidor.
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/__\//],
          // Sin runtimeCaching: Bluelytics y Google se manejan en código, nunca desde la caché.
          cleanupOutdatedCaches: true,
        },
        manifest: {
          name: 'Control de Finanzas',
          short_name: 'Finanzas',
          description:
            'Tus cuentas y movimientos, en el celular y en la compu. Funciona sin conexión.',
          lang: 'es-AR',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait-primary',
          theme_color: ACCENT,
          background_color: BACKGROUND,
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          // Mantener apretado el ícono de la app → "Dictar movimiento" (ADR 0023).
          shortcuts: [
            {
              name: 'Dictar movimiento',
              short_name: 'Dictar',
              url: '/#/inicio?movimiento=nuevo&dictar=1',
              icons: [{ src: 'shortcut-mic-96.png', sizes: '96x96', type: 'image/png' }],
            },
          ],
        },
      }),
    ],
    test: {
      // Tests unitarios: rápidos, sin emuladores ni navegador.
      include: ['src/**/*.test.{ts,tsx}'],
      // Corren en Node, que es más rápido. Los tests de componentes piden jsdom (un navegador
      // simulado) con el comentario `// @vitest-environment jsdom` al principio (ADR 0019).
      environment: 'node',
      setupFiles: ['src/ui/testing/setup.ts'],
      // Zona horaria fija: los tests de fechas dan lo mismo en cualquier compu y en el CI (UTC).
      env: { TZ: 'America/Argentina/Buenos_Aires' },
      // `npm run test:coverage`: qué líneas del código no ejecuta ningún test (informe en coverage/).
      coverage: {
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/domain/testing/**'],
      },
    },
  };
});
