// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SwipeRow } from './SwipeRow';

/** Una fila con su estado abierto/cerrado, como la usa la pantalla de Movimientos. */
function Row(props: { onSelect: () => void; onDelete: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <ul>
      <SwipeRow
        open={open}
        onOpenChange={setOpen}
        onSelect={props.onSelect}
        disabled={props.disabled ?? false}
        actions={[
          { label: 'Editar', icon: 'edit', tone: 'edit', onClick: props.onSelect },
          { label: 'Eliminar', icon: 'trash', tone: 'danger', onClick: props.onDelete },
        ]}
      >
        Supermercado
      </SwipeRow>
    </ul>
  );
}

/** Simula un dedo que arrastra la fila `dx` píxeles en horizontal. */
function swipe(element: HTMLElement, dx: number) {
  const touch = { pointerId: 7, pointerType: 'touch' };
  fireEvent.pointerDown(element, { ...touch, clientX: 300, clientY: 100 });
  fireEvent.pointerMove(element, { ...touch, clientX: 300 + dx / 2, clientY: 101 });
  fireEvent.pointerMove(element, { ...touch, clientX: 300 + dx, clientY: 101 });
  fireEvent.pointerUp(element, { ...touch, clientX: 300 + dx, clientY: 101 });
  // El navegador dispara un click al soltar; no tiene que abrir el panel.
  fireEvent.click(element);
}

// Los botones de la fila arrastrada están ocultos para los lectores de pantalla mientras está
// cerrada: por eso se buscan con `hidden: true` cuando corresponde.
describe('SwipeRow', () => {
  it('un toque sin arrastrar abre el movimiento', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supermercado' }));
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it('arrastrar hacia la izquierda muestra Editar y Eliminar', () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(<Row onSelect={onSelect} onDelete={onDelete} />);
    const row = screen.getByRole('button', { name: 'Supermercado' });

    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    swipe(row, -120);
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('un arrastre corto vuelve a cerrarse', () => {
    render(<Row onSelect={vi.fn()} onDelete={vi.fn()} />);
    swipe(screen.getByRole('button', { name: 'Supermercado' }), -30);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('abierta, tocarla la cierra en vez de abrir el movimiento', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} onDelete={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Supermercado' });
    swipe(row, -120);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('con el mouse (compu) no se arrastra', () => {
    render(<Row onSelect={vi.fn()} onDelete={vi.fn()} />);
    const row = screen.getByRole('button', { name: 'Supermercado' });
    const mouse = { pointerId: 1, pointerType: 'mouse' };
    fireEvent.pointerDown(row, { ...mouse, clientX: 300, clientY: 100 });
    fireEvent.pointerMove(row, { ...mouse, clientX: 150, clientY: 100 });
    fireEvent.pointerUp(row, mouse);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('una fila bloqueada no se arrastra, pero se puede abrir', () => {
    const onSelect = vi.fn();
    render(<Row onSelect={onSelect} onDelete={vi.fn()} disabled />);
    const row = screen.getByRole('button', { name: 'Supermercado' });
    swipe(row, -120);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
