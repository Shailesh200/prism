/**
 * Stable fingerprint for a finding (M-071 L1 / P-Q3): a re-scan must land on
 * the same id for the same underlying issue so the loop can tell "job done"
 * from "issue actually gone".
 */

import { createHash } from "node:crypto";

export function normalizeFindingTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function computeFindingFingerprint(input: {
  readonly source: string;
  readonly path?: string;
  readonly title: string;
}): string {
  const key = `${input.source}|${input.path ?? ""}|${normalizeFindingTitle(input.title)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}
