import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_REPLIES } from '../../src/domain/whatsapp';
import { fakeStore, type FakeStore } from './fakeStore';
import {
  alternateRecipient,
  extractMessages,
  handleWebhook,
  isValidSignature,
  metaSender,
  MetaError,
  WEBHOOK_ROUTE,
  type WebhookDeps,
} from './whatsapp';

// El webhook de Meta (ADR 0032 y 0033) con un KV falso y un "send" que solo registra lo que
// el bot respondería. Las firmas se calculan acá con el mismo algoritmo que usa Meta.

const SECRET = 'secreto-de-la-app';
const ANA = '5491111111111';

let store: FakeStore;
let deps: WebhookDeps;
let pending: Promise<unknown>[];

beforeEach(() => {
  store = fakeStore();
  pending = [];
  deps = {
    appSecret: SECRET,
    verifyToken: 'token-de-verificacion',
    store,
    send: vi.fn(() => Promise.resolve()),
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
    store.data.set('codigo:123456', 'ana');
    const body = webhookBody([textMessage('vincular 123456')]);
    const response = await post(body, await sign(body, 'otro-secreto'));

    expect(response.status).toBe(401);
    expect(deps.send).not.toHaveBeenCalled();
    expect(store.data.has(`tel:${ANA}`)).toBe(false);
  });

  it('sin el secreto configurado, 503', async () => {
    deps.appSecret = '';
    expect((await post(webhookBody([]), 'a'.repeat(64))).status).toBe(503);
  });
});

describe('mensajes', () => {
  it('vincula con un código válido y lo confirma', async () => {
    store.data.set('codigo:123456', 'ana');
    const response = await post(webhookBody([textMessage('Vincular 123456')]));

    expect(response.status).toBe(200);
    expect(store.data.get(`tel:${ANA}`)).toBe('ana');
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.linked);
  });

  it('con un código equivocado, lo dice', async () => {
    await post(webhookBody([textMessage('vincular 000000')]));
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.invalidCode);
  });

  it('a un número sin vincular le explica cómo vincularlo', async () => {
    await post(webhookBody([textMessage('gasté 500 en el súper')]));
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.notLinked);
  });

  it('a un número vinculado le dice que todavía no carga movimientos', async () => {
    store.data.set(`tel:${ANA}`, 'ana');
    await post(webhookBody([textMessage('gasté 500 en el súper')]));
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.notYet);
  });

  it('un audio, igual', async () => {
    store.data.set(`tel:${ANA}`, 'ana');
    await post(webhookBody([{ id: 'wamid.2', from: ANA, type: 'audio', audio: { id: 'm1' } }]));
    expect(deps.send).toHaveBeenCalledWith(ANA, BOT_REPLIES.notYet);
  });

  // Meta reintenta si cree que no recibimos el webhook: el mismo mensaje no se responde dos veces.
  it('un mensaje repetido se procesa una sola vez', async () => {
    const body = webhookBody([textMessage('hola')]);
    await post(body);
    await post(body);
    expect(deps.send).toHaveBeenCalledTimes(1);
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
    expect((await post(webhookBody([textMessage('hola')]))).status).toBe(200);
  });
});

describe('extractMessages', () => {
  it('ignora lo que no tiene forma de mensaje', () => {
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages({ entry: 'x' })).toEqual([]);
    const payload = JSON.parse(
      webhookBody([textMessage('hola'), { id: 'x', from: 'no-es-un-número', type: 'text' }]),
    ) as unknown;
    expect(extractMessages(payload)).toEqual([{ id: 'wamid.1', from: ANA, text: 'hola' }]);
  });
});

// Cómo se le responde a Meta, con un `fetch` falso.
describe('metaSender', () => {
  const config = { token: 'tok', phoneNumberId: '123', apiVersion: 'v23.0' };
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
    expect(url).toBe('https://graph.facebook.com/v23.0/123/messages');
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
