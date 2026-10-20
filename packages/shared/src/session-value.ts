/**
 * The session value line on the stop receipt (plan P13, round 2), one line:
 * `Prism: remembered 2 files for next time · 1 issue caught`. It makes no
 * token-savings claim (2.0.0 release condition). Pure; the receipt service
 * gathers the inputs.
 */

import {
  blockingChecks,
  offLimitsTouched,
  shipVerdict,
  type ChangeReceipt,
  type SessionValue,
} from "./receipt.js";

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
}): SessionValue {
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
    issuesCaught: caught.size,
    checksSuggested: suggested.size,
  };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * One honest line; null when there is nothing to say. "remembered" only when
 * this turn added files to session memory; caught issues only when there were
 * some. Never a token count or a saving.
 */
export function sessionValueLine(value: SessionValue): string | null {
  const remembered = value.filesRemembered ?? 0;
  const parts = [
    ...(remembered > 0
      ? [`remembered ${plural(remembered, "file")} for next time`]
      : []),
    ...(value.issuesCaught > 0
      ? [`${plural(value.issuesCaught, "issue")} caught`]
      : []),
  ];
  return parts.length > 0 ? `Prism: ${parts.join(" · ")}` : null;
}
