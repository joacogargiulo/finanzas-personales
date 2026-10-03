import { defineConfig, devices } from '@playwright/test';

// Tests de punta a punta: abren la app compilada en un navegador real y la usan como una persona.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Compila la app en modo emulador (.env.emulators) y la sirve. `npm run test:e2e` levanta
    // los emuladores de Auth y Firestore antes de correr los tests.
    command:
      'vite build --mode emulators --outDir dist-e2e && ' +
      'vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
