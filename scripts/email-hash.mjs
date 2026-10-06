// Calcula el hash que va en la lista de acceso de firestore.rules (ADR 0026).
// Uso: npm run email-hash -- persona@gmail.com
// Las reglas comparan el SHA-256 del email en minúsculas, así que acá se normaliza igual.

import { createHash } from 'node:crypto';

const emails = process.argv.slice(2);
if (emails.length === 0) {
  console.error('Uso: npm run email-hash -- persona@gmail.com [otra@gmail.com ...]');
  process.exit(1);
}

for (const raw of emails) {
  const email = raw.trim().toLowerCase();
  const hash = createHash('sha256').update(email).digest('hex');
  // Se imprime listo para pegar en allowedEmailHashes(), sin el email: el repo es público.
  console.log(`'${hash}',`);
}
