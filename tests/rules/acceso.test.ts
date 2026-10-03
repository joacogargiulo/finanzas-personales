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

const { owner, other, anonymous, seed } = useRulesEnv();

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
