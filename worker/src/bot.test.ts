import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeAccount } from '../../src/domain/testing/factories';
import { BOT_REPLIES, HELP_REPLY } from '../../src/domain/whatsapp';
import { replyTo, transactionId, type IncomingMessage } from './bot';
import { aiAnswer, anaContext, ANA, ANA_UID, botKit, TODAY, type BotKit } from './botTestKit';

// El flujo del bot (ADR 0034 y 0035) con un KV falso, una IA falsa y un Firestore falso: qué
// responde y qué escribe ante cada mensaje. Nada de esto toca la red.

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
const choice = (choiceId: string): IncomingMessage => ({
  id: `wamid.choice${choiceId}`,
  from: ANA,
  kind: 'choice',
  choiceId,
});
const audio: IncomingMessage = { id: 'wamid.audio', from: ANA, kind: 'audio', mediaId: 'media1' };

const reply = (message: IncomingMessage) => replyTo(message, kit.deps);

/** La IA entendió una consulta. */
const queryAnswer = (queryKind: string, overrides: Record<string, unknown> = {}) =>
  aiAnswer({
    intent: 'query',
    type: null,
    amount: null,
    date: null,
    accountId: null,
    categoryId: null,
    description: '',
    queryKind,
    queryPeriod: 'month',
    ...overrides,
  });

/** La IA entendió que le falta la cuenta (no la dedujo). */
const noAccount = () => aiAnswer({ accountId: null });

/** Manda un gasto completo y devuelve la respuesta y el ID del movimiento. */
async function propose(body = 'gasté 18 mil en el súper con efectivo') {
  const message = text(body);
  return { response: await reply(message), txId: await transactionId(message.id) };
}

describe('quién puede hablarle al bot', () => {
  it('un número sin vincular recibe cómo vincularlo', async () => {
    const response = await reply(text('hola', '5491199999999'));
    expect(response.text).toBe(BOT_REPLIES.notLinked);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
  });

  // Los vínculos de la 11c no guardaron el email: hay que volver a vincular.
  it('un vínculo sin email pide volver a vincular', async () => {
    kit.store.data.delete(`email:${ANA_UID}`);
    expect((await reply(text('gasté 500'))).text).toBe(BOT_REPLIES.relink);
  });

  it('un email fuera de la lista no gasta IA ni lee datos', async () => {
    kit.store.data.set(`email:${ANA_UID}`, 'otra@example.com');
    expect((await reply(text('gasté 500'))).text).toBe(BOT_REPLIES.noAccess);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
    expect(kit.mocks.readContext).not.toHaveBeenCalled();
    expect(kit.quotaStore.data.size).toBe(0);
  });

  it('vincular sigue funcionando', async () => {
    kit.store.data.set('codigo:123456', 'beto');
    const response = await reply(text('vincular 123456', '5491122222222'));
    expect(response.text).toBe(BOT_REPLIES.linked);
  });

  it('una foto o un sticker pide texto o audio', async () => {
    const response = await reply({ id: 'x', from: ANA, kind: 'other' });
    expect(response.text).toBe(BOT_REPLIES.onlyTextOrAudio);
  });
});

describe('charla', () => {
  // Saludar no necesita la IA, ni la cuota, ni leer los datos de la persona.
  it.each([
    ['hola', 'Hola', 'Buenas'],
    ['muchas gracias', 'nada', 'gusto', 'estoy'],
  ] as const)('"%s" se contesta enseguida, sin IA ni Firestore', async (body, ...expected) => {
    const response = await reply(text(body));
    expect(expected.some((word) => response.text.includes(word))).toBe(true);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
    expect(kit.mocks.readContext).not.toHaveBeenCalled();
    expect(kit.quotaStore.data.size).toBe(0);
  });

  it('"ayuda" explica qué sabe hacer, con ejemplos', async () => {
    expect((await reply(text('qué podés hacer'))).text).toBe(HELP_REPLY);
  });

  it('algo fuera de tema usa la frase del modelo, si es válida', async () => {
    const frase = 'De eso no sé, pero te ayudo con tus cuentas y tus gastos.';
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ intent: 'other', reply: frase }));
    expect((await reply(text('quién ganó el partido'))).text).toBe(frase);
  });

  it('si la frase del modelo trae cifras o viene vacía, usa un texto fijo', async () => {
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ intent: 'other', reply: 'Tenés $ 5000' }));
    expect((await reply(text('quién ganó el partido'))).text).toBe(BOT_REPLIES.offTopic);
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ intent: 'other', reply: '' }));
    expect((await reply(text('qué opinás del dólar'))).text).toBe(BOT_REPLIES.offTopic);
  });

  it('"sí" sin nada pendiente es charla, no una confirmación vencida', async () => {
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ intent: 'other', reply: '' }));
    const response = await reply(text('sí'));
    expect(response.text).toBe(BOT_REPLIES.offTopic);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
  });

  it('si Firestore falla, responde un error genérico sin romper', async () => {
    kit.mocks.readContext.mockRejectedValue(new Error('caído'));
    expect((await reply(text('gasté 500'))).text).toBe(BOT_REPLIES.failed);
  });

  it('un perfil que no existe pide abrir la app primero', async () => {
    kit.mocks.readContext.mockResolvedValue(null);
    expect((await reply(text('gasté 500'))).text).toBe(BOT_REPLIES.openAppFirst);
  });

  // ADR 0011: una versión más nueva de la app escribió datos que este bot no entiende.
  it('con un esquema más nuevo no escribe', async () => {
    kit.mocks.readContext.mockResolvedValue(anaContext({ schemaVersion: 999 }));
    expect((await reply(text('gasté 500'))).text).toBe(BOT_REPLIES.writesBlocked);
  });
});

describe('proponer un movimiento', () => {
  it('responde con el resumen y los botones, y no escribe nada todavía', async () => {
    const { response, txId } = await propose();

    expect(response.text).toContain('Gasto de $ 18.000,00');
    expect(response.text).toContain('Cuenta (desde): Efectivo');
    expect(response.text).toContain('Fecha: hoy (14/10/2026)');
    expect(response.buttons).toEqual([
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

  it('a la IA le manda nombres e IDs, nunca saldos ni montos del usuario', async () => {
    await propose();
    const input = JSON.stringify(kit.mocks.interpret.mock.calls[0]?.[0]);
    expect(input).toContain('Efectivo');
    expect(input).not.toMatch(/initialBalance|saldo|balance/i);
  });

  // Sin cuota o con la IA caída se usa el parser de reglas, como en la app.
  it('si la IA falla, usa el parser de reglas', async () => {
    kit.mocks.interpret.mockRejectedValue(new Error('caído'));
    const { response } = await propose('gasté 18 mil en comida con efectivo');
    expect(response.text).toContain('Gasto de $ 18.000,00');
    expect(response.buttons).toHaveLength(2);
  });

  it('sin cuota, un texto se interpreta con el parser y no llama a la IA', async () => {
    kit.quotaStore.data.set(`uso:${ANA_UID}:${TODAY}`, '100');
    const { response } = await propose('gasté 18 mil en comida con efectivo');
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
    expect(response.text).toContain('Gasto de $ 18.000,00');
  });

  it('un movimiento nuevo reemplaza al pendiente anterior', async () => {
    const first = await propose();
    const second = await propose('gasté 5 mil en el kiosco con efectivo');
    expect(second.txId).not.toBe(first.txId);
    const stale = await reply(choice(`guardar:${first.txId}`));
    expect(stale.text).toBe(BOT_REPLIES.expired);
  });
});

describe('seguir el hilo', () => {
  async function askAccount() {
    kit.mocks.interpret.mockResolvedValue(noAccount());
    return reply(text('gasté 18 mil en el súper'));
  }

  it('si falta la cuenta, pregunta con botones y guarda el borrador', async () => {
    const response = await askAccount();

    expect(response.text).toBe('Gasto de $ 18.000,00. ¿De qué cuenta?');
    expect(response.buttons).toEqual([
      { id: 'elegir:account:cash', title: 'Efectivo' },
      { id: 'elegir:account:mp', title: 'Mercado Pago' },
      { id: 'elegir:account:usd', title: 'Caja USD' },
    ]);
    expect(kit.store.ttls.get(`borrador:${ANA}`)).toBe(600);
    // Mientras pregunta no hay nada para confirmar.
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  it('tocar un botón completa el movimiento sin volver a llamar a la IA', async () => {
    await askAccount();
    const calls = kit.mocks.interpret.mock.calls.length;
    const response = await reply(choice('elegir:account:cash'));

    expect(response.text).toContain('Gasto de $ 18.000,00');
    expect(response.text).toContain('Cuenta (desde): Efectivo');
    expect(response.buttons?.map((b) => b.title)).toEqual(['Guardar', 'Cancelar']);
    expect(kit.mocks.interpret).toHaveBeenCalledTimes(calls);
    expect(kit.store.data.has(`borrador:${ANA}`)).toBe(false);
  });

  it('contestar escribiendo manda a la IA el mensaje nuevo junto con el anterior', async () => {
    await askAccount();
    kit.mocks.interpret.mockResolvedValue(aiAnswer());
    const response = await reply(text('con efectivo'));

    const input = kit.mocks.interpret.mock.calls.at(-1)?.[0] as {
      phrase: string;
      previous: string;
    };
    expect(input.phrase).toBe('con efectivo');
    expect(input.previous).toBe('gasté 18 mil en el súper');
    expect(response.text).toContain('Cuenta (desde): Efectivo');
  });

  it('sin IA, junta los dos mensajes y usa el parser', async () => {
    kit.mocks.interpret.mockRejectedValue(new Error('caído'));
    const first = await reply(text('gasté 18 mil en comida'));
    expect(first.text).toContain('¿De qué cuenta?');

    const second = await reply(text('con efectivo'));
    expect(second.text).toContain('Gasto de $ 18.000,00');
    expect(second.text).toContain('Cuenta (desde): Efectivo');
  });

  it('con más de tres opciones, ofrece una lista desplegable', async () => {
    const accounts = ['Efectivo', 'Banco', 'Mercado Pago', 'Naranja X'].map((name, i) =>
      makeAccount({ id: `a${String(i)}`, name }),
    );
    kit.mocks.readContext.mockResolvedValue(anaContext({ accounts }));
    kit.mocks.interpret.mockResolvedValue(noAccount());
    const response = await reply(text('gasté 18 mil en el súper'));

    expect(response.buttons).toBeUndefined();
    expect(response.list?.buttonLabel).toBe('Elegir');
    expect(response.list?.rows.map((r) => r.title)).toEqual([
      'Efectivo',
      'Banco',
      'Mercado Pago',
      'Naranja X',
    ]);
  });

  it('el monto o el tipo se preguntan escribiendo: sin botones', async () => {
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ amount: null, accountId: 'cash' }));
    const response = await reply(text('gasté en el súper con efectivo'));
    expect(response.text).toBe('Gasto. ¿De cuánto fue?');
    expect(response.buttons).toBeUndefined();
    expect(response.list).toBeUndefined();
  });

  it('un botón sin borrador vigente avisa que venció', async () => {
    expect((await reply(choice('elegir:account:cash'))).text).toBe(BOT_REPLIES.expired);
  });

  it('un mensaje que sale de hilo se atiende y el borrador sigue vivo', async () => {
    await askAccount();
    kit.mocks.interpret.mockResolvedValue(queryAnswer('accounts'));
    const response = await reply(text('cuáles son mis cuentas'));

    expect(response.text).toContain('Tus cuentas:');
    expect(kit.store.data.has(`borrador:${ANA}`)).toBe(true);
    // Y todavía se puede completar con el botón del mensaje anterior.
    const completed = await reply(choice('elegir:account:mp'));
    expect(completed.text).toContain('Cuenta (desde): Mercado Pago');
  });

  it('un movimiento completo nuevo reemplaza al borrador', async () => {
    await askAccount();
    kit.mocks.interpret.mockResolvedValue(aiAnswer({ amount: '5000' }));
    const response = await reply(text('gasté 5 mil en el kiosco con efectivo'));

    expect(response.text).toContain('Gasto de $ 5.000,00');
    expect(kit.store.data.has(`borrador:${ANA}`)).toBe(false);
  });

  it('después de tres preguntas sin resolver, se rinde, muestra un ejemplo y descarta el borrador', async () => {
    kit.mocks.interpret.mockResolvedValue(noAccount());
    for (let i = 0; i < 3; i++) {
      const asking = await reply(text('gasté 18 mil en el súper'));
      expect(asking.text).toContain('¿De qué cuenta?');
    }
    const giveUp = await reply(text('gasté 18 mil en el súper'));
    expect(giveUp.text).toBe(BOT_REPLIES.example);
    expect(kit.store.data.has(`borrador:${ANA}`)).toBe(false);
  });

  it('el borrador y el pendiente no conviven: preguntar anula el pendiente', async () => {
    const { txId } = await propose();
    await askAccount();
    expect((await reply(choice(`guardar:${txId}`))).text).toBe(BOT_REPLIES.expired);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
  });
});

describe('consultas', () => {
  it('cuáles son mis cuentas', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('accounts'));
    const response = await reply(text('cuáles son mis cuentas'));
    expect(response.text).toBe(
      ['Tus cuentas:', '• Efectivo (pesos)', '• Mercado Pago (pesos)', '• Caja USD (dólares)'].join(
        '\n',
      ),
    );
  });

  // El saldo sale de sumas de Firestore y tiene que coincidir con el de la app.
  it('cuánta plata tengo: saldo de cada cuenta y total en pesos', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('balance'));
    const response = await reply(text('cuánta plata tengo'));

    expect(response.text).toBe(
      [
        '• Efectivo: $ 10.100,00',
        '• Mercado Pago: $ 0,00',
        '• Caja USD: US$ 25,00',
        '',
        'Total en pesos: $ 10.100,00',
      ].join('\n'),
    );
    // Tres cuentas × seis sumas.
    expect(kit.mocks.sumTransactions).toHaveBeenCalledTimes(18);
  });

  it('cuánto me queda en una cuenta', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('balance', { accountId: 'cash' }));
    const response = await reply(text('cuánto me queda en Efectivo'));
    expect(response.text).toBe('En Efectivo tenés $ 10.100,00.');
    expect(kit.mocks.sumTransactions).toHaveBeenCalledTimes(6);
  });

  it('con demasiadas cuentas, pide que pregunte por una', async () => {
    const accounts = Array.from({ length: 7 }, (_, i) =>
      makeAccount({ id: `a${String(i)}`, name: `Cuenta ${String(i)}` }),
    );
    kit.mocks.readContext.mockResolvedValue(anaContext({ accounts }));
    kit.mocks.interpret.mockResolvedValue(queryAnswer('balance'));
    expect((await reply(text('cuánta plata tengo'))).text).toBe(BOT_REPLIES.tooManyAccounts);
    expect(kit.mocks.sumTransactions).not.toHaveBeenCalled();
  });

  it('cuánto gasté hoy', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('spending', { queryPeriod: 'today' }));
    expect((await reply(text('cuánto gasté hoy'))).text).toBe('Gastaste $ 4.000,00 hoy.');
    expect(kit.mocks.readTransactions).toHaveBeenCalledWith(ANA_UID, {
      from: '2026-10-14',
      to: '2026-10-14',
    });
  });

  it('cuánto gasté este mes: una respuesta por moneda', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('spending'));
    expect((await reply(text('cuánto gasté este mes'))).text).toBe(
      'Gastaste $ 10.000,00 este mes (pesos).\n\nGastaste US$ 25,00 este mes (dólares).',
    );
  });

  it('el mes pasado usa solo los movimientos de septiembre', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('spending', { queryPeriod: 'lastMonth' }));
    expect((await reply(text('cuánto gasté el mes pasado'))).text).toBe(
      'Gastaste $ 900,00 el mes pasado.',
    );
  });

  it('cuánto gasté en una categoría', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('spending', { categoryId: 'seed_comida' }));
    expect((await reply(text('cuánto gasté en comida'))).text).toBe(
      'Gastaste $ 6.000,00 en Comida este mes (pesos).\n\nGastaste US$ 25,00 en Comida este mes (dólares).',
    );
  });

  it('en qué gasté más, y cómo vengo este mes', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('byCategory', { accountId: 'cash' }));
    expect((await reply(text('en qué gasté más este mes con efectivo'))).text).toBe(
      [
        'Gastos en Efectivo este mes, de mayor a menor:',
        '• Comida: $ 6.000,00 (60%)',
        '• Ocio: $ 4.000,00 (40%)',
      ].join('\n'),
    );

    kit.mocks.interpret.mockResolvedValue(queryAnswer('summary'));
    const summary = (await reply(text('cómo vengo este mes'))).text;
    expect(summary).toContain('• Ingresos: $ 20.000,00');
    expect(summary).toContain('• Gastos: $ 10.000,00');
    expect(summary).toContain('• Diferencia: $ 10.000,00');
  });

  it('un período sin movimientos dice que no hay, en vez de ceros', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('income', { queryPeriod: 'yesterday' }));
    expect((await reply(text('cuánto cobré ayer'))).text).toBe('No tenés ingresos ayer.');
  });

  it('si hay demasiados movimientos en el período, lo avisa', async () => {
    kit.mocks.readTransactions.mockResolvedValue({ transactions: [], truncated: true });
    kit.mocks.interpret.mockResolvedValue(queryAnswer('spending', { queryPeriod: 'year' }));
    expect((await reply(text('cuánto gasté este año'))).text).toBe(BOT_REPLIES.periodTooBig);
  });

  it('sin cuota o sin IA, las consultas comunes se entienden con reglas', async () => {
    kit.quotaStore.data.set(`uso:${ANA_UID}:${TODAY}`, '100');
    expect((await reply(text('cuáles son mis cuentas'))).text).toContain('Tus cuentas:');
    expect((await reply(text('cuánto gasté hoy'))).text).toBe('Gastaste $ 4.000,00 hoy.');
    expect((await reply(text('cuánto me queda en Efectivo'))).text).toBe(
      'En Efectivo tenés $ 10.100,00.',
    );
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
  });

  it('una consulta gasta una unidad de cuota', async () => {
    kit.mocks.interpret.mockResolvedValue(queryAnswer('accounts'));
    await reply(text('cuáles son mis cuentas'));
    expect(kit.quotaStore.data.get(`uso:${ANA_UID}:${TODAY}`)).toBe('1');
  });
});

describe('audio', () => {
  it('se transcribe y se interpreta como un texto', async () => {
    kit.mocks.transcribe.mockResolvedValue('gasté 18 mil en el súper con efectivo');
    const response = await reply(audio);
    expect(kit.mocks.transcribe).toHaveBeenCalledWith('media1');
    expect(kit.mocks.interpret).toHaveBeenCalled();
    expect(response.text).toContain('Gasto de $ 18.000,00');
  });

  it('un audio gasta una sola unidad de cuota (Whisper y la IA juntos)', async () => {
    kit.mocks.transcribe.mockResolvedValue('gasté 18 mil en el súper con efectivo');
    await reply(audio);
    expect(kit.quotaStore.data.get(`uso:${ANA_UID}:${TODAY}`)).toBe('1');
  });

  it('un audio demasiado grande se rechaza', async () => {
    kit.mocks.transcribe.mockResolvedValue(null);
    expect((await reply(audio)).text).toBe(BOT_REPLIES.audioTooLong);
  });

  it('un audio sin palabras no se interpreta', async () => {
    kit.mocks.transcribe.mockResolvedValue('');
    expect((await reply(audio)).text).toBe(BOT_REPLIES.audioUnclear);
    expect(kit.mocks.interpret).not.toHaveBeenCalled();
  });

  // Sin cuota no se puede usar Whisper: se pide que lo manden escrito.
  it('sin cuota, pide mandarlo escrito y no transcribe', async () => {
    kit.quotaStore.data.set(`uso:${ANA_UID}:${TODAY}`, '100');
    expect((await reply(audio)).text).toBe(BOT_REPLIES.audioQuota);
    expect(kit.mocks.transcribe).not.toHaveBeenCalled();
  });

  it('un saludo por audio también se contesta', async () => {
    kit.mocks.transcribe.mockResolvedValue('hola');
    expect((await reply(audio)).text).toMatch(/Hola|Buenas/);
  });
});

describe('confirmar', () => {
  it('Guardar escribe el movimiento con el ID fijo, source whatsapp y sin updatedAt', async () => {
    const { txId } = await propose();
    const response = await reply(choice(`guardar:${txId}`));

    expect(response.text).toBe(BOT_REPLIES.saved);
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
    expect((await reply(text('Sí'))).text).toBe(BOT_REPLIES.saved);
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('Cancelar y "no" descartan lo pendiente sin escribir', async () => {
    const { txId } = await propose();
    expect((await reply(choice(`cancelar:${txId}`))).text).toBe(BOT_REPLIES.cancelled);
    await propose();
    expect((await reply(text('no'))).text).toBe(BOT_REPLIES.cancelled);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  // Tocar Guardar en un resumen viejo no tiene que guardar otra cosa.
  it('un botón de otro movimiento (o vencido) no guarda nada', async () => {
    await propose();
    const response = await reply(choice('guardar:wa_000000000000000000aa'));
    expect(response.text).toBe(BOT_REPLIES.expired);
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
  });

  it('un botón desconocido se ignora con el aviso de vencido', async () => {
    expect((await reply(choice('otra-cosa'))).text).toBe(BOT_REPLIES.expired);
  });

  // Guardar dos veces: el primer toque borra lo pendiente, así que el segundo no hace nada.
  it('tocar Guardar dos veces guarda una sola vez', async () => {
    const { txId } = await propose();
    await reply(choice(`guardar:${txId}`));
    const again = await reply(choice(`guardar:${txId}`));
    expect(again.text).toBe(BOT_REPLIES.expired);
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
  });

  it('si el movimiento ya existía, cuenta como guardado', async () => {
    kit.mocks.createTransaction.mockResolvedValue('exists');
    const { txId } = await propose();
    expect((await reply(choice(`guardar:${txId}`))).text).toBe(BOT_REPLIES.saved);
  });

  // En esos 10 minutos pudo archivarse la cuenta desde la app.
  it('si la cuenta se archivó entre el resumen y la confirmación, no guarda', async () => {
    const { txId } = await propose();
    kit.mocks.readContext.mockResolvedValue(
      anaContext({ accounts: [makeAccount({ id: 'cash', name: 'Efectivo', archivedAt: 1 })] }),
    );
    const response = await reply(choice(`guardar:${txId}`));
    expect(response.text).toContain('archivada');
    expect(kit.mocks.createTransaction).not.toHaveBeenCalled();
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(false);
  });

  it('si la escritura falla, avisa y deja lo pendiente para reintentar', async () => {
    kit.mocks.createTransaction.mockRejectedValue(new Error('403'));
    const { txId } = await propose();
    expect((await reply(choice(`guardar:${txId}`))).text).toBe(BOT_REPLIES.failed);
    expect(kit.store.data.has(`pendiente:${ANA}`)).toBe(true);
  });
});
