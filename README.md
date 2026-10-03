# Control de Finanzas

PWA de finanzas personales **offline-first**: se carga un gasto sin conexión y se sincroniza sola entre el celular (APK) y la computadora con Firebase Firestore. Cada persona inicia sesión con Google y ve solo sus datos.

> En construcción. Avance por fases: ver [`docs/SRS.md`](docs/SRS.md) (especificación) y [`docs/decisiones/`](docs/decisiones/) (decisiones de arquitectura).

## Stack

React 19 · TypeScript (strict) · Vite · Firebase (Firestore + Auth con Google + Hosting) · Vitest · Playwright · GitHub Actions.

## Arquitectura

```
src/
  domain/   lógica de negocio pura (no importa React ni Firebase)
  data/     Firestore, Auth y servicios externos
  ui/       componentes y pantallas
```

Las dependencias van en un solo sentido: `ui → data → domain`, y ESLint lo hace cumplir.

Algunas reglas del diseño:

- Los montos se guardan en **centavos enteros**, nunca como decimales.
- El saldo de una cuenta **no se guarda**: se calcula desde el saldo inicial y los movimientos.
- La interfaz nunca espera a que el servidor confirme una escritura: así funciona igual sin conexión.

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- Java 21 (para el emulador de Firestore)

## Comandos

| Comando              | Qué hace                                                               |
| -------------------- | ---------------------------------------------------------------------- |
| `npm install`        | Instala las dependencias                                               |
| `npm run dev`        | Servidor local de desarrollo                                           |
| `npm run build`      | Compila para producción en `dist/`                                     |
| `npm run typecheck`  | Verifica los tipos de TypeScript                                       |
| `npm run lint`       | Revisa el código con ESLint                                            |
| `npm run format`     | Formatea el código con Prettier                                        |
| `npm test`           | Tests unitarios (Vitest)                                               |
| `npm run test:rules` | Tests de las reglas de seguridad contra el emulador de Firestore       |
| `npm run test:e2e`   | Tests de punta a punta con Playwright (necesita `npm run build` antes) |
| `npm run emulators`  | Levanta los emuladores de Firebase con su interfaz web                 |

## Cómo se trabaja

Un issue por fase, una rama, un pull request con el CI en verde y merge squash. Detalle en [`docs/flujo-de-trabajo.md`](docs/flujo-de-trabajo.md).
