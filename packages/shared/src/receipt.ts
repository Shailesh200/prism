import { z } from "zod";
import { LensFindingSchema } from "./lenses.js";
import { FindingSchema } from "./schemas.js";

/**
 * The change receipt (ADR-0058 §2): a verdict on what an agent changed —
 * what it touched, what was proven by a check that ran, and what was not.
 * Every line traces to a Prism read or a command that ran.
 */

export const ReceiptCheckSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "absent", "interrupted", "timeout"]),
  detail: z.string(),
  durationMs: z.number().int().nonnegative(),
  /**
   * For a failed check (M-092): `caused` — it passed with this session's
   * edits put back; `already-failing` — it failed the same way without them;
   * `unknown` — no baseline could be taken. Only `already-failing` is
   * excused from the verdict.
   */
  cause: z.enum(["caused", "already-failing", "unknown"]).optional(),
});
export type ReceiptCheck = z.infer<typeof ReceiptCheckSchema>;

export const RECEIPT_FLAG_KINDS = [
  "duplicate",
  "orphan",
  "boundary",
  "high-blast",
  "slow-type",
] as const;
export const ReceiptFlagSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(RECEIPT_FLAG_KINDS),
  detail: z.string().min(1),
});
export type ReceiptFlag = z.infer<typeof ReceiptFlagSchema>;

export const ReceiptLensLineSchema = z.object({
  lens: z.string().min(1),
  verdict: z.enum(["pass", "concern", "fail"]),
  summary: z.string(),
});
export type ReceiptLensLine = z.infer<typeof ReceiptLensLineSchema>;

/**
 * Why a receipt is `not_proven` (plan §5.7). A receipt is never "unknown":
 * every not-proven verdict names one of these.
 */
export const NOT_PROVEN_REASONS = [
  /** A changed source file has no test reaching it. */
  "untested",
  /** Tests reach the change but the package has no installed dependencies. */
  "no_node_modules",
  /** Tests reach the change but no known runner could run them. */
  "unknown_runner",
  /** Checks were not asked for (offline or `runChecks: false`). */
  "skipped_offline",
  /** Checks are running in the background; the next receipt shows them. */
  "still_running",
  /** A check ran past its time limit. */
  "timeout",
  /** Every reaching check was already failing before this session. */
  "already_failing",
  /** Only files Prism 2.0 does not analyse (TS/JS only) changed. */
  "unsupported_language",
  /** A newer change in the workspace replaced this one before its checks finished. */
  "superseded",
  /** No session-start record, so the change set was never established. */
  "no_session",
] as const;
export const NotProvenReasonSchema = z.enum(NOT_PROVEN_REASONS);
export type NotProvenReason = z.infer<typeof NotProvenReasonSchema>;

/**
 * The cheapest check that would turn a `not_proven` receipt into a proof
 * (plan P11): a ready command, never executed by Prism.
 */
export const ReceiptProofSchema = z.object({
  command: z.string().min(1),
  /** Repo-relative directory to run it from (`.` is the root). */
  cwd: z.string().min(1),
  /** Median recorded duration of this check in earlier receipts. */
  estimateMs: z.number().int().nonnegative().optional(),
  /** The not-proven files a pass would prove. */
  proves: z.array(z.string().min(1)).min(1),
});
export type ReceiptProof = z.infer<typeof ReceiptProofSchema>;

/**
 * What Prism did for this session (plan P13): files it covered, NO-SHIP
 * issues the agent fixed before this stop, and proofs Prism suggested. No
 * token saving: 2.0.0 makes no token-savings claim. A stored receipt that
 * still has the old `estimatedSaved` key parses; zod drops the key.
 */
export const SessionValueSchema = z.object({
  /** Written by receipts before the token ledger was removed; read-only now. */
  tokensIn: z.number().int().nonnegative().optional(),
  filesCovered: z.number().int().nonnegative(),
  issuesCaught: z.number().int().nonnegative(),
  checksSuggested: z.number().int().nonnegative(),
  /** Files session memory gained since this session's previous receipt (round 2). */
  filesRemembered: z.number().int().nonnegative().optional(),
});
export type SessionValue = z.infer<typeof SessionValueSchema>;

export const ChangeReceiptSchema = z.object({
  /** Stable id: the same session and the same diff give the same id (R-C3). */
  id: z.string().min(1),
  /** Hash of the session's changed paths and their contents. */
  diffHash: z.string().min(1),
  generatedAt: z.string().datetime(),
  /**
   * `failed` — a reaching check failed (not one already failing before the
   * session). `not_proven` — see `reason`. `proven` — every changed source
   * file is reached by a test that ran and passed (or nothing changed).
   */
  verdict: z.enum(["proven", "not_proven", "failed"]),
  reason: NotProvenReasonSchema.optional(),
  /** `pending` while the checks run in the background. */
  checksState: z.enum(["pending", "done", "skipped"]),
  touched: z.object({
    files: z.array(z.string().min(1)),
    totalFiles: z.number().int().nonnegative(),
    dependents: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }),
  checks: z.array(ReceiptCheckSchema),
  /** How the test step was chosen (see `@repo-prism/checks`). */
  testMode: z.enum(["scoped", "full-script", "none", "skipped"]),
  testFiles: z.array(z.string().min(1)),
  notProven: z.array(
    z.object({ path: z.string().min(1), reason: z.string().min(1) }),
  ),
  /** Changed files in languages Prism 2.0 does not analyse (§4.6). */
  unsupported: z.array(z.string().min(1)),
  flags: z.array(ReceiptFlagSchema),
  lenses: z.array(ReceiptLensLineSchema).optional(),
  /** Data-backed lens checks on this change (plan §5.3). */
  lensFindings: z.array(LensFindingSchema).optional(),
  /** Structured findings (plan P18): what / where / fix / risk / sources. */
  findings: z.array(FindingSchema).optional(),
  /** For `not_proven`: the cheapest runnable check that would prove it (P11). */
  proof: ReceiptProofSchema.optional(),
  /** The agent session this receipt closes, when the host gave one. */
  sessionId: z.string().min(1).optional(),
  /** What Prism did for this session (plan P13). */
  value: SessionValueSchema.optional(),
  /** `daemon` when the daemon built it, `inproc` for the fallback (§2.1). */
  mode: z.enum(["daemon", "inproc"]).optional(),
  /**
   * The previous change's checks, finished after its own stop said
   * `still_running`. The stop hook answers inside 1 s and the checks take
   * longer, so without this the verdict they reach is never shown.
   */
  earlier: z
    .object({
      id: z.string().min(1),
      verdict: z.enum(["proven", "not_proven", "failed"]),
      reason: NotProvenReasonSchema.optional(),
      /** The finished receipt's summary line, without the `Prism receipt:` prefix. */
      summary: z.string().min(1),
    })
    .optional(),
  durationMs: z.number().int().nonnegative(),
});
export type ChangeReceipt = z.infer<typeof ChangeReceiptSchema>;

/** Failed checks that make the verdict `failed` and block the agent. */
export function blockingChecks(receipt: ChangeReceipt): ReceiptCheck[] {
  return receipt.checks.filter(
    (c) => c.status === "failed" && c.cause !== "already-failing",
  );
}

/** Failed checks that were failing before this session's edits. */
export function preexistingFailures(receipt: ChangeReceipt): ReceiptCheck[] {
  return receipt.checks.filter(
    (c) => c.status === "failed" && c.cause === "already-failing",
  );
}

/** The verdict a receipt opens with (plan P11). */
export type ShipVerdict = "SHIP" | "NO-SHIP" | "NOT PROVEN";

/** Changed paths a lens declared off-limits (a failing `off_limits_touched`). */
export function offLimitsTouched(receipt: ChangeReceipt): string[] {
  return (receipt.lensFindings ?? [])
    .filter((f) => f.check === "off_limits_touched" && f.status === "fail")
    .flatMap((f) => f.evidence);
}

/**
 * `NO-SHIP` only for a failure this change caused (an already-failing check
 * never counts) or an off-limits path touched; `SHIP` when proven; otherwise
 * `NOT PROVEN`.
 */
export function shipVerdict(receipt: ChangeReceipt): ShipVerdict {
  if (receipt.verdict === "failed" || offLimitsTouched(receipt).length > 0) {
    return "NO-SHIP";
  }
  return receipt.verdict === "proven" ? "SHIP" : "NOT PROVEN";
}

/** `SHIP`, `NO-SHIP` or `NOT PROVEN (reason)`: one short label. */
export function shipVerdictLabel(receipt: ChangeReceipt): string {
  const verdict = shipVerdict(receipt);
  return verdict === "NOT PROVEN"
    ? `NOT PROVEN (${receipt.reason ?? "untested"})`
    : verdict;
}
