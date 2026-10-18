/**
 * The cheapest proof for a `not_proven` receipt (plan P11). Reaching tests
 * that did not run come first as candidates; untested sources get their
 * package's cheapest type-check. `cheapestProof` picks the one covering the
 * most not-proven files, then the fastest by recorded duration.
 */

import type { PrismWorkspace } from "@repo-prism/core";
import {
  cheapestProof,
  recordedCheckDurations,
  type ChangeReceipt,
  type NotProvenReason,
  type ProofCandidate,
  type ReceiptProof,
} from "@repo-prism/shared";
import { listStoredReceipts } from "@repo-prism/shared/receipt-store";

/** Reasons where reaching tests exist but did not run to an answer. */
const TESTS_DID_NOT_RUN: ReadonlySet<NotProvenReason> = new Set([
  "no_node_modules",
  "unknown_runner",
  "skipped_offline",
  "still_running",
  "timeout",
]);

/** Recent receipts read for durations; bounded for the stop hook. */
const DURATION_SAMPLE = 20;

/** Every check that could prove part of a change, built once per receipt. */
export type ProofCandidates = {
  /** Runs of the reaching tests; they prove only when tests did not run. */
  readonly tests: readonly ProofCandidate[];
  /** Cheapest type-check per package for the sources no test reaches. */
  readonly typecheck: readonly ProofCandidate[];
  readonly packageManager: string;
};

function checkName(cwd: string, step: string): string {
  return cwd === "." ? step : `${cwd}: ${step}`;
}

/**
 * Candidates for the change: `reachedBySource` maps each changed source to
 * the tests that reach it. Null when the workspace cannot plan commands.
 */
export function proofCandidates(
  workspace: PrismWorkspace,
  reachedBySource: ReadonlyMap<string, readonly string[]>,
  sourcesWithoutTests: readonly string[],
): ProofCandidates | null {
  const reached = [...reachedBySource].filter(([, t]) => t.length > 0);
  if (reached.length === 0 && sourcesWithoutTests.length === 0) return null;
  const plan = workspace.checkRunPlan({
    tests: [...new Set(reached.flatMap(([, tests]) => tests))].sort(),
    typecheck: sourcesWithoutTests,
  });
  if (!plan.ok) return null;
  return {
    tests: plan.value.runs.map((run) => {
      const owned = new Set(run.tests);
      return {
        command: run.command,
        cwd: run.cwd,
        check: checkName(run.cwd, "test"),
        proves: reached
          .filter(([, tests]) => tests.some((t) => owned.has(t)))
          .map(([source]) => source),
      };
    }),
    typecheck: plan.value.typecheck.map((run) => ({
      command: run.command,
      cwd: run.cwd,
      check: run.script ? checkName(run.cwd, "typecheck") : run.command,
      proves: run.files,
    })),
    packageManager: plan.value.packageManager,
  };
}

/**
 * The proof for a settled receipt: test runs only when the reaching tests
 * did not run (behind an install when dependencies are missing), never a
 * check that already passed, ranked by `cheapestProof`.
 */
export function selectProof(
  candidates: ProofCandidates | null,
  receipt: Pick<ChangeReceipt, "verdict" | "reason" | "checks">,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): ReceiptProof | undefined {
  if (!candidates || receipt.verdict !== "not_proven" || !receipt.reason) {
    return undefined;
  }
  const passed = new Set(
    receipt.checks.filter((c) => c.status === "passed").map((c) => c.name),
  );
  const install =
    receipt.reason === "no_node_modules"
      ? `${candidates.packageManager} install && `
      : "";
  const pool = [
    ...(TESTS_DID_NOT_RUN.has(receipt.reason)
      ? candidates.tests.map((c) => ({
          ...c,
          command: `${install}${c.command}`,
        }))
      : []),
    ...candidates.typecheck,
  ].filter((c) => !passed.has(c.check));
  if (pool.length === 0) return undefined;
  return cheapestProof(
    pool,
    recordedCheckDurations(listStoredReceipts(root, env, DURATION_SAMPLE)),
  );
}
