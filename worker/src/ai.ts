// Las llamadas a Workers AI (ADR 0031 y 0032): Llama interpreta una frase y Whisper transcribe un
// audio. Las usan la ruta `/interpretar` de la app y el bot de WhatsApp. Reciben un `run`
// mínimo (no el binding entero de Cloudflare) para poder reemplazarlo en los tests.

import { AI_RESPONSE_SCHEMA, buildAiMessages, type AiInput } from '../../src/domain/voice/aiPrompt';

/** Lo que se usa del binding `AI` de Cloudflare. */
export type AiRun = (model: string, input: unknown) => Promise<unknown>;

export const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';

/** Pide a Llama que interprete la frase y devuelve su respuesta cruda (la valida el dominio). */
export async function interpret(run: AiRun, model: string, input: AiInput): Promise<unknown> {
  const output = (await run(model, {
    messages: buildAiMessages(input),
    response_format: { type: 'json_schema', json_schema: AI_RESPONSE_SCHEMA },
    max_tokens: 300,
    temperature: 0,
  })) as { response?: unknown };
  return output.response;
}

/**
 * Transcribe un audio de WhatsApp (OGG/Opus). Se le pasa como *stream* con su tipo, sin
 * convertirlo a base64, para gastar poca CPU (prueba de la 11b, ADR 0032). `language: 'es'`
 * evita que un audio corto o con ruido se detecte en otro idioma.
 */
export async function transcribe(
  run: AiRun,
  audio: { body: ReadableStream<Uint8Array>; contentType: string },
): Promise<string> {
  const output = (await run(WHISPER_MODEL, { audio, language: 'es' })) as { text?: unknown };
  return typeof output.text === 'string' ? output.text.trim() : '';
}
