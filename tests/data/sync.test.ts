import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  disableNetwork,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  waitForPendingWrites,
  where,
} from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import { collectionRef } from '../../src/data/paths';
import type { AccountFields } from '../../src/data/writes';
import { createClient, OWNER, PROJECT_ID, syncInto, until, useDataEnv, writerFor } from './helpers';

// Sincronización incremental con dos listeners (ADR 0003 y 0016, SRS 11.2.1).

useDataEnv();

const cash: AccountFields = { name: 'Efectivo', currency: 'ARS', initialBalance: 0, kind: 'cash' };

describe('el problema que resuelve el ADR 0016', () => {
  // Esto documenta el comportamiento del SDK que motivó el ADR: si la app se alimentara del
  // listener filtrado, un gasto cargado sin conexión no aparecería en la pantalla.
  it('un listener filtrado por updatedAt no ve una escritura pendiente, y el de la caché sí', async () => {
    const db = createClient(OWNER);
    const ref = collectionRef(db, OWNER, 'accounts');
    let filtered: string[] | null = null;
    let fromServer = false;
    let cached: string[] = [];
    onSnapshot(
      query(ref, where('updatedAt', '>', Timestamp.fromMillis(0))),
      { includeMetadataChanges: true },
      (snapshot) => {
        filtered = snapshot.docs.map((d) => d.id);
        fromServer ||= !snapshot.metadata.fromCache;
      },
    );
    onSnapshot(ref, { source: 'cache' }, (snapshot) => {
      cached = snapshot.docs.map((d) => d.id);
    });
    await until(() => fromServer, 'el listener filtrado se conecta');

    await disableNetwork(db);
    const id = writerFor(db).writer.createAccount(cash);

    await until(() => cached.includes(id), 'el listener a la caché ve la cuenta');
    expect(filtered).toEqual([]);
  });
});

describe('las escrituras propias', () => {
  it('aparecen al instante aunque no haya conexión', async () => {
    const db = createClient(OWNER);
    const { state } = syncInto(db);
    await until(() => state.collections.accounts !== undefined, 'primera foto de la caché');

    await disableNetwork(db);
    const id = writerFor(db).writer.createAccount(cash);

    await until(() => state.collections.accounts?.some((a) => a.id === id) === true, 'la cuenta');
    // El indicador de sincronización tiene que mostrar que hay cambios sin subir.
    expect(state.status.pendingWrites).toBe(true);
  });

  it('una edición pendiente no hace desaparecer el documento', async () => {
    const db = createClient(OWNER);
    const { state } = syncInto(db);
    const { writer } = writerFor(db);
    const id = writer.createAccount(cash);
    await waitForPendingWrites(db);

    await disableNetwork(db);
    writer.updateAccount(id, { name: 'Billetera' });

    await until(() => state.collections.accounts?.[0]?.name === 'Billetera', 'el nombre nuevo');
    expect(state.collections.accounts).toHaveLength(1);
  });
});

describe('cambios de otro dispositivo', () => {
  it('llegan a la caché y al store', async () => {
    const phone = createClient(OWNER);
    const computer = createClient(OWNER);
    const { state } = syncInto(computer);
    await until(() => state.status.upToDate, 'la compu se conecta');

    const id = writerFor(phone).writer.createAccount(cash);

    await until(
      () => state.collections.accounts?.some((a) => a.id === id) === true,
      'la cuenta creada en el celular',
    );
  });

  // TC-24: eliminar en un dispositivo hace desaparecer el movimiento en el otro.
  it('una lápida llega al otro dispositivo', async () => {
    const phone = createClient(OWNER);
    const computer = createClient(OWNER);
    const { state } = syncInto(computer);
    const { writer } = writerFor(phone);
    const id = writer.createAccount(cash);
    await until(() => state.collections.accounts?.length === 1, 'la cuenta');

    writer.deleteAccount(id);

    await until(() => state.collections.accounts?.[0]?.deletedAt != null, 'la lápida');
  });

  it('un dispositivo sin caché descarga todo', async () => {
    const phone = createClient(OWNER);
    const { writer } = writerFor(phone);
    writer.createAccount(cash);
    writer.createAccount({ ...cash, name: 'Banco', kind: 'bank' });
    writer.createAccount({ ...cash, name: 'Dólares', currency: 'USD' });
    await waitForPendingWrites(phone);

    const { state } = syncInto(createClient(OWNER));

    await until(() => state.collections.accounts?.length === 3, 'las 3 cuentas');
  });
});

describe('el cursor', () => {
  // Prueba que, al volver a abrir la app, solo se le pide al servidor lo que cambió después
  // del cursor (updatedAt más alto de la caché menos 10 minutos).
  it('no vuelve a pedir documentos más viejos que el cursor', async () => {
    const db = createClient(OWNER);
    const first = syncInto(db);
    writerFor(db).writer.createAccount(cash);
    await until(
      () => first.state.collections.accounts?.length === 1 && !first.state.status.pendingWrites,
      'la cuenta confirmada por el servidor',
    );
    const latest = first.state.collections.accounts?.[0]?.updatedAt ?? 0;
    first.stop(); // "cerrar la app"

    // Mientras tanto, aparecen dos documentos en el servidor (escritos salteando las reglas
    // para poder elegir su updatedAt): uno de hace una hora y otro de ahora.
    const admin = await initializeTestEnvironment({ projectId: PROJECT_ID });
    await admin.withSecurityRulesDisabled(async (ctx) => {
      const base = { ...cash, archivedAt: null, createdAt: 1, deletedAt: null };
      const accounts = `users/${OWNER}/accounts`;
      const db = ctx.firestore();
      await setDoc(doc(db, accounts, 'vieja'), {
        ...base,
        updatedAt: Timestamp.fromMillis(latest - 60 * 60 * 1000),
      });
      await setDoc(doc(db, accounts, 'nueva'), { ...base, updatedAt: serverTimestamp() });
    });
    await admin.cleanup();

    const second = syncInto(db); // "volver a abrir la app"

    await until(
      () => second.state.collections.accounts?.some((a) => a.id === 'nueva') === true,
      'la cuenta nueva',
    );
    await until(() => second.state.status.upToDate, 'al día con el servidor');
    expect(second.state.collections.accounts?.map((a) => a.id)).not.toContain('vieja');
  });
});
