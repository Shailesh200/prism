/**
 * The one token estimate Prism uses everywhere (Prepare, tool budgets, the
 * session value line): UTF-8 bytes ÷ 4. It is an estimate, not
 * a tokenizer; every consumer labels it as one.
 */

const encoder = new TextEncoder();

export const BYTES_PER_TOKEN = 4;

export function estimateTokensFromBytes(bytes: number): number {
  return Math.ceil(Math.max(0, bytes) / BYTES_PER_TOKEN);
}

export function estimateTokens(text: string): number {
  return estimateTokensFromBytes(encoder.encode(text).length);
}

/** Tokens of a value as Prism serialises it for MCP (compact JSON). */
export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value ?? null));
}
