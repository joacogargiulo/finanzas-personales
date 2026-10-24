import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_REPLIES } from '../../src/domain/whatsapp';
import { replyTo, transactionId, type IncomingMessage } from './bot';
import { anaContext, ANA, ANA_UID, botKit, TODAY, type BotKit } from './botTestKit';
import { makeAccount } from '../../src/domain/testing/factories';

// El flujo del bot (ADR 0034) con un KV falso, una IA falsa y un Firestore falso: qué responde
// y qué escribe ante cada mensaje. Nada de esto toca la red.

let kit: BotKit;

beforeEach(() => {
  kit = botKit();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

let counter = 0;
function text(body: string, from = ANA): IncomingMessage {
  counter += 1;
  return { id: `wamid.${String(counter)}`, from, kind: 'text', text: body };
}
const button = (buttonId: string): IncomingMessage => ({
  id: 'wamid.button',
  from: ANA,
  kind: 'button',
  buttonId,
});
const audio: IncomingMessage = { id: 'wamid.audio', from: ANA, kind: 'audio', mediaId: 'media1' };

/** Manda un gasto, toca Guardar y devuelve el ID del movimiento. */
async function propose(message = text('gasté 18 mil en el súper')) {
  const reply = await replyTo(message, kit.deps);
  return { reply, txId: await transactionId(message.id) };
}

describe('quién puede hablarle al bot', () => {
  it('un número sin vincular recibe cómo vincularlo', async () => {
    const reply = await replyTo(text('hola', '5491199999999'), kit.deps);
    expect(reply.text).toBe(BOT_REPLIES.notLinked);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
  });

  // Los vínculos de la 11c no guardaron el email: hay que volver a vincular.
  it('un vínculo sin email pide volver a vincular', async () => {
    kit.store.data.delete(`email:${ANA_UID}`);
    expect((await replyTo(text('gasté 500'), kit.deps)).text).toBe(BOT_REPLIES.relink);
  });

  it('un email fuera de la lista no gasta IA ni lee datos', async () => {
    kit.store.data.set(`email:${ANA_UID}`, 'otra@example.com');
    expect((await replyTo(text('gasté 500'), kit.deps)).text).toBe(BOT_REPLIES.noAccess);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
    expect(kit.mocks.readContext).not.toHaveBeenCalled();
    expect(kit.quotaStore.data.size).toBe(0);
  });

  it('vincular sigue funcionando', async () => {
    kit.store.data.set('codigo:123456', 'beto');
    const reply = await replyTo(text('vincular 123456', '5491122222222'), kit.deps);
    expect(reply.text).toBe(BOT_REPLIES.linked);
  });

  it('una foto o un sticker pide texto o audio', async () => {
    const reply = await replyTo({ id: 'x', from: ANA, kind: 'other' }, kit.deps);
    expect(reply.text).toBe(BOT_REPLIES.onlyTextOrAudio);
  });
});

describe('proponer un movimiento', () => {
  it('responde con el resumen y los botones, y no escribe nada todavía', async () => {
    const { reply, txId } = await propose();

    expect(reply.text).toContain('Gasto de $ 18.000,00');
    expect(reply.text).toContain('Categoría: Comida');
    expect(reply.text).toContain('Fecha: hoy (14/10/2026)');
    expect(reply.buttons).toEqual([
      { id: `guardar:${txId}`, title: 'Guardar' },
      { id: `cancelar:${txId}`, title: 'Cancelar' },
    ]);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
    expect(kit.store.ttls.get(`pendiente:${ANA}`)).toBe(600);
  });

  it('el ID del movimiento sale del ID del mensaje, siempre el mismo', async () => {
    const id = await transactionId('wamid.abc');
    expect(id).toMatch(/^wa_[0-9a-f]{20}$/);
    expect(await transactionId('wamid.abc')).toBe(id);
    expect(await transactionId('wamid.abd')).not.toBe(id);
  });

  it('gasta una unidad de la cuota diaria compartida con el dictado', async () => {
    await propose();
    expect(kit.quotaStore.data.get(`uso:${ANA_UID}:${TODAY}`)).toBe('1');
  });

  // Frase incompleta: el bot dice qué falta y no ofrece guardar.
  it('si falta un dato, dice cuál y no ofrece guardar', async () => {
    kit.mocks.interpret.mockResolvedValue({ ...SUPER(), categoryId: null });
    const reply = await replyTo(text('gasté 18 mil'), kit.deps);
    expect(reply.text).toContain('la categoría');
    expect(reply.buttons).toBeUndefined();
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  it('si no se entiende nada, muestra un ejemplo', async () => {
    kit.mocks.interpret.mockResolvedValue({ type: null });
    const reply = await replyTo(text('hola cómo andás'), kit.deps);
    expect(reply.text).toBe(BOT_REPLIES.example);
  });

  // Sin cuota o con la IA caída se usa el parser de reglas, como en la app.
  it('si la IA falla, usa el parser de reglas', async () => {
    kit.mocks.interpret.mockRejectedValue(new Error('caído'));
    const reply = await replyTo(text('gasté 18 mil en comida con efectivo'), kit.deps);
    expect(reply.text).toContain('Gasto de $ 18.000,00');
    expect(reply.buttons).toHaveLength(2);
  });

  it('sin cuota, un texto se interpreta con el parser y no llama a la IA', async () => {
    kit.quotaStore.data.set(`uso:${ANA_UID}:${TODAY}`, '40');
    const reply = await replyTo(text('gasté 18 mil en comida con efectivo'), kit.deps);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
    expect(reply.text).toContain('Gasto de $ 18.000,00');
  });

  it('un nuevo mensaje reemplaza lo pendiente', async () => {
    const first = await propose();
    const second = await propose(text('gasté 18 mil en el súper otra vez'));
    expect(second.txId).not.toBe(first.txId);
    const stale = await replyTo(button(`guardar:${first.txId}`), kit.deps);
    expect(stale.text).toBe(BOT_REPLIES.expired);
  });

  it('un perfil que no existe pide abrir la app primero', async () => {
    kit.mocks.readContext.mockResolvedValue(null);
    expect((await replyTo(text('gasté 500'), kit.deps)).text).toBe(BOT_REPLIES.openAppFirst);
  });

  // ADR 0011: una versión más nueva de la app escribió datos que este bot no entiende.
  it('con un esquema más nuevo no escribe', async () => {
    kit.mocks.readContext.mockResolvedValue(anaContext({ schemaVersion: 999 }));
    expect((await replyTo(text('gasté 500'), kit.deps)).text).toBe(BOT_REPLIES.writesBlocked);
  });

  it('si Firestore falla, responde un error genérico sin romper', async () => {
    kit.mocks.readContext.mockRejectedValue(new Error('caído'));
    expect((await replyTo(text('gasté 500'), kit.deps)).text).toBe(BOT_REPLIES.failed);
  });
});

describe('audio', () => {
  it('se transcribe y se interpreta como un texto', async () => {
    const reply = await replyTo(audio, kit.deps);
    expect(kit.mocks.transcribe).toHaveBeenCalledWith('media1');
    expect(kit.mocks.interpret).toHaveBeenCalled();
    expect(reply.text).toContain('Gasto de $ 18.000,00');
  });

  it('un audio demasiado grande se rechaza', async () => {
    kit.mocks.transcribe.mockResolvedValue(null);
    expect((await replyTo(audio, kit.deps)).text).toBe(BOT_REPLIES.audioTooLong);
  });

  it('un audio sin palabras no se interpreta', async () => {
    kit.mocks.transcribe.mockResolvedValue('');
    expect((await replyTo(audio, kit.deps)).text).toBe(BOT_REPLIES.audioUnclear);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
  });

  // Sin cuota no se puede usar Whisper: se pide que lo manden escrito.
  it('sin cuota, pide mandarlo escrito y no transcribe', async () => {
    kit.quotaStore.data.set(`uso:${ANA_UID}:${TODAY}`, '40');
    expect((await replyTo(audio, kit.deps)).text).toBe(BOT_REPLIES.audioQuota);
    expect(kit.mocks.transcribe).not.toHaveBeenCalled();
  });
});

describe('confirmar', () => {
  it('Guardar escribe el movimiento con el ID fijo, source whatsapp y sin updatedAt', async () => {
    const { txId } = await propose();
    const reply = await replyTo(button(`guardar:${txId}`), kit.deps);

    expect(reply.text).toBe(BOT_REPLIES.saved);
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
    const [uid, id, doc] = kit.mocks.createTransaction.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(uid).toBe(ANA_UID);
    expect(id).toBe(txId);
    expect(doc).toEqual({
      type: 'expense',
      amount: 1_800_000,
      date: TODAY,
      description: 'Súper',
      accountId: 'cash',
      categoryId: 'seed_comida',
      source: 'whatsapp',
      createdAt: new Date('2026-10-14T15:00:00Z').getTime(),
      deletedAt: null,
    });
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  it('escribir "sí" equivale a tocar Guardar', async () => {
    await propose();
    expect((await replyTo(text('Sí'), kit.deps)).text).toBe(BOT_REPLIES.saved);
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('Cancelar y "no" descartan lo pendiente sin escribir', async () => {
    const { txId } = await propose();
    expect((await replyTo(button(`cancelar:${txId}`), kit.deps)).text).toBe(BOT_REPLIES.cancelled);
    await propose();
    expect((await replyTo(text('no'), kit.deps)).text).toBe(BOT_REPLIES.cancelled);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  // Tocar Guardar en un resumen viejo no tiene que guardar otra cosa.
  it('un botón de otro movimiento (o vencido) no guarda nada', async () => {
    await propose();
    const reply = await replyTo(button('guardar:wa_000000000000000000aa'), kit.deps);
    expect(reply.text).toBe(BOT_REPLIES.expired);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
  });

  it('un botón desconocido se ignora con el aviso de vencido', async () => {
    expect((await replyTo(button('otra-cosa'), kit.deps)).text).toBe(BOT_REPLIES.expired);
  });

  it('"sí" sin nada pendiente avisa que venció', async () => {
    expect((await replyTo(text('sí'), kit.deps)).text).toBe(BOT_REPLIES.expired);
  });

  // Guardar dos veces: el primer toque borra lo pendiente, así que el segundo no hace nada.
  it('tocar Guardar dos veces guarda una sola vez', async () => {
    const { txId } = await propose();
    await replyTo(button(`guardar:${txId}`), kit.deps);
    const again = await replyTo(button(`guardar:${txId}`), kit.deps);
    expect(again.text).toBe(BOT_REPLIES.expired);
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('si el movimiento ya existía, cuenta como guardado', async () => {
    kit.mocks.createTransaction.mockResolvedValue('exists');
    const { txId } = await propose();
    expect((await replyTo(button(`guardar:${txId}`), kit.deps)).text).toBe(BOT_REPLIES.saved);
  });

  // En esos 10 minutos pudo archivarse la cuenta desde la app.
  it('si la cuenta se archivó entre el resumen y la confirmación, no guarda', async () => {
    const { txId } = await propose();
    kit.mocks.readContext.mockResolvedValue(
      anaContext({
        accounts: [makeAccount({ id: 'cash', name: 'Efectivo', archivedAt: 1 })],
      }),
    );
    const reply = await replyTo(button(`guardar:${txId}`), kit.deps);
    expect(reply.text).toContain('archivada');
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  it('si la escritura falla, avisa y deja lo pendiente para reintentar', async () => {
    kit.mocks.createTransaction.mockRejectedValue(new Error('403'));
    const { txId } = await propose();
    expect((await replyTo(button(`guardar:${txId}`), kit.deps)).text).toBe(BOT_REPLIES.failed);
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(true);
  });
});

/** La respuesta de la IA para el súper (copia, para cambiarle un campo). */
function SUPER() {
  return {
    type: 'expense',
    amount: '18000',
    toAmount: null,
    currency: null,
    date: TODAY,
    accountId: 'cash',
    toAccountId: null,
    categoryId: 'seed_comida',
    description: 'Súper',
  };
}
