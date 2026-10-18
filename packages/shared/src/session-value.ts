/**
 * The session value line on the stop receipt (plan P13, round 2), one line:
 * `Prism: saved ~3.4k tokens · remembered 2 files for next time`. Until a B6
 * calibration passes there is no saving to state, so that part is left out.
 * Pure; the receipt service gathers the inputs.
 */

import {
  blockingChecks,
  offLimitsTouched,
  shipVerdict,
  type ChangeReceipt,
  type SessionValue,
} from "./receipt.js";

/**
 * Tokens an agent spends to read one file without Prism, measured by the
 * B6 with/without A/B (plan P14). Null until a calibration passes, so the
 * saving reads "not calibrated" instead of a guess (ADR-0066).
 *
 * B6 2026-10-15 (Claude Code, 22 sessions per arm, docs/benchmarks/2.x.md):
 * the fit gave a negative tokens-per-file (-29,149) because arm B used more
 * tokens than arm A, so there is no honest positive estimate. Re-fit with
 * `node scripts/bench/b6-report.mjs publish` after the next B6 and set this
 * only when that report says Pass (held-out within ±25%, tokens-per-file > 0).
 */
export const WITHOUT_PRISM_TOKENS_PER_FILE: number | null = null;

/** What made a receipt NO-SHIP: blocking checks and off-limits paths. */
function noShipIssues(receipt: ChangeReceipt): Set<string> {
  if (shipVerdict(receipt) !== "NO-SHIP") return new Set();
  return new Set([
    ...blockingChecks(receipt).map((c) => `check:${c.name}`),
    ...offLimitsTouched(receipt).map((e) => `off-limits:${e}`),
  ]);
}

export function sessionValue(input: {
  /** Distinct files Prism sent this session (session store). */
  readonly filesCovered: number;
  readonly current: ChangeReceipt;
  /** This session's earlier receipts, any order. */
  readonly earlier: readonly ChangeReceipt[];
  readonly tokensPerFile?: number | null;
}): SessionValue {
  const perFile =
    input.tokensPerFile === undefined
      ? WITHOUT_PRISM_TOKENS_PER_FILE
      : input.tokensPerFile;
  const open = noShipIssues(input.current);
  const caught = new Set<string>();
  for (const receipt of input.earlier) {
    for (const issue of noShipIssues(receipt)) {
      if (!open.has(issue)) caught.add(issue);
    }
  }
  const suggested = new Set(
    [input.current, ...input.earlier]
      .map((r) => r.proof?.command)
      .filter((c): c is string => Boolean(c)),
  );
  const before = Math.max(
    0,
    ...input.earlier.map((r) => r.value?.filesCovered ?? 0),
  );
  return {
    filesCovered: input.filesCovered,
    filesRemembered: Math.max(0, input.filesCovered - before),
    estimatedSaved:
      perFile === null ? null : Math.round(input.filesCovered * perFile),
    issuesCaught: caught.size,
    checksSuggested: suggested.size,
  };
}

function compact(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One honest line; null when there is nothing to say. The saving is shown
 * only once calibrated (never a guess); "remembered" only when this turn added files
 * to session memory; caught issues only when there were some.
 */
export function sessionValueLine(value: SessionValue): string | null {
  const remembered = value.filesRemembered ?? 0;
  const parts = [
    ...(value.estimatedSaved === null
      ? []
      : value.estimatedSaved >= 0
        ? [`saved ~${compact(value.estimatedSaved)} tokens`]
        : [
            `cost ~${compact(-value.estimatedSaved)} more tokens than it saved`,
          ]),
    ...(remembered > 0
      ? [`remembered ${plural(remembered, "file")} for next time`]
      : []),
    ...(value.issuesCaught > 0
      ? [`${plural(value.issuesCaught, "issue")} caught`]
      : []),
  ];
  return parts.length > 0 ? `Prism: ${parts.join(" · ")}` : null;
}
