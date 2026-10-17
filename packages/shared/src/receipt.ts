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
   * edits put back (or its test file is new); `already-failing` — it failed
   * the same way without them; `unknown` — no baseline (refused, timed out)
   * or it failed differently without them; `outside-change` — it failed
   * only in files this change can't own (gitignored, or another file's lint
   * errors). Only `caused` blocks (NO-SHIP); `unknown` and `outside-change`
   * make the receipt NOT PROVEN (`baseline_unknown`,
   * `outside_change`).
   */
  cause: z
    .enum(["caused", "already-failing", "unknown", "outside-change"])
    .optional(),
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
  /**
   * A check failed and Prism can't tell if the failure is new: no baseline
   * (refused, timed out) or it failed differently without the change.
   */
  "baseline_unknown",
  /** A check failed only in files outside this change (gitignored, or another file's lint). */
  "outside_change",
  /** Only files Prism 2.0 does not analyse (TS/JS only) changed. */
  "unsupported_language",
  /** A newer change in the workspace replaced this one before its checks finished. */
  "superseded",
  /**
   * HEAD moved during the session (J-08 interim): a commit took changes out
   * of the working-tree diff, so Prism cannot say what the session changed.
   */
  "committed_during_session",
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
 * What Prism did for this session (plan P13): tokens it put into context,
 * the estimated saving against reading the covered files without Prism
 * (null until calibrated, ADR-0066; negative = Prism cost more), NO-SHIP
 * issues the agent fixed before this stop, and proofs Prism suggested.
 */
export const SessionValueSchema = z.object({
  /** Written by receipts before the token ledger was removed; read-only now. */
  tokensIn: z.number().int().nonnegative().optional(),
  filesCovered: z.number().int().nonnegative(),
  estimatedSaved: z.number().int().nullable(),
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

/**
 * Failed checks this change caused: the verdict `failed`, blocking the agent.
 * A check with no cause is from a receipt older than the baseline (M-092),
 * whose verdict already says `failed`.
 */
export function blockingChecks(receipt: ChangeReceipt): ReceiptCheck[] {
  return receipt.checks.filter(
    (c) =>
      c.status === "failed" && (c.cause === undefined || c.cause === "caused"),
  );
}

/** Failed checks Prism can't tell are new (`baseline_unknown`); never blocking. */
export function unknownFailures(receipt: ChangeReceipt): ReceiptCheck[] {
  return receipt.checks.filter(
    (c) => c.status === "failed" && c.cause === "unknown",
  );
}

/** Failed checks only in files outside this change; never blocking. */
export function outsideChangeFailures(receipt: ChangeReceipt): ReceiptCheck[] {
  return receipt.checks.filter(
    (c) => c.status === "failed" && c.cause === "outside-change",
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

/** Off-limits evidence for a generated file (`path (generated)`). */
const GENERATED_EVIDENCE = " (generated)";

/**
 * Changed paths a lens declared off-limits (a failing `off_limits_touched`).
 * Generated files never count (J-07): they get {@link generatedNote}.
 */
export function offLimitsTouched(receipt: ChangeReceipt): string[] {
  return (receipt.lensFindings ?? [])
    .filter((f) => f.check === "off_limits_touched" && f.status === "fail")
    .flatMap((f) => f.evidence)
    .filter((e) => !e.endsWith(GENERATED_EVIDENCE));
}

/** Changed generated files (J-07), from the `off_limits_touched` evidence. */
export function generatedFilesTouched(receipt: ChangeReceipt): string[] {
  return (receipt.lensFindings ?? [])
    .filter((f) => f.check === "off_limits_touched")
    .flatMap((f) => f.evidence)
    .filter((e) => e.endsWith(GENERATED_EVIDENCE))
    .map((e) => e.slice(0, -GENERATED_EVIDENCE.length));
}

const GENERATED_DIR = /^(.*?(?:^|\/)(?:generated|gen|\.generated)\/)/i;

/** The folder a generated file sits in: through its `gen/` segment. */
function generatedFolder(path: string): string {
  const match = GENERATED_DIR.exec(path.replace(/\\/g, "/"));
  if (match) return match[1]!;
  const slash = path.lastIndexOf("/");
  return slash > 0 ? path.slice(0, slash + 1) : "";
}

/**
 * The note for edited generated files (J-07, Muse), or null. Not a verdict:
 * the checks alone decide SHIP, NO-SHIP or NOT PROVEN.
 */
export function generatedNote(receipt: ChangeReceipt): string | null {
  const files = generatedFilesTouched(receipt);
  if (files.length === 0) return null;
  const folders = [...new Set(files.map(generatedFolder))];
  const where = folders[0]
    ? ` in ${folders[0]}${folders.length > 1 ? ` and ${folders.length - 1} other ${folders.length === 2 ? "folder" : "folders"}` : ""}`
    : "";
  return `Note: you edited generated files${where}. They may be overwritten on the next build.`;
}

/**
 * `NO-SHIP` only for a failure this change caused (an already-failing check,
 * or one Prism can't tell is new, never counts) or a vendored off-limits path
 * touched (generated files get a note, J-07); `SHIP` when proven; otherwise
 * `NOT PROVEN`.
 */
export function shipVerdict(receipt: ChangeReceipt): ShipVerdict {
  if (receipt.verdict === "failed" || offLimitsTouched(receipt).length > 0) {
    return "NO-SHIP";
  }
  return receipt.verdict === "proven" ? "SHIP" : "NOT PROVEN";
}

/**
 * The words each reason shows in a label; every reason has some, so a raw
 * code never reaches the user (the JSON `reason` keeps the code).
 */
export const REASON_LABEL: Readonly<Record<NotProvenReason, string>> = {
  untested: "no tests reach this change",
  no_node_modules: "dependencies not installed",
  unknown_runner: "no known test runner",
  skipped_offline: "checks skipped",
  still_running: "checks still running",
  timeout: "checks timed out",
  already_failing: "tests already failing",
  baseline_unknown: "can't tell if this failure is new",
  outside_change: "failure is in files outside this change",
  unsupported_language: "unsupported language",
  superseded: "replaced by a newer change",
  committed_during_session: "a commit was made during this session",
};

/** `SHIP`, `NO-SHIP` or `NOT PROVEN (reason)`: one short label. */
export function shipVerdictLabel(receipt: ChangeReceipt): string {
  const verdict = shipVerdict(receipt);
  if (verdict !== "NOT PROVEN") return verdict;
  const reason = receipt.reason ?? "untested";
  return `NOT PROVEN (${REASON_LABEL[reason]})`;
}
