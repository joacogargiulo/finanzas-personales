// Interpretación de una frase dictada (ADR 0031): con conexión, la IA del Worker de Cloudflare;
// si no se puede, el parser de reglas (ADR 0015). Siempre devuelve algo para precargar.
//
// La respuesta de la IA se valida en el dominio (`parseAiResult`): el Worker solo hace de
// intermediario y no se confía en lo que diga el modelo.

import { aiInput } from '../domain/voice/aiPrompt';
import { parseAiResult } from '../domain/voice/aiResult';
import { parsePhrase, type ParsedPhrase, type PhraseContext } from '../domain/voice/parsePhrase';

/** Por qué se usó el parser de reglas en lugar de la IA. */
export type RulesReason =
  | 'notConfigured' // sin Worker (por ejemplo, con los emuladores)
  | 'offline'
  | 'quota' // se llegó al límite de dictados con IA del día
  | 'failed'; // la IA no respondió a tiempo o respondió algo sin forma

export type Interpretation =
  { phrase: ParsedPhrase; via: 'ai' } | { phrase: ParsedPhrase; via: 'rules'; reason: RulesReason };

export type Interpreter = (text: string, ctx: PhraseContext) => Promise<Interpretation>;

export interface DictationDeps {
  /** La URL de `/interpretar`, o `null` si no hay Worker configurado. */
  url: string | null;
  /** El ID token de Firebase de la sesión, o `null` si no hay sesión. */
  getToken: () => Promise<string | null>;
  fetch: typeof fetch;
  isOnline: () => boolean;
  timeoutMs?: number;
}

/**
 * Después de esto se usa el parser: la persona está esperando con el panel abierto. Llama 3.3
 * 70B tarda entre 3,5 y 5 segundos (medido en producción, octubre de 2026), a veces más de 6.
 */
export const AI_TIMEOUT_MS = 12_000;

/** Solo el parser de reglas: para los tests y cuando no hay Worker. */
export const rulesOnly: Interpreter = (text, ctx) =>
  Promise.resolve({ phrase: parsePhrase(text, ctx), via: 'rules', reason: 'notConfigured' });

export function createInterpreter(deps: DictationDeps): Interpreter {
  return async (text, ctx) => {
    const rules = (reason: RulesReason): Interpretation => ({
      phrase: parsePhrase(text, ctx),
      via: 'rules',
      reason,
    });
    if (!deps.url) return rules('notConfigured');
    if (!deps.isOnline()) return rules('offline');

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, deps.timeoutMs ?? AI_TIMEOUT_MS);
    try {
      const token = await deps.getToken();
      if (!token) return rules('failed');
      const response = await deps.fetch(deps.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(aiInput(text, ctx)),
        signal: controller.signal,
      });
      if (response.status === 429) return rules('quota');
      if (!response.ok) return rules('failed');
      const body = (await response.json()) as { result?: unknown };
      const phrase = parseAiResult(body.result, ctx);
      return phrase ? { phrase, via: 'ai' } : rules('failed');
    } catch {
      // Sin red a mitad de camino, timeout o respuesta que no es JSON.
      return rules('failed');
    } finally {
      clearTimeout(timer);
    }
  };
}
