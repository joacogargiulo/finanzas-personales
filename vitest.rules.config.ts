import { defineConfig } from 'vitest/config';

// Tests de reglas de seguridad: necesitan el emulador de Firestore corriendo
// (`npm run test:rules` lo levanta, corre los tests y lo apaga).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 15_000,
  },
});
