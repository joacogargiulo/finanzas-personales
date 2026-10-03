import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Tests unitarios: rápidos, sin emuladores ni navegador.
    include: ['src/**/*.test.{ts,tsx}'],
    // Zona horaria fija: los tests de fechas dan lo mismo en cualquier compu y en el CI (UTC).
    env: { TZ: 'America/Argentina/Buenos_Aires' },
  },
});
