import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Tests unitarios: rápidos, sin emuladores ni navegador.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
