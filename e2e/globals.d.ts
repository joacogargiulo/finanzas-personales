// Lo que la app agrega a `window` en el build de emulador (ver src/vite-env.d.ts, ADR 0019).
interface Window {
  e2eSignIn?: (email: string, displayName: string) => Promise<void>;
}
