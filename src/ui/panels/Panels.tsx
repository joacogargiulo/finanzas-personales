// Abre el panel que indica la dirección (ADR 0018) y lo conecta con los datos y las escrituras.
// Guardar nunca espera a Firestore (CLAUDE.md, regla 3): el panel se cierra enseguida y el
// cambio aparece en la pantalla por el listener a la caché (ADR 0016).

import { useEffect } from 'react';
import { errorMessage } from '../../domain/errors';
import { canModifyTransaction } from '../../domain/validation';
import { useData, useLedger, useToday } from '../app/hooks';
import { closePanel, openPanel } from '../app/navigation';
import type { Panel } from '../app/route';
import { session } from '../session';
import { AccountSheet } from './AccountSheet';
import { TransactionSheet } from './TransactionSheet';

const BLOCKED_MESSAGE =
  'Hay una versión nueva de la app. Actualizala para seguir cargando movimientos.';

export function Panels({ panel }: { panel: Panel | null }) {
  const { accounts, categories, transactions, accountsById } = useLedger();
  const loaded = useData((s) => s.loaded.transactions);
  const writesBlocked = useData((s) => s.writesBlocked);
  const today = useToday();

  const original =
    panel?.kind === 'transaction' && panel.id
      ? transactions.find((tx) => tx.id === panel.id && tx.deletedAt === null)
      : undefined;
  // Un movimiento que no existe (o se eliminó en otro dispositivo): se cierra el panel.
  const missing = panel?.kind === 'transaction' && panel.id !== null && loaded && !original;
  useEffect(() => {
    if (missing) closePanel();
  }, [missing]);

  if (!panel || missing) return null;

  if (panel.kind === 'account') {
    return (
      <AccountSheet
        accounts={accounts}
        onClose={closePanel}
        onSave={(fields) => {
          if (writesBlocked) return;
          session.writer()?.createAccount(fields);
          closePanel();
        }}
      />
    );
  }

  // Edición de un movimiento que todavía no llegó del almacenamiento local.
  if (panel.id !== null && !original) return null;

  const locked = original ? canModifyTransaction(original, accountsById) : null;
  const lockedReason = writesBlocked
    ? BLOCKED_MESSAGE
    : locked && !locked.ok
      ? errorMessage(locked.error)
      : null;

  return (
    <TransactionSheet
      key={panel.id ?? 'nuevo'}
      accounts={accounts}
      categories={categories}
      today={today}
      original={original}
      lockedReason={lockedReason}
      onClose={closePanel}
      onCreateAccount={() => {
        openPanel({ kind: 'account', id: null });
      }}
      onSave={(fields) => {
        const writer = session.writer();
        if (!writer) return;
        if (original) writer.updateTransaction(original, fields);
        else writer.createTransaction(fields);
        closePanel();
      }}
    />
  );
}
