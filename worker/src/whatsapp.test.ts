import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_REPLIES } from '../../src/domain/whatsapp';
import { botKit, ANA as LINKED, type BotKit } from './botTestKit';
import type { FakeStore } from './fakeStore';
import {
  alternateRecipient,
  extractMessages,
  handleWebhook,
  isValidSignature,
  metaAudioDownloader,
  metaButtonSender,
  metaSender,
  MAX_AUDIO_BYTES,
  MetaError,
  WEBHOOK_ROUTE,
  type WebhookDeps,
} from './whatsapp';

// El webhook de Meta (ADR 0032 y 0033) con un KV falso y un "send" que solo registra lo que
// el bot respondería. Las firmas se calculan acá con el mismo algoritmo que usa Meta.

const SECRET = 'secreto-de-la-app';
const ANA = LINKED;
const BETO = '5491122222222';

let kit: BotKit;
let store: FakeStore;
let deps: WebhookDeps;
let pending: Promise<unknown>[];

beforeEach(() => {
  kit = botKit();
  store = kit.store;
  pending = [];
  deps = {
    appSecret: SECRET,
    verifyToken: 'token-de-verificacion',
    send: vi.fn(() => Promise.resolve()),
    sendButtons: vi.fn(() => Promise.resolve()),
    bot: kit.deps,
  };
});

/** HMAC-SHA256 en hexadecimal, como lo calcula Meta. */
async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lo que manda Meta cuando alguien le escribe al bot. */
function webhookBody(messages: unknown[]): string {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messages } }] }],
  });
}

function textMessage(text: string, id = 'wamid.1', from = ANA) {
  return { id, from, timestamp: '1760380800', type: 'text', text: { body: text } };
}

/** Manda el webhook y espera también el trabajo que quedó en `waitUntil`. */
async function post(body: string, signature?: string): Promise<Response> {
  const response = await handleWebhook(
    new Request(`https://dictado.example${WEBHOOK_ROUTE}`, {
      method: 'POST',
      headers: { 'X-Hub-Signature-256': `sha256=${signature ?? (await sign(body))}` },
      body,
    }),
    deps,
    (work) => pending.push(work),
  );
  await Promise.all(pending);
  return response;
}

// Antes de mandar mensajes, Meta comprueba que la URL es nuestra.
describe('verificación de la URL', () => {
  function verify(token: string) {
    const url = `https://dictado.example${WEBHOOK_ROUTE}?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=1158201444`;
    return handleWebhook(new Request(url), deps, () => undefined);
  }

  it('con el token correcto, devuelve el desafío', async () => {
    const response = await verify('token-de-verificacion');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('1158201444');
  });

  it('con otro token, 403', async () => {
    expect((await verify('otro')).status).toBe(403);
  });
});

// La firma es lo que impide que cualquiera le mande al Worker mensajes "de Meta".
describe('firma', () => {
  it('acepta la firma correcta y rechaza cualquier cambio', async () => {
    const body = await new Response('{"hola":1}').arrayBuffer();
    const good = `sha256=${await sign('{"hola":1}')}`;
    expect(await isValidSignature(body, good, SECRET)).toBe(true);
    expect(await isValidSignature(body, good, 'otro-secreto')).toBe(false);
    expect(await isValidSignature(body, `sha256=${await sign('{"hola":2}')}`, SECRET)).toBe(false);
    expect(await isValidSignature(body, null, SECRET)).toBe(false);
    expect(await isValidSignature(body, 'sha256=xyz', SECRET)).toBe(false);
  });

  it('con una firma falsa, 401 y no procesa nada', async () => {
    store.data.set('codigo:123456', 'beto');
    const body = webhookBody([textMessage('vincular 123456', 'wamid.1', BETO)]);
    const response = await post(body, await sign(body, 'otro-secreto'));

    expect(response.status).toBe(401);
    expect(deps.send).not.toHaveBeenCalled();
    expect(store.data.has(`tel:${BETO}`)).toBe(false);
  });

  it('sin el secreto configurado, 503', async () => {
    deps.appSecret = '';
    expect((await post(webhookBody([]), 'a'.repeat(64))).status).toBe(503);
  });
});

describe('mensajes', () => {
  it('vincula con un código válido y lo confirma', async () => {
    store.data.set('codigo:123456', 'beto');
    const response = await post(webhookBody([textMessage('Vincular 123456', 'wamid.1', BETO)]));

    expect(response.status).toBe(200);
    expect(store.data.get(`tel:${BETO}`)).toBe('beto');
    expect(deps.send).toHaveBeenCalledWith(BETO, BOT_REPLIES.linked);
  });

  it('con un código equivocado, lo dice', async () => {
    await post(webhookBody([textMessage('vincular 000000', 'wamid.1', BETO)]));
    expect(deps.send).toHaveBeenCalledWith(BETO, BOT_REPLIES.invalidCode);
  });

  it('a un número sin vincular le explica cómo vincularlo', async () => {
    await post(webhookBody([textMessage('gasté 500 en el súper', 'wamid.1', BETO)]));
    expect(deps.send).toHaveBeenCalledWith(BETO, BOT_REPLIES.notLinked);
  });

  // El resumen del movimiento viaja con los botones Guardar y Cancelar.
  it('un gasto de un número vinculado se responde con botones', async () => {
    await post(webhookBody([textMessage('gasté 18 mil en el súper')]));
    expect(deps.send).not.toHaveBeenCalled();
    const [to, text, buttons] = vi.mocked(deps.sendButtons).mock.calls[0] ?? [];
    expect(to).toBe(ANA);
    expect(text).toContain('Gasto de $ 18.000,00');
    expect(buttons?.map((b) => b.title)).toEqual(['Guardar', 'Cancelar']);
    expect(buttons?.[0]?.id).toMatch(/^guardar:wa_/);
    expect(buttons?.[1]?.id).toMatch(/^cancelar:wa_/);
  });

  it('tocar un botón llega al bot como una confirmación', async () => {
    await post(webhookBody([textMessage('gasté 18 mil en el súper')]));
    const save = vi.mocked(deps.sendButtons).mock.calls[0]?.[2][0]?.id ?? '';
    await post(
      webhookBody([
        {
          id: 'wamid.2',
          from: ANA,
          type: 'interactive',
          interactive: { type: 'button_reply', button_reply: { id: save, title: 'Guardar' } },
        },
      ]),
    );
    expect(kit.mocks.createTransaction).toHaveBeenCalledTimes(1);
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.saved);
  });

  it('un audio se baja y se transcribe', async () => {
    await post(webhookBody([{ id: 'wamid.2', from: ANA, type: 'audio', audio: { id: 'm1' } }]));
    expect(kit.mocks.transcribe).toHaveBeenCalledWith('m1');
    expect(deps.sendButtons).toHaveBeenCalledTimes(1);
  });

  // Meta reintenta si cree que no recibimos el webhook: el mismo mensaje no se responde dos veces.
  it('un mensaje repetido se procesa una sola vez', async () => {
    const body = webhookBody([textMessage('hola')]);
    await post(body);
    await post(body);
    const sent =
      vi.mocked(deps.send).mock.calls.length + vi.mocked(deps.sendButtons).mock.calls.length;
    expect(sent).toBe(1);
    expect(store.ttls.get('msg:wamid.1')).toBe(86_400);
  });

  it('los avisos de entrega no traen mensajes: no responde nada', async () => {
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.1', status: 'read' }] } }] }],
    });
    expect((await post(body)).status).toBe(200);
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('si responder falla, igual devuelve 200 (no tiene sentido que Meta reintente)', async () => {
    vi.mocked(deps.send).mockRejectedValue(new Error('caído'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await post(webhookBody([textMessage('sí')]))).status).toBe(200);
  });
});

describe('extractMessages', () => {
  it('distingue texto, botón, audio y otros tipos', () => {
    const payload = JSON.parse(
      webhookBody([
        textMessage('hola'),
        {
          id: 'b',
          from: ANA,
          type: 'interactive',
          interactive: { button_reply: { id: 'guardar:wa_1', title: 'Guardar' } },
        },
        { id: 'a', from: ANA, type: 'audio', audio: { id: 'media1', mime_type: 'audio/ogg' } },
        { id: 'i', from: ANA, type: 'image', image: { id: 'media2' } },
      ]),
    ) as unknown;
    expect(extractMessages(payload)).toEqual([
      { id: 'wamid.1', from: ANA, kind: 'text', text: 'hola' },
      { id: 'b', from: ANA, kind: 'button', buttonId: 'guardar:wa_1' },
      { id: 'a', from: ANA, kind: 'audio', mediaId: 'media1' },
      { id: 'i', from: ANA, kind: 'other' },
    ]);
  });

  it('ignora lo que no tiene forma de mensaje', () => {
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages({ entry: 'x' })).toEqual([]);
    const payload = JSON.parse(
      webhookBody([textMessage('hola'), { id: 'x', from: 'no-es-un-número', type: 'text' }]),
    ) as unknown;
    expect(extractMessages(payload)).toHaveLength(1);
  });
});

// Cómo se le responde a Meta, con un `fetch` falso.
describe('metaSender', () => {
  const config = { token: 'tok', phoneNumberId: '123', apiVersion: 'v25.0' };
  const notAllowed = () =>
    Response.json(
      { error: { code: 131030, message: 'Recipient not in allowed list' } },
      {
        status: 400,
      },
    );

  it('manda el texto a la API de Meta con el token', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ messages: [{ id: 'x' }] })));
    await metaSender({ ...config, fetch })(ANA, 'hola');

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v25.0/123/messages');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok' });
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ANA, text: { body: 'hola' } });
  });

  // El 9 de los celulares argentinos: si Meta no acepta el número, se prueba sin el 9.
  it('si el número no está permitido, reintenta sin el 9 de Argentina', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(notAllowed())
      .mockResolvedValueOnce(Response.json({ messages: [] }));
    await metaSender({ ...config, fetch })(ANA, 'hola');

    const second = fetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(second[1].body as string)).toMatchObject({ to: '541111111111' });
  });

  it('otros errores no se reintentan', async () => {
    const fetch = vi.fn(() => Promise.resolve(new Response('caído', { status: 500 })));
    await expect(metaSender({ ...config, fetch })(ANA, 'hola')).rejects.toBeInstanceOf(MetaError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('las formas alternativas del número', () => {
    expect(alternateRecipient('5491123456789')).toBe('541123456789');
    expect(alternateRecipient('5215512345678')).toBe('525512345678');
    expect(alternateRecipient('15550100000')).toBeNull();
  });
});

describe('metaButtonSender', () => {
  it('manda un mensaje interactivo con los botones de respuesta', async () => {
    const fetch = vi.fn(() => Promise.resolve(Response.json({ messages: [{ id: 'x' }] })));
    await metaButtonSender({ token: 'tok', phoneNumberId: '123', apiVersion: 'v25.0', fetch })(
      ANA,
      'Gasto de $ 500,00\n\n¿Lo guardo?',
      [
        { id: 'guardar:wa_1', title: 'Guardar' },
        { id: 'cancelar:wa_1', title: 'Cancelar' },
      ],
    );
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      to: ANA,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Gasto de $ 500,00\n\n¿Lo guardo?' },
        action: {
          buttons: [
            { type: 'reply', reply: { id: 'guardar:wa_1', title: 'Guardar' } },
            { type: 'reply', reply: { id: 'cancelar:wa_1', title: 'Cancelar' } },
          ],
        },
      },
    });
  });
});

// Bajar un audio son dos pedidos: la URL del archivo y el archivo (los dos con el token).
describe('metaAudioDownloader', () => {
  const config = { token: 'tok', phoneNumberId: '123', apiVersion: 'v25.0' };
  const info = (extra: object = {}) =>
    Response.json({ url: 'https://lookaside.example/audio', mime_type: 'audio/ogg', ...extra });

  it('pide la URL y baja el archivo con el token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(info({ file_size: 5000 }))
      .mockResolvedValueOnce(new Response('OggS', { headers: { 'Content-Length': '4' } }));
    const audio = await metaAudioDownloader({ ...config, fetch })('media1');

    expect(audio !== 'tooLong' && audio.contentType).toBe('audio/ogg');
    const [infoUrl, infoInit] = fetch.mock.calls[0] as [string, RequestInit];
    expect(infoUrl).toBe('https://graph.facebook.com/v25.0/media1');
    expect(infoInit.headers).toMatchObject({ Authorization: 'Bearer tok' });
    const [fileUrl, fileInit] = fetch.mock.calls[1] as [string, RequestInit];
    expect(fileUrl).toBe('https://lookaside.example/audio');
    expect(fileInit.headers).toMatchObject({ Authorization: 'Bearer tok' });
  });

  it('si pesa más del tope, no lo descarga', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(info({ file_size: MAX_AUDIO_BYTES + 1 }));
    expect(await metaAudioDownloader({ ...config, fetch })('media1')).toBe('tooLong');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('si el archivo declara más del tope, lo descarta', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(info())
      .mockResolvedValueOnce(
        new Response('x', { headers: { 'Content-Length': String(MAX_AUDIO_BYTES + 1) } }),
      );
    expect(await metaAudioDownloader({ ...config, fetch })('media1')).toBe('tooLong');
  });

  it('si Meta responde un error, lo lanza', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('no', { status: 404 }));
    await expect(metaAudioDownloader({ ...config, fetch })('media1')).rejects.toBeInstanceOf(
      MetaError,
    );
  });
});
