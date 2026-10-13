// Ajustes → WhatsApp (ADR 0033): vincular el número para cargar movimientos con el bot.
// El vínculo vive en el Worker, así que todo necesita conexión. Para vincular, la app pide un
// código de 6 cifras y la persona se lo manda al bot ("vincular 123456") desde su WhatsApp.

import { useCallback, useEffect, useState } from 'react';
import { linkMessageUrl } from '../../domain/whatsapp';
import { WhatsAppLinkError } from '../../data/whatsappLink';
import { useOnline } from '../app/hooks';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { WHATSAPP_BOT_NUMBER, whatsappLink } from '../session';

type View =
  | { kind: 'loading' }
  | { kind: 'unknown' } // no se pudo consultar el estado
  | { kind: 'unlinked' }
  | { kind: 'code'; code: string; expiresAt: number; checked: boolean }
  | { kind: 'linked'; phone: string };

function errorText(error: unknown): string {
  if (error instanceof WhatsAppLinkError && error.code === 'offline') return 'Necesita conexión.';
  return 'No se pudo conectar con el servidor. Probá de nuevo en un rato.';
}

function timeLabel(ms: number): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(ms);
}

export function WhatsAppSettings() {
  // Sin Worker o sin número del bot (por ejemplo, con los emuladores), no se ofrece.
  if (!whatsappLink.configured || WHATSAPP_BOT_NUMBER === '') return null;
  return <WhatsAppCard />;
}

function WhatsAppCard() {
  const online = useOnline();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(
    () =>
      whatsappLink.status().then(
        (phone) => {
          setError(null);
          setView((previous) => {
            if (phone !== null) return { kind: 'linked', phone };
            // Mientras el código siga vivo, se sigue mostrando: el mensaje puede estar en camino.
            if (previous.kind === 'code' && Date.now() < previous.expiresAt) {
              return { ...previous, checked: true };
            }
            return { kind: 'unlinked' };
          });
        },
        (caught: unknown) => {
          setError(errorText(caught));
          setView((previous) => (previous.kind === 'loading' ? { kind: 'unknown' } : previous));
        },
      ),
    [],
  );

  // Se consulta al abrir Ajustes y al volver a la app (por ejemplo, desde WhatsApp).
  useEffect(() => {
    if (!online) return;
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [online, refresh]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }

  const requestCode = () =>
    run(async () => {
      const { code, expiresAt } = await whatsappLink.requestCode();
      setView({ kind: 'code', code, expiresAt, checked: false });
    });

  const unlink = () =>
    run(async () => {
      await whatsappLink.unlink();
      setView({ kind: 'unlinked' });
    });

  const disabled = !online || busy;
  return (
    <section className="card" aria-labelledby="whatsapp-title">
      <h2 id="whatsapp-title" className="card-title">
        WhatsApp
      </h2>
      <p className="field-hint">
        Vinculá tu número para cargar movimientos mandándole un mensaje al bot.
      </p>

      {view.kind === 'loading' && online && (
        <p className="field-hint" role="status">
          Consultando…
        </p>
      )}

      {view.kind === 'unknown' && (
        <button
          type="button"
          className="btn"
          disabled={disabled}
          onClick={() => {
            void run(refresh);
          }}
        >
          Reintentar
        </button>
      )}

      {view.kind === 'unlinked' && (
        <button
          type="button"
          className="btn btn-primary"
          disabled={disabled}
          onClick={() => {
            void requestCode();
          }}
        >
          Vincular WhatsApp
        </button>
      )}

      {view.kind === 'code' && (
        <div className="export-option">
          <p>Mandale este mensaje al bot desde tu WhatsApp:</p>
          <p className="link-code">vincular {view.code}</p>
          <a
            className="btn btn-primary"
            href={linkMessageUrl(WHATSAPP_BOT_NUMBER, view.code)}
            target="_blank"
            rel="noreferrer"
          >
            Abrir WhatsApp
          </a>
          <p className="field-hint">
            El código vence a las {timeLabel(view.expiresAt)}. Cuando el bot te confirme, tocá
            &quot;Ya lo mandé&quot;.
          </p>
          <button
            type="button"
            className="btn"
            disabled={disabled}
            onClick={() => {
              void run(refresh);
            }}
          >
            Ya lo mandé
          </button>
          {view.checked && (
            <p className="field-hint" role="status">
              Todavía no aparece vinculado. Puede tardar hasta un minuto después de que el bot te
              conteste.
            </p>
          )}
        </div>
      )}

      {view.kind === 'linked' && (
        <div className="export-option">
          <p>
            Vinculado con <strong>{view.phone}</strong>.
          </p>
          <button
            type="button"
            className="btn btn-danger-text"
            disabled={disabled}
            onClick={() => {
              setConfirming(true);
            }}
          >
            Desvincular
          </button>
        </div>
      )}

      {!online && <p className="field-hint">Necesita conexión.</p>}
      {error !== null && online && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {confirming && view.kind === 'linked' && (
        <ConfirmDialog
          title="¿Desvincular WhatsApp?"
          confirmLabel="Desvincular"
          danger
          onClose={() => {
            setConfirming(false);
          }}
          onConfirm={() => {
            setConfirming(false);
            void unlink();
          }}
        >
          <p>
            El bot deja de reconocer el número {view.phone}. Podés volver a vincularlo cuando
            quieras.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}
