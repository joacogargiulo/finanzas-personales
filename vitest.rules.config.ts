import { defineConfig } from 'vitest/config';

// Tests de reglas de seguridad: necesitan el emulador de Firestore corriendo
// (`npm run test:rules` lo levanta, corre los tests y lo apaga).
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 15_000,
    // Todos los archivos usan la misma base del emulador y la vacían antes de cada test:
    // si corrieran en paralelo, uno borraría los datos que está usando otro.
    fileParallelism: false,
  },
});
