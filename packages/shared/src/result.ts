/**
 * Explicit success/failure — preferred over thrown strings across Prism.
 */
export type Result<T, E = never> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; value: T } {
  return result.ok === true;
}

export function isErr<T, E>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return result.ok === false;
}

/** Unwrap or throw — for tests / internal assert paths only. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) return ok(fn(result.value));
  return result;
}
