import { describe, expect, it, vi } from 'vitest';
import { transcribe, interpret, WHISPER_MODEL } from './ai';

// Las llamadas a Workers AI, con un `run` falso que registra qué se le pidió.

describe('interpret', () => {
  it('pide a Llama una respuesta con el esquema y devuelve su campo response', async () => {
    const run = vi.fn(() => Promise.resolve({ response: { type: 'expense' } }));
    const input = { phrase: 'gasté 500', today: '2026-10-14', accounts: [], categories: [] };

    expect(await interpret(run, 'modelo-x', input)).toEqual({ type: 'expense' });
    const [model, body] = run.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(model).toBe('modelo-x');
    expect(body).toMatchObject({ temperature: 0, max_tokens: 300 });
    expect(body['response_format']).toMatchObject({ type: 'json_schema' });
  });
});

describe('transcribe', () => {
  const audio = { body: new ReadableStream<Uint8Array>(), contentType: 'audio/ogg; codecs=opus' };

  // Prueba de la 11b (ADR 0032): el audio va como stream, con su tipo, y en español.
  it('le pasa a Whisper el stream con su tipo y el idioma español', async () => {
    const run = vi.fn(() => Promise.resolve({ text: '  gasté 500 pesos \n' }));
    expect(await transcribe(run, audio)).toBe('gasté 500 pesos');
    expect(run).toHaveBeenCalledWith(WHISPER_MODEL, { audio, language: 'es' });
  });

  it('si Whisper no devuelve texto, queda vacío', async () => {
    expect(await transcribe(() => Promise.resolve({}), audio)).toBe('');
  });
});
