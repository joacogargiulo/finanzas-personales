# ADR 0019 — Tests de la interfaz

- **Estado:** aceptada
- **Fecha:** 2026-10-03
- **Fase:** 3 (paridad con la app actual)

## Contexto
Hasta la Fase 2 había tests del dominio (Vitest), de las reglas y de la capa data (con el emulador), y un solo test e2e de humo. La Fase 3 suma la interfaz, y hay que decidir cómo testearla sin que los tests sean lentos ni frágiles.

## Alternativas
1. **Solo e2e con Playwright**: prueba la app real en un navegador, pero cada test es lento (compila la app y levanta emuladores) y cuando falla cuesta saber por qué.
2. **Solo lógica extraída**: mover la lógica de las pantallas a funciones puras y probar la interfaz a mano. Rápido, pero nadie verifica que los botones hagan lo que dicen.
3. **Tres niveles**: funciones puras con Vitest, componentes con Testing Library en un navegador simulado (jsdom) y pocos flujos completos con Playwright.

## Decisión
Se adopta la **opción 3**:
- **Lógica de presentación pura** (`*.test.ts`, en Node): rutas, textos de un movimiento, estado del formulario, formato de fechas y cotizaciones.
- **Componentes** (`*.test.tsx`, con `// @vitest-environment jsdom` en la primera línea): `@testing-library/react` y `@testing-library/user-event`. Los elementos se buscan como los encuentra una persona (por rol y nombre: `getByRole('button', { name: 'Guardar gasto' })`), así los tests también controlan la accesibilidad. Los componentes que se testean son "de presentación": reciben los datos por props y avisan con callbacks (`onSave`), sin conocer Firestore. `src/ui/testing/setup.ts` prepara jest-dom y completa lo que jsdom no tiene (`showModal()` de `<dialog>`).
- **E2E** (`e2e/`, Playwright con los emuladores de Auth y Firestore): pocos flujos de punta a punta, por ejemplo TC-01 (crear una cuenta, cargar un gasto y ver el saldo).

**Inicio de sesión en los e2e:** el popup del emulador de Auth a veces queda colgado y vuelve inestables los tests. Se sigue la recomendación de Firebase para testear con el emulador: iniciar sesión con `signInWithCredential` y un token de Google inventado (un JSON sin firmar, que solo acepta el emulador). La app expone `window.e2eSignIn` **solo en el build de emulador** (`VITE_USE_EMULATORS=true`). En producción esa rama desaparece al compilar, y aunque existiera, el servicio real de Google rechazaría el token. El popup real se sigue probando a mano (Fase 2, y TC-21 en el APK).

## Consecuencias
- `npm test` corre los tests de dominio, de presentación y de componentes. Los de componentes tardan algo más porque arrancan jsdom.
- `npm run test:e2e` compila la app en modo emulador y corre los flujos completos (también en el CI).
- Cada componente nuevo con lógica propia (validación, estados) lleva tests de componente; las pantallas que solo conectan el store con componentes se cubren con e2e.
