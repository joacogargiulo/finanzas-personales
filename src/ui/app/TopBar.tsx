// Barra superior (SRS 6.2): título de la pantalla, indicador de sincronización y avatar con
// el menú de la cuenta de Google.

import { useEffect, useRef, useState } from 'react';
import type { SessionUser } from '../../data/auth';
import { Icon } from '../components/Icon';
import { initials, syncState, type SyncState } from '../format';
import { useData, useOnline } from './hooks';
import { signOutWithWarning } from './signOut';

const SYNC_TEXT: Record<SyncState, string> = {
  offline: 'Sin conexión',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
};

const SYNC_ICON = {
  offline: 'cloud-off',
  syncing: 'cloud-sync',
  synced: 'cloud-check',
} as const;

export function SyncIndicator() {
  const sync = useData((s) => s.sync);
  const state = syncState(sync, useOnline());
  const pendingNote =
    state === 'offline' && sync.pendingWrites
      ? 'Tenés cambios guardados en este dispositivo que se van a subir al recuperar la conexión.'
      : undefined;
  return (
    <span className="sync" role="status" title={pendingNote}>
      <Icon name={SYNC_ICON[state]} size={18} />
      <span>{SYNC_TEXT[state]}</span>
    </span>
  );
}

export function AccountMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const pendingWrites = useData((s) => s.sync.pendingWrites);
  const anchor = useRef<HTMLDivElement>(null);

  // Se cierra con Escape o tocando afuera.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-anchor" ref={anchor}>
      <button
        type="button"
        className="avatar"
        aria-label="Tu cuenta"
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {initials(user.displayName, user.email)}
      </button>
      {open && (
        <div className="menu">
          <div>
            <p className="menu-name">{user.displayName ?? 'Tu cuenta'}</p>
            <p className="menu-email">{user.email}</p>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => void signOutWithWarning(pendingWrites)}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({ title, user }: { title: string; user: SessionUser }) {
  return (
    <header className="topbar">
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-actions">
        <SyncIndicator />
        <AccountMenu user={user} />
      </div>
    </header>
  );
}
