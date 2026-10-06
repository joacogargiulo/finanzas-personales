import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { describe, it } from 'vitest';
import {
  OWNER,
  useRulesEnv,
  validAccount,
  validBudget,
  validCategory,
  validExpense,
  validProfile,
  validRecurringExpense,
} from './helpers';

// Quién puede entrar a qué (SRS 7.3, TC-19). Cada colección se prueba con un documento válido,
// así el único motivo para que una escritura falle es el acceso.

const { owner, other, anonymous, withToken, seed } = useRulesEnv();

const documents = [
  ['perfil', `users/${OWNER}`, validProfile],
  ['cuenta', `users/${OWNER}/accounts/acc_efectivo`, validAccount],
  ['categoría', `users/${OWNER}/categories/seed_comida`, validCategory],
  ['movimiento', `users/${OWNER}/transactions/tx1`, validExpense],
  ['presupuesto', `users/${OWNER}/budgets/seed_comida_ARS`, validBudget],
  ['recurrente', `users/${OWNER}/recurring/rec1`, validRecurringExpense],
] as const;

describe.each(documents)('%s', (_name, path, valid) => {
  describe('el dueño', () => {
    it('puede crearlo y leerlo', async () => {
      await assertSucceeds(setDoc(doc(owner(), path), valid()));
      await assertSucceeds(getDoc(doc(owner(), path)));
    });

    // El borrado físico existe solo para "Borrar mi cuenta" (ADR 0006).
    it('puede borrarlo', async () => {
      await seed(path, valid());
      await assertSucceeds(deleteDoc(doc(owner(), path)));
    });
  });

  // Otro usuario con sesión y alguien sin sesión: no leen, no escriben y no borran nada ajeno.
  describe.each([
    ['otro usuario', other],
    ['un usuario sin sesión', anonymous],
  ] as const)('%s', (_who, db) => {
    it('no puede leerlo', async () => {
      await seed(path, valid());
      await assertFails(getDoc(doc(db(), path)));
    });

    it('no puede crearlo', async () => {
      await assertFails(setDoc(doc(db(), path), valid()));
    });

    it('no puede borrarlo', async () => {
      await seed(path, valid());
      await assertFails(deleteDoc(doc(db(), path)));
    });
  });
});

// La app es privada (ADR 0026): aunque los datos sean suyos, solo entra quien tiene un email
// verificado de la lista. firestore.rules trae el hash de familia@example.org para estos tests.
describe('lista de acceso', () => {
  const profilePath = (uid: string) => `users/${uid}`;

  it('entra un email de la lista', async () => {
    const db = withToken('fami', { email: 'familia@example.org', email_verified: true });
    await assertSucceeds(setDoc(doc(db, profilePath('fami')), validProfile()));
    await assertSucceeds(getDoc(doc(db, profilePath('fami'))));
  });

  it('las mayúsculas del email no importan', async () => {
    const db = withToken('fami', { email: 'Familia@Example.ORG', email_verified: true });
    await assertSucceeds(getDoc(doc(db, profilePath('fami'))));
  });

  it('no entra un email que no está en la lista, ni siquiera a sus propios datos', async () => {
    const db = withToken('extra', { email: 'extrano@gmail.com', email_verified: true });
    await seed(profilePath('extra'), validProfile());
    await assertFails(getDoc(doc(db, profilePath('extra'))));
    await assertFails(setDoc(doc(db, `users/extra/accounts/acc1`), validAccount()));
  });

  it('no entra un email de la lista sin verificar', async () => {
    const db = withToken('fami', { email: 'familia@example.org', email_verified: false });
    await assertFails(getDoc(doc(db, profilePath('fami'))));
  });

  it('no entra una sesión sin email (por ejemplo, anónima)', async () => {
    const db = withToken('anon', {});
    await assertFails(getDoc(doc(db, profilePath('anon'))));
  });

  // Que el dominio de prueba no abra una puerta: tiene que terminar exactamente en @example.com.
  it('no entra un email que solo se parece al dominio de prueba', async () => {
    const db = withToken('falso', { email: 'ana@example.com.ar', email_verified: true });
    await assertFails(getDoc(doc(db, profilePath('falso'))));
  });
});

describe('consultas', () => {
  it('el dueño puede listar sus movimientos', async () => {
    await assertSucceeds(getDocs(collection(owner(), `users/${OWNER}/transactions`)));
  });

  it('otro usuario no puede listar los movimientos del dueño', async () => {
    await assertFails(getDocs(collection(other(), `users/${OWNER}/transactions`)));
  });
});

describe('lo que no está permitido explícitamente queda denegado', () => {
  it('una colección que no existe en el modelo', async () => {
    await assertFails(setDoc(doc(owner(), `users/${OWNER}/notas/n1`), { texto: 'hola' }));
  });

  it('una colección en la raíz', async () => {
    await assertFails(setDoc(doc(owner(), 'transactions/tx1'), validExpense()));
  });

  // Solo la escribe el servidor (Fase 11); la app no puede ni leerla.
  it('whatsappLinks no se puede leer ni escribir', async () => {
    await seed('whatsappLinks/5491100000000', { uid: OWNER });
    await assertFails(getDoc(doc(owner(), 'whatsappLinks/5491100000000')));
    await assertFails(setDoc(doc(owner(), 'whatsappLinks/5491100000000'), { uid: OWNER }));
  });
});
