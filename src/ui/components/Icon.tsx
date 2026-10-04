// Íconos SVG de trazo, dibujados en una grilla de 24×24 (ADR 0020). Toman el color del texto
// (`currentColor`). Son decorativos (`aria-hidden`): el botón que los contiene lleva el texto
// o un `aria-label`.

import type { ReactElement } from 'react';
import type { CategoryIcon } from '../../domain/categoryStyle';

type UiIcon =
  | 'home'
  | 'list'
  | 'chart'
  | 'settings'
  | 'plus'
  | 'close'
  | 'cloud-check'
  | 'cloud-off'
  | 'cloud-sync'
  | 'warning'
  | 'backspace'
  | 'edit'
  | 'trash'
  | 'more'
  | 'chevron'
  | 'filter'
  | 'search'
  | 'income'
  | 'expense'
  | 'transfer'
  | 'exchange'
  | 'cash'
  | 'bank'
  | 'wallet'
  | 'investment'
  | 'other';

export type IconName = UiIcon | CategoryIcon;

const PATHS: Record<IconName, ReactElement> = {
  // Navegación y acciones
  home: <path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 15v3M12 10v8M17 6v12" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  'cloud-check': (
    <>
      <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5z" />
      <path d="m9.5 13.5 2 2 3.5-3.5" />
    </>
  ),
  'cloud-off': (
    <>
      <path d="M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 1.3-2.6M11 5.6A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 3 7.9M17 18H7" />
      <path d="M3 3l18 18" />
    </>
  ),
  'cloud-sync': (
    <>
      <path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4.5 4.5 0 0 1 0 9.5z" />
      <path d="M9.5 12.5a2.5 2.5 0 0 1 4.5-1M14.5 13.5a2.5 2.5 0 0 1-4.5 1" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  backspace: (
    <>
      <path d="M9 5h11v14H9l-6-7z" />
      <path d="m12 9 5 6M17 9l-5 6" />
    </>
  ),

  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  more: <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />,
  chevron: <path d="m6 9 6 6 6-6" />,
  filter: <path d="M3 5h18l-7 8v6l-4-2v-4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),

  // Tipos de movimiento
  income: <path d="M7 17 17 7M9 7h8v8" />,
  expense: <path d="M17 7 7 17M7 9v8h8" />,
  transfer: <path d="M4 8h14l-3-3M20 16H6l3 3" />,
  exchange: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .9-3 2s1.3 1.7 3 2 3 .9 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6v2M12 16v2" />
    </>
  ),

  // Tipos de cuenta
  cash: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01M18 12h.01" />
    </>
  ),
  bank: <path d="M3 10 12 4l9 6M5 10v8M9.7 10v8M14.3 10v8M19 10v8M3 20h18" />,
  wallet: (
    <>
      <path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4H5a2 2 0 0 0 0 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
      <path d="M16 14h.01" />
    </>
  ),
  investment: <path d="m3 17 6-6 4 4 8-8M15 7h6v6" />,
  other: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
    </>
  ),

  // Categorías (src/domain/categoryStyle.ts)
  tag: (
    <>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <path d="M7.5 7.5h.01" />
    </>
  ),
  food: <path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1-4 3.5-4 7v3h4" />,
  cart: (
    <>
      <path d="M3 4h2l2.4 11h11.2L21 7H6.2" />
      <circle cx="9" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </>
  ),
  transport: (
    <>
      <rect x="4" y="3" width="16" height="15" rx="2" />
      <path d="M4 11h16M8 18v3M16 18v3M8 14.5h.01M16 14.5h.01" />
    </>
  ),
  car: (
    <>
      <path d="M5 16H3v-4l2-5h14l2 5v4h-2M5 12h14" />
      <circle cx="7.5" cy="16.5" r="1.5" />
      <circle cx="16.5" cy="16.5" r="1.5" />
      <path d="M9 16.5h6" />
    </>
  ),
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  phone: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M11 18h2" />
    </>
  ),
  health: (
    <path d="M20.5 8.5a5 5 0 0 0-8.5-3.5 5 5 0 0 0-8.5 3.5c0 5.5 8.5 11.5 8.5 11.5s3-2 5.3-4.5M3 12h4l2-3 3 6 2-3h7" />
  ),
  education: (
    <>
      <path d="M2 9l10-5 10 5-10 5z" />
      <path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6" />
    </>
  ),
  leisure: (
    <>
      <path d="M3 8a2 2 0 0 0 0 4v0a2 2 0 0 0 0 4v2h18v-2a2 2 0 0 1 0-4 2 2 0 0 1 0-4V6H3z" />
      <path d="M14 6v12" strokeDasharray="2 2" />
    </>
  ),
  travel: (
    <path d="M10.5 13.5 3 11l1.5-1.5 8 1 4-4c1-1 3-1.5 3.5-1s0 2.5-1 3.5l-4 4 1 8L14.5 21l-2.5-7.5-3 3V19l-1.5 1-1-3.5-3.5-1L4 14h2.5z" />
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="5" rx="1" />
      <path d="M5 13v8h14v-8M12 8v13M12 8C10 4 6.5 4.5 7.5 7c.4 1 2.5 1 4.5 1zm0 0c2-4 5.5-3.5 4.5-1-.4 1-2.5 1-4.5 1z" />
    </>
  ),
  pet: (
    <>
      <circle cx="6" cy="10" r="2" />
      <circle cx="10" cy="5.5" r="2" />
      <circle cx="14" cy="5.5" r="2" />
      <circle cx="18" cy="10" r="2" />
      <path d="M8 18.5c0-3 1.8-6 4-6s4 3 4 6c0 1.8-1.8 2.5-4 1.5-2.2 1-4 .3-4-1.5z" />
    </>
  ),
  clothes: <path d="M8 3 3 6l2 5 2-1v11h10V10l2 1 2-5-5-3c-.5 2-2 3-4 3s-3.5-1-4-3z" />,
  salary: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="9" cy="7" rx="6" ry="3" />
      <path d="M3 7v5c0 1.7 2.7 3 6 3M3 12v5c0 1.7 2.7 3 6 3" />
      <ellipse cx="15" cy="14" rx="6" ry="3" />
      <path d="M9 14v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
    </>
  ),
  savings: (
    <>
      <path d="M19 10.5c0-3.6-3.4-6.5-7.5-6.5S4 6.9 4 10.5c0 2 1 3.8 2.6 5L6 20h3l.5-2h4l.5 2h3l-.6-4.3A6.8 6.8 0 0 0 19 12.5h2v-3h-2z" />
      <path d="M8 9h.01M11 6.5h3" />
    </>
  ),
};

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, strokeWidth = 1.8 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
