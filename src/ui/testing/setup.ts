// Preparación de los tests de componentes (ADR 0019). Corre antes de cada archivo de test.
//
// - Suma a `expect` los "matchers" de jest-dom: `toBeInTheDocument()`, `toBeDisabled()`, etc.
// - Desmonta lo dibujado después de cada test, así un test no ve lo que dejó el anterior.
// - jsdom (el navegador simulado) no implementa `showModal()` de <dialog>: se reemplaza por
//   una versión mínima que solo lo marca como abierto.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });

  // jsdom no implementa showModal() ni close(): versiones mínimas para los tests.
  // (Los tipos de TypeScript dicen que existen, por eso se pregunta con `in`.)
  const dialog = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  if (!('showModal' in dialog) || typeof dialog.showModal !== 'function') {
    dialog.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  if (!('close' in dialog) || typeof dialog.close !== 'function') {
    dialog.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
}
