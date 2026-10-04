// Fila que se puede arrastrar hacia la izquierda para ver sus acciones (Editar, Eliminar), como
// en las apps de mail o mensajería. Usa *pointer events*, que unifican dedo, lápiz y mouse.
//
// - Solo con el dedo o un lápiz: con el mouse (compu) la fila no se arrastra.
// - `touch-action: pan-y` (en el CSS) le dice al navegador que el desplazamiento vertical lo
//   maneja él: si el dedo va hacia arriba o abajo, es un scroll normal de la lista.
// - Tocar la fila sin arrastrarla llama a `onSelect` (abre el panel), así todo se puede hacer
//   también sin el gesto, con el teclado o un lector de pantalla.
// - Quién está abierta lo decide el padre (`open`), así solo hay una fila abierta a la vez.

import { useRef, useState, type ReactNode } from 'react';
import { ACTIONS_WIDTH, decideGesture, dragOffset, settle, type Gesture } from '../swipe';
import { Icon, type IconName } from './Icon';

export interface SwipeAction {
  label: string;
  icon: IconName;
  tone: 'edit' | 'danger';
  onClick: () => void;
}

interface SwipeRowProps {
  children: ReactNode;
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: () => void;
  /** Sin arrastre (por ejemplo, un movimiento que no se puede modificar). */
  disabled?: boolean;
}

interface PointerState {
  id: number;
  x: number;
  y: number;
  gesture: Gesture;
}

export function SwipeRow({
  children,
  actions,
  open,
  onOpenChange,
  onSelect,
  disabled = false,
}: SwipeRowProps) {
  /** Posición mientras el dedo arrastra; `null` cuando no se está arrastrando. */
  const [drag, setDrag] = useState<number | null>(null);
  const pointer = useRef<PointerState | null>(null);
  const latest = useRef<number | null>(null);
  /** Hubo arrastre: el "click" que el navegador dispara al soltar no tiene que abrir el panel. */
  const dragged = useRef(false);

  function update(offset: number | null) {
    latest.current = offset;
    setDrag(offset);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || event.pointerType === 'mouse') return;
    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      gesture: 'undecided',
    };
    dragged.current = false;
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const state = pointer.current;
    if (!state || state.id !== event.pointerId) return;
    const dx = event.clientX - state.x;
    if (state.gesture === 'undecided') {
      state.gesture = decideGesture(dx, event.clientY - state.y);
      if (state.gesture === 'horizontal') {
        // A partir de acá, el dedo "pertenece" a esta fila aunque salga de ella.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Algunos entornos (los tests) no lo implementan; el gesto funciona igual.
        }
      }
    }
    if (state.gesture !== 'horizontal') return;
    dragged.current = true;
    update(dragOffset(open, dx));
  }

  function onPointerUp() {
    const state = pointer.current;
    pointer.current = null;
    if (state?.gesture === 'horizontal' && latest.current !== null) {
      onOpenChange(settle(latest.current));
    }
    update(null);
  }

  function onPointerCancel() {
    pointer.current = null;
    update(null);
  }

  function onClick() {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    if (open) {
      onOpenChange(false);
      return;
    }
    onSelect();
  }

  const offset = drag ?? (open ? -ACTIONS_WIDTH : 0);

  return (
    <li className="swipe">
      <div className="swipe-actions" style={{ width: ACTIONS_WIDTH }} aria-hidden={!open}>
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`swipe-action swipe-action--${action.tone}`}
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange(false);
              action.onClick();
            }}
          >
            <Icon name={action.icon} size={20} />
            {action.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="list-row row-button swipe-content"
        data-dragging={drag !== null || undefined}
        style={{ transform: `translateX(${String(offset)}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        {children}
      </button>
    </li>
  );
}
