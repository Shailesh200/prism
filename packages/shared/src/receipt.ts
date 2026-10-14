import { z } from "zod";

/**
 * The change receipt (ADR-0058 §2): a verdict on what an agent changed —
 * what it touched, what was proven by a check that ran, and what was not.
 * Every line traces to a Prism read or a command that ran.
 */

export const ReceiptCheckSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["passed", "failed", "absent", "interrupted"]),
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

export const ChangeReceiptSchema = z.object({
  generatedAt: z.string().datetime(),
  /**
   * `failed` — a check that ran failed. `unproven` — checks passed (or none
   * ran) but a changed source file has no test reaching it. `proven` — every
   * changed source file is reached by a test that ran and passed. `clean` —
   * nothing changed.
   */
  verdict: z.enum(["clean", "proven", "unproven", "failed"]),
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
  flags: z.array(ReceiptFlagSchema),
  lenses: z.array(ReceiptLensLineSchema).optional(),
  /** The agent session this receipt closes, when the host gave one. */
  sessionId: z.string().min(1).optional(),
  /** What Prism put into context this session (M-094), as one line. */
  envelope: z.string().min(1).optional(),
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
