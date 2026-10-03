import { defineConfig } from 'vitest/config';

// Tests de la capa data (SRS 11.2.1): usan src/data/ contra el emulador de Firestore, que aplica
// las reglas reales. `npm run test:data` levanta el emulador, corre los tests y lo apaga.
export default defineConfig({
  test: {
    include: ['tests/data/**/*.test.ts'],
    testTimeout: 20_000,
    // Todos los archivos comparten el emulador y lo vacían antes de cada test.
    fileParallelism: false,
  },
});
