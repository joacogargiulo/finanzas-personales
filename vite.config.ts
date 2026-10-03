import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Vite busca dependencias en todos los .html del proyecto; referencia/ (la app vieja, solo
  // lectura) tiene los suyos con imports que no están instalados. Solo nos interesa index.html.
  optimizeDeps: { entries: ['index.html'] },
  server: { watch: { ignored: ['**/referencia/**'] } },
  test: {
    // Tests unitarios: rápidos, sin emuladores ni navegador.
    include: ['src/**/*.test.{ts,tsx}'],
    // Zona horaria fija: los tests de fechas dan lo mismo en cualquier compu y en el CI (UTC).
    env: { TZ: 'America/Argentina/Buenos_Aires' },
    // `npm run test:coverage`: qué líneas del código no ejecuta ningún test (informe en coverage/).
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/domain/testing/**'],
    },
  },
});
