// Teclado numérico propio (ADR 0001). Solo avisa qué tecla se apretó; cómo cambia el monto lo
// decide `pressAmountKey` del dominio.

import type { AmountKey } from '../../domain/amountInput';
import { Icon } from './Icon';

const DIGITS: AmountKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

interface KeypadProps {
  onKey: (key: AmountKey) => void;
}

export function Keypad({ onKey }: KeypadProps) {
  return (
    <div className="keypad" role="group" aria-label="Teclado numérico">
      {DIGITS.map((digit) => (
        <button
          key={digit}
          type="button"
          className="key"
          onClick={() => {
            onKey(digit);
          }}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        className="key"
        aria-label="Coma decimal"
        onClick={() => {
          onKey('decimal');
        }}
      >
        ,
      </button>
      <button
        type="button"
        className="key"
        onClick={() => {
          onKey('0');
        }}
      >
        0
      </button>
      <button
        type="button"
        className="key"
        aria-label="Borrar"
        onClick={() => {
          onKey('backspace');
        }}
      >
        <Icon name="backspace" size={22} />
      </button>
    </div>
  );
}
