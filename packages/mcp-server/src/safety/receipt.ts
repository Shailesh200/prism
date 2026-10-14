/**
 * The change receipt (ADR-0058 §2, M-079 phase 5).
 *
 * Prism — not the model — runs the checks a change can reach and reports
 * what was touched, what was proven, and what was not. The stop hook and the
 * replay benchmark both call this, so the benchmark measures the product.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  failureIsPreexisting,
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
  type Result,
} from "@repo-prism/shared";
import { withBaselineTree } from "./baseline.js";

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
  /**
   * Re-run failed checks without the session's edits to tell caused from
   * already-failing (default true, M-092). False marks every failure
   * `unknown`, which still blocks.
   */
  readonly baseline?: boolean;
  readonly sessionId?: string;
  readonly env?: NodeJS.ProcessEnv;
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
  let checks: ChangeReceipt["checks"] = [];
  let testMode: ChangeReceipt["testMode"] = "skipped";
  if (options.runChecks !== false) {
    const run = await runPackageChecks(
      workspace.rootPath,
      files.map((f) => f.path),
      selectedTests,
      options,
      now,
    );
    const causes =
      options.baseline === false
        ? new Map<PackageCheck, Cause>()
        : await classifyFailures(
            workspace.rootPath,
            guard.value.files.map((f) => f.path),
            run.checks,
            options,
            now,
          );
    checks = run.checks.map((check) => {
      const { signature: _signature, ...rest } = check.result;
      const failedCheck = rest.status === "failed";
      return {
        ...rest,
        durationMs: Math.round(rest.durationMs),
        ...(failedCheck ? { cause: causes.get(check) ?? "unknown" } : {}),
      };
    });
    testMode = run.testMode;
  }

  const blocking = checks.some(
    (c) => c.status === "failed" && c.cause !== "already-failing",
  );
  const testsRan = checks.some(
    (c) => isTestCheck(c.name) && c.status === "passed",
  );
  const testsAlreadyFailing = checks.some(
    (c) => isTestCheck(c.name) && c.cause === "already-failing",
  );
  const notProven = sourcesWithoutTests.map((path) => ({
    path,
    reason: "no test reaches it",
  }));
  if (!testsRan && !blocking && selectedTests.length > 0) {
    for (const path of files.map((f) => f.path)) {
      if (!isTestPath(path) && SOURCE_FILE.test(path)) {
        if (!sourcesWithoutTests.includes(path)) {
          notProven.push({
            path,
            reason: testsAlreadyFailing
              ? "its tests were already failing"
              : "its tests did not run",
          });
        }
      }
    }
  }

  const verdict: ChangeReceipt["verdict"] = blocking
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
    checks,
    testMode,
    testFiles: selectedTests,
    notProven,
    flags,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
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
): Promise<{ checks: PackageCheck[]; testMode: ChangeReceipt["testMode"] }> {
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

  const checks: PackageCheck[] = [];
  const modes = new Set<ScopedPlan["testMode"]>();
  const keys = [...groups.keys()].sort();
  for (const pkg of keys.slice(0, RECEIPT_PACKAGE_CAP)) {
    const cwd = pkg ? join(root, pkg) : root;
    const tests = groups.get(pkg) ?? [];
    const scoped = await resolveScopedPlan(cwd, tests);
    modes.add(scoped.testMode);
    const results = await runCheckSteps(
      cwd,
      scoped.plan.steps,
      options.run,
      now,
    );
    for (const result of results) {
      checks.push({
        pkg,
        cwd,
        tests,
        step: result.name,
        result: pkg ? { ...result, name: `${pkg}: ${result.name}` } : result,
      });
    }
  }
  const testMode: ChangeReceipt["testMode"] = modes.has("scoped")
    ? "scoped"
    : modes.has("full-script")
      ? "full-script"
      : "none";
  return { checks, testMode };
}

type PackageCheck = {
  readonly pkg: string;
  readonly cwd: string;
  /** Test files for this package, relative to `cwd`. */
  readonly tests: readonly string[];
  readonly step: string;
  readonly result: CheckStepResult;
};

type Cause = NonNullable<ChangeReceipt["checks"][number]["cause"]>;

/**
 * Re-run each failed check with the session's edits put back, and say
 * whether the change caused the failure (M-092). One baseline pass covers
 * every failed package.
 */
async function classifyFailures(
  root: string,
  sessionPaths: readonly string[],
  checks: readonly PackageCheck[],
  options: BuildReceiptOptions,
  now: () => number,
): Promise<Map<PackageCheck, Cause>> {
  const failed = checks.filter((c) => c.result.status === "failed");
  const causes = new Map<PackageCheck, Cause>();
  if (failed.length === 0) return causes;
  const byPkg = new Map<string, PackageCheck[]>();
  for (const check of failed) {
    byPkg.set(check.pkg, [...(byPkg.get(check.pkg) ?? []), check]);
  }
  const baseline = await withBaselineTree(
    root,
    sessionPaths,
    async () => {
      const out = new Map<PackageCheck, CheckStepResult | "no-tests">();
      for (const group of byPkg.values()) {
        const { cwd, tests } = group[0]!;
        const existing = tests.filter((t) => existsSync(join(cwd, t)));
        const scoped = await resolveScopedPlan(cwd, existing);
        const names = new Set(group.map((c) => c.step));
        const steps = scoped.plan.steps.filter((s) => names.has(s.name));
        const results = await runCheckSteps(cwd, steps, options.run, now);
        for (const check of group) {
          const hit = results.find((r) => r.name === check.step);
          if (hit) out.set(check, hit);
          else if (check.step === "test" && existing.length === 0) {
            out.set(check, "no-tests");
          }
        }
      }
      return out;
    },
    options.env,
  );
  for (const check of failed) {
    const before = baseline?.get(check);
    if (before === "no-tests") causes.set(check, "caused");
    else if (!before) causes.set(check, "unknown");
    else if (before.status === "passed") causes.set(check, "caused");
    else if (
      before.status === "failed" &&
      before.signature &&
      check.result.signature &&
      failureIsPreexisting(before.signature, check.result.signature)
    ) {
      causes.set(check, "already-failing");
    } else if (before.status === "failed") causes.set(check, "caused");
    else causes.set(check, "unknown");
  }
  return causes;
}

function isTestCheck(name: string): boolean {
  return name === "test" || name.endsWith(": test");
}

export {
  receiptFeedback,
  renderReceipt,
  renderReceiptMarkdown,
  renderReceiptSvg,
} from "@repo-prism/shared";
