// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DeletingAccountScreen } from './DeletingAccountScreen';

// Cada etapa de "Borrar mi cuenta" muestra lo que está pasando (ADR 0030).
describe('pantalla de borrado de la cuenta', () => {
  it('mientras borra, muestra el progreso', () => {
    render(
      <DeletingAccountScreen
        state={{ phase: 'deleting', done: 500, total: 1_200 }}
        onReload={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Borrando tu cuenta…' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progreso del borrado' })).toHaveAttribute(
      'value',
      '500',
    );
    expect(screen.getByRole('status')).toHaveTextContent('500 de 1.200 datos borrados');
  });

  it('al terminar, "Listo" recarga la app', async () => {
    const onReload = vi.fn();
    render(<DeletingAccountScreen state={{ phase: 'done' }} onReload={onReload} />);
    expect(screen.getByRole('heading', { name: 'Tu cuenta se borró' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Listo' }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  // La cuota diaria de borrados es del proyecto entero (plan Spark): se avisa que se retoma.
  it('si se agotó la cuota, explica que sigue mañana', () => {
    render(
      <DeletingAccountScreen state={{ phase: 'error', failure: 'quota' }} onReload={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('límite diario de borrados');
    expect(screen.getByRole('button', { name: 'Volver a la app' })).toBeInTheDocument();
  });
});
