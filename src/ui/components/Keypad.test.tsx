// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Keypad } from './Keypad';

// Testing Library busca los elementos como los encuentra una persona (o un lector de pantalla):
// por su rol y su nombre visible o accesible, no por clases CSS.
describe('Keypad', () => {
  it('avisa cada tecla apretada', async () => {
    const onKey = vi.fn();
    render(<Keypad onKey={onKey} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: '1' }));
    await user.click(screen.getByRole('button', { name: '0' }));
    await user.click(screen.getByRole('button', { name: 'Coma decimal' }));
    await user.click(screen.getByRole('button', { name: 'Borrar' }));

    expect(onKey.mock.calls).toEqual([['1'], ['0'], ['decimal'], ['backspace']]);
  });

  it('tiene las 12 teclas con nombre accesible', () => {
    render(<Keypad onKey={vi.fn()} />);
    const group = screen.getByRole('group', { name: 'Teclado numérico' });
    expect(group.querySelectorAll('button')).toHaveLength(12);
  });
});
