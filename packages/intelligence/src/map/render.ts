/**
 * Render / truncate a repo map to a token budget (P1).
 */

import { estimateTokens } from "@repo-prism/shared";
import type { MapFileEntry } from "./build.js";

export const MAP_DEFAULT_BUDGET = 4_000;

export function renderMapFile(entry: MapFileEntry): string {
  const lines = [`## ${entry.path}`];
  for (const s of entry.signatures.slice(0, 12)) {
    lines.push(`  ${s.signature}  (${entry.path}:${s.line})`);
  }
  if (entry.callers.length > 0) {
    lines.push(`  callers: ${entry.callers.join(", ")}`);
  }
  if (entry.callees.length > 0) {
    lines.push(`  callees: ${entry.callees.join(", ")}`);
  }
  return lines.join("\n");
}

export function renderRepoMap(
  entries: readonly MapFileEntry[],
  opts: {
    readonly snapshotKey: string;
    readonly maxTokens?: number;
    readonly scope?: string;
  },
): {
  readonly text: string;
  readonly kept: number;
  readonly total: number;
  readonly truncated: boolean;
  readonly tokenEstimate: number;
} {
  const budget = opts.maxTokens ?? MAP_DEFAULT_BUDGET;
  const header = [
    `# Prism repo map`,
    `# key ${opts.snapshotKey}`,
    opts.scope ? `# scope ${opts.scope}` : null,
    ``,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const blocks: string[] = [];
  let used = estimateTokens(header);
  let kept = 0;
  for (const entry of entries) {
    const block = renderMapFile(entry);
    const cost = estimateTokens(block) + 1;
    if (kept > 0 && used + cost > budget) break;
    blocks.push(block);
    used += cost;
    kept += 1;
  }
  const text = `${header}${blocks.join("\n\n")}\n`;
  return {
    text,
    kept,
    total: entries.length,
    truncated: kept < entries.length,
    tokenEstimate: estimateTokens(text),
  };
}

/** True when a rendered map contains no multi-line function bodies. */
export function mapHasNoBodies(text: string): boolean {
  // A body would introduce an indented `{` block after a signature line.
  // Signatures are single lines; reject any line that is only `  {` or code
  // after an opening brace on its own line.
  const lines = text.split("\n");
  for (const line of lines) {
    if (/^\s+\{\s*$/.test(line)) return false;
    if (/^\s+return\s+/.test(line)) return false;
  }
  return true;
}
