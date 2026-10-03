// Resultado de una operación que puede fallar por un motivo esperable (ADR 0014).
// TypeScript obliga a mirar `ok` antes de usar `value` o `error`.

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
