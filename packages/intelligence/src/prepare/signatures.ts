/**
 * Build prepare signatures (+ optional top body) from indexed symbols (P2).
 */

import {
  PREPARE_BODY_MAX_LINES,
  type ContextBody,
  type ContextSignature,
  type IndexedFile,
  type IndexedSymbol,
  symbolSlice,
} from "@repo-prism/shared";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type SourceReader = (path: string) => string | null;

export function fileSourceReader(
  rootPath: string,
  overrides?: ReadonlyMap<string, string> | Record<string, string>,
): SourceReader {
  const map =
    overrides instanceof Map
      ? overrides
      : overrides
        ? new Map(Object.entries(overrides))
        : undefined;
  return (path: string) => {
    const hit = map?.get(path);
    if (hit !== undefined) return hit;
    const abs = join(rootPath, path);
    if (!existsSync(abs)) return null;
    try {
      return readFileSync(abs, "utf8");
    } catch {
      return null;
    }
  };
}

function exported(file: IndexedFile): IndexedSymbol[] {
  return file.symbols.filter((s) => s.exported);
}

export function signaturesForFile(
  file: IndexedFile,
  source: string | null,
): ContextSignature[] {
  const out: ContextSignature[] = [];
  for (const sym of exported(file)) {
    if (source == null) {
      out.push({
        name: sym.name,
        kind: sym.kind,
        signature: `${sym.kind} ${sym.name}`,
        line: 1,
      });
      continue;
    }
    const slice = symbolSlice(source, sym.start, sym.end);
    out.push({
      name: sym.name,
      kind: sym.kind,
      signature: slice.signature || `${sym.kind} ${sym.name}`,
      line: slice.line,
    });
  }
  return out;
}

/** Top exported symbol body when it spans ≤ PREPARE_BODY_MAX_LINES. */
export function topBodyForFile(
  file: IndexedFile,
  source: string | null,
): ContextBody | undefined {
  if (source == null) return undefined;
  const sym = exported(file)[0];
  if (!sym) return undefined;
  const slice = symbolSlice(source, sym.start, sym.end);
  if (slice.lineCount > PREPARE_BODY_MAX_LINES) return undefined;
  if (!slice.body.trim()) return undefined;
  return {
    name: sym.name,
    line: slice.line,
    endLine: slice.endLine,
    text: slice.body,
  };
}
