/**
 * What `guard_session {review:true}` adds on top of Core's report (plan §5.1): the
 * data-backed lens findings and, on request, the PR-description facts. The
 * prose is the agent's; Prism supplies only what it measured, and never a
 * test run it did not see.
 */

import { execFileSync } from "node:child_process";
import { packageRootFor } from "@repo-prism/checks";
import type { PrismWorkspace } from "@repo-prism/core";
import {
  isTestPath,
  shipVerdictLabel,
  type ChangeReceipt,
  type ChangeReviewReport,
  type LensFinding,
} from "@repo-prism/shared";
import { recordEvent } from "@repo-prism/shared/events";
import {
  applyDefaultProcedures,
  DEFAULT_LENSES,
  readLensStore,
} from "@repo-prism/shared/lens-store";
import { listStoredReceipts } from "@repo-prism/shared/receipt-store";
import { evaluateLensChecks, gatherLensSignals } from "./lens-checks.js";

export type PrDescription = {
  readonly whatChanged: {
    readonly files: number;
    readonly insertions: number;
    readonly deletions: number;
    readonly byPath: readonly {
      path: string;
      added: number;
      removed: number;
    }[];
  };
  readonly impact: {
    readonly areas: readonly string[];
    readonly affectedFiles: number;
    readonly risk: string;
  };
  readonly verification: {
    readonly testsReaching: readonly string[];
    readonly untested: readonly string[];
    /** Only a receipt Prism stored for these exact files; never invented. */
    readonly lastReceipt?: { readonly verdict: string; readonly ranAt: string };
    readonly statement: string;
  };
};

function numstat(
  root: string,
  base: string | undefined,
  paths: readonly string[],
) {
  let out = "";
  try {
    out = execFileSync(
      "git",
      ["diff", "--numstat", base ?? "HEAD", "--", ...paths],
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (error) {
    recordEvent({
      event: "review.numstat",
      outcome: "degraded",
      reason:
        error instanceof Error ? error.message.slice(0, 200) : String(error),
      workspace: root,
    });
  }
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added = "0", removed = "0", path = ""] = line.split("\t");
      return { path, added: Number(added) || 0, removed: Number(removed) || 0 };
    });
}

/** The newest stored receipt that covers exactly these changed files. */
function matchingReceipt(
  root: string,
  paths: readonly string[],
): ChangeReceipt | undefined {
  const wanted = [...paths].sort().join("\n");
  return listStoredReceipts(root).find(
    (receipt) => [...receipt.touched.files].sort().join("\n") === wanted,
  );
}

export function prDescriptionFor(
  root: string,
  report: ChangeReviewReport,
  paths: readonly string[],
): PrDescription {
  const stats = numstat(root, report.base, paths);
  const areas = [
    ...new Set(
      report.items.map((item) => packageRootFor(root, item.path) || "(root)"),
    ),
  ].sort();
  const testsReaching = [
    ...new Set(report.items.flatMap((item) => item.testsLikelyAffected)),
  ].sort();
  const untested = report.items
    .filter(
      (item) => !isTestPath(item.path) && item.testsLikelyAffected.length === 0,
    )
    .map((item) => item.path);
  const receipt = matchingReceipt(root, paths);
  const lastReceipt = receipt
    ? {
        verdict: shipVerdictLabel(receipt),
        ranAt: receipt.generatedAt,
      }
    : undefined;
  return {
    whatChanged: {
      files: paths.length,
      insertions: stats.reduce((sum, row) => sum + row.added, 0),
      deletions: stats.reduce((sum, row) => sum + row.removed, 0),
      byPath: stats.slice(0, 50),
    },
    impact: {
      areas,
      affectedFiles: report.totalAffectedFiles,
      risk: report.band ?? String(report.overallRisk),
    },
    verification: {
      testsReaching,
      untested,
      ...(lastReceipt ? { lastReceipt } : {}),
      statement: lastReceipt
        ? `Prism receipt ${lastReceipt.verdict} at ${lastReceipt.ranAt}.`
        : "Tests were not run in this session; Prism has no receipt for these changes.",
    },
  };
}

/**
 * Lens findings for a review. A named lens runs its own checks; otherwise
 * every enabled lens does. Evidence is the reviewed paths, never whatever
 * else is dirty (plan §5.3 "evidence follows the task").
 */
export async function reviewLensFindings(
  workspace: PrismWorkspace,
  report: ChangeReviewReport,
  paths: readonly string[],
  lensId: string | undefined,
  /** Full change set when `paths` is only the analysed slice (RC-3). */
  diffPaths: readonly string[] = paths,
): Promise<{
  findings: LensFinding[];
  unknownLens?: string;
  /** The named lens's display name, when one was named. */
  lensName?: string;
}> {
  const store = await readLensStore(workspace.rootPath);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
  const chosen = lensId
    ? lenses.filter(
        (lens) =>
          lens.id === lensId ||
          lens.name.toLowerCase() === lensId.toLowerCase(),
      )
    : lenses;
  if (lensId && chosen.length === 0)
    return { findings: [], unknownLens: lensId };
  const receipt = matchingReceipt(workspace.rootPath, paths);
  const base: ChangeReceipt = receipt ?? {
    id: "review",
    diffHash: "review",
    generatedAt: new Date().toISOString(),
    verdict: "not_proven",
    reason: "untested",
    checksState: "skipped",
    touched: {
      files: [...paths],
      totalFiles: paths.length,
      dependents: 0,
      truncated: false,
    },
    checks: [],
    testMode: "skipped",
    testFiles: [
      ...new Set(report.items.flatMap((item) => item.testsLikelyAffected)),
    ],
    notProven: report.items
      .filter(
        (item) =>
          !isTestPath(item.path) && item.testsLikelyAffected.length === 0,
      )
      .map((item) => ({ path: item.path, reason: "no test reaches it" })),
    unsupported: [],
    flags: [],
    durationMs: 0,
  };
  const guard = await workspace.guardSession();
  const flags = guard.ok
    ? guard.value.files
        .filter((file) => paths.includes(file.path))
        .flatMap((file) =>
          file.flags.map((flag) => ({
            path: file.path,
            kind: flag.kind,
            detail: flag.detail,
          })),
        )
    : [];
  const signals = gatherLensSignals(workspace, paths, diffPaths);
  return {
    findings: evaluateLensChecks(
      chosen,
      { ...base, flags: [...base.flags, ...flags] },
      signals,
    ),
    ...(lensId && chosen[0] ? { lensName: chosen[0].name } : {}),
  };
}
