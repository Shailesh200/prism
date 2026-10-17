/**
 * The cheapest proof for a `not_proven` receipt (plan P11): of the checks
 * that could prove the change, the one covering the most not-proven files,
 * then the fastest by recorded duration. Pure; callers build the candidates.
 */

import type { ChangeReceipt, ReceiptProof } from "./receipt.js";

/** A ready command that would prove some not-proven files. Never executed. */
export type ProofCandidate = {
  readonly command: string;
  /** Repo-relative directory to run it from (`.` is the root). */
  readonly cwd: string;
  /** The receipt check name it matches (`test`, `pkg: typecheck`), for durations. */
  readonly check: string;
  readonly proves: readonly string[];
};

/** Median duration per check name over the checks that ran to an answer. */
export function recordedCheckDurations(
  receipts: readonly ChangeReceipt[],
): Map<string, number> {
  const samples = new Map<string, number[]>();
  for (const receipt of receipts) {
    for (const check of receipt.checks) {
      if (check.status !== "passed" && check.status !== "failed") continue;
      const list = samples.get(check.name) ?? [];
      list.push(check.durationMs);
      samples.set(check.name, list);
    }
  }
  const medians = new Map<string, number>();
  for (const [name, list] of samples) {
    const sorted = [...list].sort((a, b) => a - b);
    medians.set(name, sorted[Math.floor((sorted.length - 1) / 2)]!);
  }
  return medians;
}

/** Most files proved first, then the fastest recorded, then the shortest command. */
export function cheapestProof(
  candidates: readonly ProofCandidate[],
  durations: ReadonlyMap<string, number>,
): ReceiptProof | undefined {
  const ranked = candidates
    .filter((c) => c.proves.length > 0)
    .map((c) => ({ c, ms: durations.get(c.check) }))
    .sort(
      (a, b) =>
        b.c.proves.length - a.c.proves.length ||
        (a.ms ?? Number.POSITIVE_INFINITY) -
          (b.ms ?? Number.POSITIVE_INFINITY) ||
        a.c.command.length - b.c.command.length ||
        a.c.command.localeCompare(b.c.command),
    );
  const best = ranked[0];
  if (!best) return undefined;
  return {
    command: best.c.command,
    cwd: best.c.cwd,
    ...(best.ms === undefined ? {} : { estimateMs: Math.round(best.ms) }),
    proves: [...best.c.proves].sort(),
  };
}
