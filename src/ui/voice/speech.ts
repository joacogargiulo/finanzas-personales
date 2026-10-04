// Dictado con la Web Speech API del navegador (ADR 0023). Convierte lo que se dice en texto; qué
// significa ese texto lo decide el parser del dominio (ADR 0015).
//
// Chrome (y el APK, que usa Chrome) lo soporta con el nombre `webkitSpeechRecognition` y procesa
// el audio en servidores de Google: necesita conexión. Firefox no lo soporta: ahí el botón de
// micrófono no aparece.

import { useCallback, useEffect, useRef, useState } from 'react';

// TypeScript no trae los tipos de esta API: alcanza con lo poco que se usa.
interface SpeechAlternative {
  transcript: string;
}
interface SpeechResultEvent {
  results: ArrayLike<ArrayLike<SpeechAlternative>>;
}
interface SpeechErrorEvent {
  error: string;
}
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type SpeechRecognitionClass = new () => SpeechRecognitionLike;

interface SpeechWindow {
  SpeechRecognition?: SpeechRecognitionClass;
  webkitSpeechRecognition?: SpeechRecognitionClass;
}

function recognitionClass(): SpeechRecognitionClass | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

/** El navegador sabe dictar. */
export function speechSupported(): boolean {
  return recognitionClass() !== null;
}

export type SpeechError = 'not-allowed' | 'no-speech' | 'offline' | 'no-microphone' | 'failed';

const ERROR_MESSAGES: Record<SpeechError, string> = {
  'not-allowed': 'Permití el uso del micrófono para dictar.',
  'no-speech': 'No escuché nada. Probá de nuevo.',
  offline: 'El dictado necesita conexión a internet.',
  'no-microphone': 'No encontré un micrófono.',
  failed: 'No se pudo dictar. Probá de nuevo.',
};

export function speechErrorMessage(error: SpeechError): string {
  return ERROR_MESSAGES[error];
}

/** Traduce el código de error del navegador. `null` = no es un error para mostrar. */
function toSpeechError(code: string): SpeechError | null {
  switch (code) {
    case 'aborted':
      return null; // lo cortó la app o el usuario
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed';
    case 'no-speech':
      return 'no-speech';
    case 'network':
      return 'offline';
    case 'audio-capture':
      return 'no-microphone';
    default:
      return 'failed';
  }
}

export interface Speech {
  supported: boolean;
  listening: boolean;
  error: SpeechError | null;
  start: () => void;
  stop: () => void;
}

/**
 * Escucha una frase y llama a `onResult` con el texto. Una sola frase por vez: el navegador corta
 * solo cuando el usuario deja de hablar.
 */
export function useSpeech(onResult: (text: string) => void): Speech {
  const [supported] = useState(speechSupported);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<SpeechError | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // La última versión de `onResult`, para no reiniciar el reconocimiento si cambia.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Al cerrar el panel, se deja de escuchar sin avisar nada.
  useEffect(
    () => () => {
      const recognition = recognitionRef.current;
      if (!recognition) return;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const start = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition || recognitionRef.current) return;
    if (!navigator.onLine) {
      setError('offline');
      return;
    }

    const recognition = new Recognition();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript.trim() ?? '';
      if (text) onResultRef.current(text);
      else setError('no-speech');
    };
    recognition.onerror = (event) => {
      const speechError = toSpeechError(event.error);
      if (speechError) setError(speechError);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    setError(null);
    try {
      recognition.start();
    } catch {
      setError('failed');
      return;
    }
    recognitionRef.current = recognition;
    setListening(true);
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, error, start, stop };
}
