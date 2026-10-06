import { describe, expect, it } from 'vitest';
import rules from '../../firestore.rules?raw';
import { ALLOWED_EMAIL_HASHES, emailHash, isAllowedEmail } from './access';

// La lista de acceso está en dos lugares: firestore.rules y el Worker (ADR 0031).

describe('lista de acceso del Worker', () => {
  // Si alguien suma un familiar en las reglas y se olvida del Worker (o al revés), falla acá.
  it('tiene los mismos hashes que firestore.rules', () => {
    const body = /function allowedEmailHashes\(\) \{([\s\S]*?)\}/.exec(rules)?.[1] ?? '';
    const inRules = [...body.matchAll(/'([0-9a-f]{64})'/g)].map((m) => m[1]);
    expect(inRules.length).toBeGreaterThan(0);
    expect([...ALLOWED_EMAIL_HASHES].sort()).toEqual(inRules.sort());
  });

  // Mismo cálculo que las reglas y `npm run email-hash`: SHA-256 del email en minúsculas.
  it('calcula el hash igual que las reglas, sin importar las mayúsculas', async () => {
    expect(await emailHash('Familia@Example.org ')).toBe(
      '9be03e4d3b3ceb6e42958fea4bbf6ee32a76f52ba29e200489014f07e586503e',
    );
    expect(await isAllowedEmail('familia@example.org')).toBe(true);
    expect(await isAllowedEmail('extrano@gmail.com')).toBe(false);
  });
});
