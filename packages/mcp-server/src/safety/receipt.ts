/**
 * The change receipt (ADR-0058 §2, M-079 phase 5).
 *
 * Prism — not the model — runs the checks a change can reach and reports
 * what was touched, what was proven, and what was not. The stop hook and the
 * replay benchmark both call this, so the benchmark measures the product.
 */

import { join } from "node:path";
import {
  packageRootFor,
  resolveScopedPlan,
  runCheckSteps,
  type CheckStepResult,
  type ScopedPlan,
  type VerifyRunner,
} from "@repo-prism/checks";
import type { PrismWorkspace } from "@repo-prism/core";
import {
  isTestPath,
  ok,
  type ChangeReceipt,
  type PrismError,
  type ReceiptFlag,
  type ReceiptLensLine,
  type Result,
} from "@repo-prism/shared";

/** Dirty files a receipt looks at; the rest are counted, not analysed. */
export const RECEIPT_FILE_CAP = 25;
/** Test files handed to a scoped runner in one call. */
export const RECEIPT_TEST_CAP = 60;
/** Blast risk at or above this is flagged (Blast "High", Q-023). */
export const HIGH_BLAST_RISK = 60;

const SOURCE_FILE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;

export type BuildReceiptOptions = {
  readonly preExistingChanges?: readonly string[];
  /** False → analyse only, run nothing (`testMode: "skipped"`). */
  readonly runChecks?: boolean;
  /** Injectable for tests and the benchmark. */
  readonly run?: VerifyRunner;
  readonly now?: () => number;
  /** Re-index first so working-tree edits are seen (default true). */
  readonly reindex?: boolean;
};

export async function buildChangeReceipt(
  workspace: PrismWorkspace,
  options: BuildReceiptOptions = {},
): Promise<Result<ChangeReceipt, PrismError>> {
  const now = options.now ?? Date.now;
  const started = now();
  if (options.reindex !== false) {
    const indexed = await workspace.index();
    if (!indexed.ok) return indexed;
  }

  const guard = await workspace.guardSession(
    options.preExistingChanges
      ? { preExistingChanges: options.preExistingChanges }
      : undefined,
  );
  if (!guard.ok) return guard;

  const files = guard.value.files.slice(0, RECEIPT_FILE_CAP);
  if (files.length === 0) {
    return ok({
      generatedAt: new Date().toISOString(),
      verdict: "clean",
      touched: { files: [], totalFiles: 0, dependents: 0, truncated: false },
      checks: [],
      testMode: "none",
      testFiles: [],
      notProven: [],
      flags: [],
      durationMs: Math.max(0, now() - started),
    });
  }

  const dependents = new Set<string>();
  const testFiles = new Set<string>();
  const sourcesWithoutTests: string[] = [];
  const flags: ReceiptFlag[] = [];
  const touched = new Set(files.map((f) => f.path));

  for (const file of files) {
    for (const flag of file.flags) {
      flags.push({ path: file.path, kind: flag.kind, detail: flag.detail });
    }
    if (file.risk >= HIGH_BLAST_RISK) {
      flags.push({
        path: file.path,
        kind: "high-blast",
        detail: `blast risk ${Math.round(file.risk)}`,
      });
    }

    if (isTestPath(file.path)) {
      testFiles.add(file.path);
      continue;
    }
    const blast = await workspace.blastRadius({ kind: "file", id: file.path });
    if (blast.ok) {
      for (const item of blast.value.affectedFiles) {
        if (!touched.has(item.path)) dependents.add(item.path);
      }
    }
    const tests = await workspace.testImpact({ kind: "file", id: file.path });
    const reached = tests.ok ? tests.value.tests.map((t) => t.path) : [];
    for (const test of reached) testFiles.add(test);
    if (reached.length === 0 && SOURCE_FILE.test(file.path)) {
      sourcesWithoutTests.push(file.path);
    }
  }

  const selectedTests = [...testFiles].sort().slice(0, RECEIPT_TEST_CAP);
  let checks: CheckStepResult[] = [];
  let testMode: ChangeReceipt["testMode"] = "skipped";
  if (options.runChecks !== false) {
    const run = await runPackageChecks(
      workspace.rootPath,
      files.map((f) => f.path),
      selectedTests,
      options,
      now,
    );
    checks = run.checks;
    testMode = run.testMode;
  }

  const failed = checks.some((c) => c.status === "failed");
  const testsRan = checks.some(
    (c) => isTestCheck(c.name) && c.status === "passed",
  );
  const notProven = sourcesWithoutTests.map((path) => ({
    path,
    reason: "no test reaches it",
  }));
  if (!testsRan && !failed && selectedTests.length > 0) {
    for (const path of files.map((f) => f.path)) {
      if (!isTestPath(path) && SOURCE_FILE.test(path)) {
        if (!sourcesWithoutTests.includes(path)) {
          notProven.push({ path, reason: "its tests did not run" });
        }
      }
    }
  }

  const verdict: ChangeReceipt["verdict"] = failed
    ? "failed"
    : notProven.length > 0
      ? "unproven"
      : "proven";

  return ok({
    generatedAt: new Date().toISOString(),
    verdict,
    touched: {
      files: files.map((f) => f.path),
      totalFiles: guard.value.files.length,
      dependents: dependents.size,
      truncated:
        guard.value.truncated || guard.value.files.length > files.length,
    },
    checks: checks.map((c) => ({ ...c, durationMs: Math.round(c.durationMs) })),
    testMode,
    testFiles: selectedTests,
    notProven,
    flags,
    durationMs: Math.max(0, Math.round(now() - started)),
  });
}

/** Packages a receipt runs checks in; the rest are reported as not run. */
export const RECEIPT_PACKAGE_CAP = 6;

/**
 * Run checks in each package the change touches, with that package's own
 * scripts and only the tests it owns. A single-package repo is one group at
 * the root.
 */
async function runPackageChecks(
  root: string,
  touched: readonly string[],
  tests: readonly string[],
  options: BuildReceiptOptions,
  now: () => number,
): Promise<{ checks: CheckStepResult[]; testMode: ChangeReceipt["testMode"] }> {
  const groups = new Map<string, string[]>();
  for (const path of touched) {
    const pkg = packageRootFor(root, path);
    if (!groups.has(pkg)) groups.set(pkg, []);
  }
  for (const test of tests) {
    const pkg = packageRootFor(root, test);
    const list = groups.get(pkg) ?? [];
    list.push(pkg ? test.slice(pkg.length + 1) : test);
    groups.set(pkg, list);
  }

  const checks: CheckStepResult[] = [];
  const modes = new Set<ScopedPlan["testMode"]>();
  const keys = [...groups.keys()].sort();
  for (const pkg of keys.slice(0, RECEIPT_PACKAGE_CAP)) {
    const cwd = pkg ? join(root, pkg) : root;
    const scoped = await resolveScopedPlan(cwd, groups.get(pkg) ?? []);
    modes.add(scoped.testMode);
    const results = await runCheckSteps(
      cwd,
      scoped.plan.steps,
      options.run,
      now,
    );
    for (const result of results) {
      checks.push(pkg ? { ...result, name: `${pkg}: ${result.name}` } : result);
    }
  }
  const testMode: ChangeReceipt["testMode"] = modes.has("scoped")
    ? "scoped"
    : modes.has("full-script")
      ? "full-script"
      : "none";
  return { checks, testMode };
}

function isTestCheck(name: string): boolean {
  return name === "test" || name.endsWith(": test");
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Five seconds to read. Plain text, safe for a terminal and a chat. */
export function renderReceipt(
  receipt: ChangeReceipt,
  lenses: readonly ReceiptLensLine[] = receipt.lenses ?? [],
): string {
  if (receipt.verdict === "clean") return "Prism · nothing changed";
  const pad = (label: string): string => label.padEnd(11, " ");
  const lines = ["Prism · change receipt"];
  const more = receipt.touched.truncated ? "+" : "";
  lines.push(
    `${pad("Touched")} ${plural(receipt.touched.totalFiles, "file")}${more} · ${plural(receipt.touched.dependents, "dependent")}`,
  );

  const passed = receipt.checks.filter((c) => c.status === "passed");
  const failed = receipt.checks.filter((c) => c.status === "failed");
  const provenParts = passed.map((c) =>
    isTestCheck(c.name) && receipt.testMode === "scoped"
      ? `${plural(receipt.testFiles.length, "scoped test file")} ✓`
      : `${c.name} ✓`,
  );
  if (receipt.testMode === "skipped") provenParts.push("checks not run");
  if (provenParts.length > 0) {
    lines.push(`${pad("Proven")} ${provenParts.join(" · ")}`);
  }
  for (const check of failed) {
    lines.push(`${pad("Failed")} ${check.name} ✗ ${check.detail}`.trimEnd());
  }
  for (const item of receipt.notProven.slice(0, 5)) {
    lines.push(`${pad("Not proven")} ${item.path} — ${item.reason}`);
  }
  if (receipt.notProven.length > 5) {
    lines.push(`${pad("")} …and ${receipt.notProven.length - 5} more`);
  }
  for (const flag of receipt.flags.slice(0, 4)) {
    lines.push(`${pad("Flag")} ${flag.kind}: ${flag.path} — ${flag.detail}`);
  }
  if (lenses.length > 0) {
    const mark = { pass: "✓", concern: "△", fail: "✗" } as const;
    lines.push(
      `${pad("Lenses")} ${lenses
        .map(
          (l) =>
            `${l.lens} ${mark[l.verdict]}${l.summary ? ` ${l.summary}` : ""}`,
        )
        .join(" · ")}`,
    );
  }
  return lines.join("\n");
}

/** What the agent must act on, or null when there is nothing to fix. */
export function receiptFeedback(receipt: ChangeReceipt): string | null {
  const failed = receipt.checks.filter((c) => c.status === "failed");
  if (failed.length === 0) return null;
  const lines = [
    "Prism ran the checks this change reaches and they failed. Fix these before finishing:",
    ...failed.map((c) => `- ${c.name}: ${c.detail}`),
  ];
  if (receipt.testMode === "scoped" && receipt.testFiles.length > 0) {
    lines.push(
      `Scoped tests: ${receipt.testFiles.slice(0, 10).join(", ")}${receipt.testFiles.length > 10 ? ", …" : ""}`,
    );
  }
  return lines.join("\n");
}
