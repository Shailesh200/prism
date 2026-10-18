/**
 * Signature / body slices from indexed symbol offsets (P2).
 * Offsets are UTF-16 code units, matching IndexedSymbol start/end.
 */

export const SIGNATURE_CLIP = 160;
/** Bodies longer than this stay out of prepare; fetch via graph symbol. */
export const PREPARE_BODY_MAX_LINES = 40;

/** 1-based line of a UTF-16 offset in `text`. */
export function lineAtOffset(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(Math.max(0, offset), text.length);
  for (let i = 0; i < end; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function clipSig(text: string): string {
  const t = text.trim();
  if (t.length <= SIGNATURE_CLIP) return t;
  return `${t.slice(0, SIGNATURE_CLIP - 1)}…`;
}

/**
 * One-line signature for a symbol range: first source line, trailing `{`
 * stripped, clipped to SIGNATURE_CLIP.
 */
export function signatureLine(
  source: string,
  start: number,
  end: number,
): string {
  const from = Math.max(0, Math.min(start, source.length));
  const to = Math.max(from, Math.min(end, source.length));
  const slice = source.slice(from, Math.min(to, from + SIGNATURE_CLIP + 40));
  const first = (slice.split(/\r?\n/, 1)[0] ?? "").replace(/\s*\{\s*$/, "");
  return clipSig(first);
}

export type SymbolSlice = {
  readonly signature: string;
  readonly line: number;
  readonly endLine: number;
  readonly lineCount: number;
  readonly body: string;
};

export function symbolSlice(
  source: string,
  start: number,
  end: number,
): SymbolSlice {
  const from = Math.max(0, Math.min(start, source.length));
  const to = Math.max(from, Math.min(end, source.length));
  const body = source.slice(from, to);
  const line = lineAtOffset(source, from);
  const endLine = lineAtOffset(
    source,
    Math.max(from, to - (to > from ? 1 : 0)),
  );
  const lineCount = Math.max(1, endLine - line + 1);
  return {
    signature: signatureLine(source, from, to),
    line,
    endLine,
    lineCount,
    body,
  };
}
