import { describe, expect, it, vi } from 'vitest';
import { startAppUpdates, UPDATE_CHECK_MS, type AppUpdateDeps, type RegisterSW } from './appUpdate';
import { createDataStore } from './store';

// Un `registerSW` falso: guarda las funciones que la app le pasa, así cada test puede simular lo
// que haría el navegador (encontrar una versión nueva, terminar de registrar el service worker).
function setup(online = true) {
  let options: Parameters<RegisterSW>[0] = {};
  const updateSW = vi.fn(() => Promise.resolve());
  const registerSW: RegisterSW = (o) => {
    options = o;
    return updateSW;
  };
  let tick: (() => void) | null = null;
  const deps: AppUpdateDeps = {
    isOnline: () => online,
    setInterval: vi.fn((callback: () => void) => {
      tick = callback;
    }),
  };
  const store = createDataStore();
  const updates = startAppUpdates(store, registerSW, deps);
  return { store, updates, updateSW, deps, options: () => options, tick: () => tick?.() };
}

// El aviso "Hay una versión nueva" (ADR 0027): la app nunca se recarga sola.
describe('versión nueva', () => {
  it('al principio no hay nada que avisar', () => {
    expect(setup().store.getState().updateAvailable).toBe(false);
  });

  it('cuando el navegador descarga una versión nueva, el store lo avisa', () => {
    const { store, options, updateSW } = setup();
    options().onNeedRefresh?.();
    expect(store.getState().updateAvailable).toBe(true);
    expect(updateSW).not.toHaveBeenCalled();
  });

  it('Actualizar activa la versión nueva y recarga', () => {
    const { updates, updateSW } = setup();
    updates.apply();
    expect(updateSW).toHaveBeenCalledWith(true);
  });
});

// Una PWA puede quedar abierta días: se pregunta por versiones nuevas cada hora.
describe('búsqueda periódica', () => {
  function registration() {
    const update = vi.fn(() => Promise.resolve());
    return { update, reg: { update } as unknown as ServiceWorkerRegistration };
  }

  it('pregunta cada hora si hay conexión', () => {
    const { options, deps, tick } = setup(true);
    const { update, reg } = registration();
    options().onRegisteredSW?.('/sw.js', reg);
    expect(deps.setInterval).toHaveBeenCalledWith(expect.any(Function), UPDATE_CHECK_MS);
    tick();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('sin conexión no pregunta', () => {
    const { options, tick } = setup(false);
    const { update, reg } = registration();
    options().onRegisteredSW?.('/sw.js', reg);
    tick();
    expect(update).not.toHaveBeenCalled();
  });
});
