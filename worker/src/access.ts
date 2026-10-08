// Lista de acceso del Worker (ADR 0026 y 0031): los mismos hashes SHA-256 de email que
// `allowedEmailHashes()` en firestore.rules. Un test verifica que las dos listas coincidan.
// Para sumar a alguien: pegar el hash acá y en las reglas, y publicar las dos cosas.

export const ALLOWED_EMAIL_HASHES: readonly string[] = [
  '19f47daa851353d259fd1fdd33b8b15709277606f0ca1b651b6eca67875aee5b',
  // Cuenta de prueba del dueño (para probar Borrar mi cuenta y TC-19).
  '9e7dd704577b523a2f17e30242eed3d0eba82875cf20bc8f43f863c3f0fe23b0',
  // familia@example.org: solo para los tests (example.org es un dominio reservado).
  '9be03e4d3b3ceb6e42958fea4bbf6ee32a76f52ba29e200489014f07e586503e',
];

/** SHA-256 del email en minúsculas, en hexadecimal (igual que las reglas y `npm run email-hash`). */
export async function emailHash(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isAllowedEmail(email: string): Promise<boolean> {
  return ALLOWED_EMAIL_HASHES.includes(await emailHash(email));
}
