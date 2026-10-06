import { expect, test as base } from '@playwright/test';

// `test` de Playwright con un control automático (ADR 0027): si la Content-Security-Policy
// bloquea algo durante un test, el test falla. Así una CSP demasiado estricta no llega a Hosting.
// Todos los specs importan `test` y `expect` desde acá.
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && message.text().includes('Content Security Policy')) {
          violations.push(message.text());
        }
      });
      await use(undefined);
      expect(violations, 'la CSP bloqueó algo').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
