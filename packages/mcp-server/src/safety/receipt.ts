/**
 * The change receipt (ADR-0058 §2, M-079 phase 5).
 *
 * Prism — not the model — runs the checks a change can reach and reports
 * what was touched, what was proven, and what was not. The stop hook and the
 * replay benchmark both call this, so the benchmark measures the product.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  failureIsPreexisting,
  packageRootFor,
  resolveScopedPlan,
  runCheckSteps,
  verifyRunnerWithTimeout,
  type CheckStepResult,
  type ScopedPlan,
  type VerifyRunner,
} from "@repo-prism/checks";
import type { PrismWorkspace } from "@repo-prism/core";
import {
  isSupportedSourcePath,
  isTestPath,
  ok,
  sourceLanguageOf,
  type ChangeReceipt,
  type NotProvenReason,
  type PrismError,
  type ReceiptFlag,
  type Result,
} from "@repo-prism/shared";
import {
  applyDefaultProcedures,
  DEFAULT_LENSES,
  readLensStore,
} from "@repo-prism/shared/lens-store";
import { withBaselineTree } from "./baseline.js";
import { evaluateLensChecks, gatherLensSignals } from "./lens-checks.js";

/** Dirty files a receipt looks at; the rest are counted, not analysed. */
export const RECEIPT_FILE_CAP = 25;
/** Test files handed to a scoped runner in one call. */
export const RECEIPT_TEST_CAP = 60;
/** Blast risk at or above this is flagged (Blast "High", Q-023). */
export const HIGH_BLAST_RISK = 60;
/** Each check command is killed after this long (plan §5.7). */
export const RECEIPT_CHECK_TIMEOUT_MS = 60_000;
/** All checks of one receipt together stop after this long (plan §5.7). */
export const RECEIPT_TOTAL_TIMEOUT_MS = 120_000;

const SOURCE_FILE = /\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i;

/**
 * True when `path`'s folder already held tracked files at HEAD. A file in a
 * brand-new folder (a new benchmark package's `package.json`, say) governs
 * only code this change adds, so it cannot have a high blast on existing
 * code. Without a HEAD (or outside git) the answer is "yes, it existed", so
 * the flag is kept.
 */
export function folderExistedAtHead(root: string, path: string): boolean {
  const folder = dirname(path);
  if (folder === "." || folder === "") return true;
  const listed = spawnSync(
    "git",
    ["ls-tree", "--name-only", "HEAD", "--", `${folder}/`],
    { cwd: root, encoding: "utf8" },
  );
  if (listed.status !== 0) return true;
  return listed.stdout.trim() !== "";
}

export type BuildReceiptOptions = {
  readonly preExistingChanges?: readonly string[];
  /** False → analyse only, run nothing (`not_proven(skipped_offline)`). */
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
  readonly checkTimeoutMs?: number;
  readonly totalTimeoutMs?: number;
};

/**
 * What the structural pass found and what the checks pass still has to run.
 * The daemon returns `receipt` at once and runs `plan` in the background.
 */
export type StructuralReceipt = {
  readonly receipt: ChangeReceipt;
  readonly plan: CheckPlan | null;
};

export type CheckPlan = {
  readonly root: string;
  /** Analysed files (capped). */
  readonly files: readonly string[];
  /** Every session path, for the baseline run. */
  readonly sessionPaths: readonly string[];
  readonly tests: readonly string[];
  readonly sourcesWithoutTests: readonly string[];
};

/**
 * Hash of the session's changed paths and their current bytes. Same session
 * edits, same hash: a repeated stop gets the stored receipt (R-C3).
 */
export function sessionDiffHash(
  root: string,
  sessionPaths: readonly string[],
): string {
  const hash = createHash("sha256");
  for (const path of [...sessionPaths].sort()) {
    hash.update(path);
    hash.update("\0");
    const full = join(root, path);
    hash.update(
      existsSync(full)
        ? createHash("sha256").update(readFileSync(full)).digest("hex")
        : "deleted",
    );
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function receiptIdFor(
  sessionId: string | undefined,
  diffHash: string,
): string {
  return createHash("sha256")
    .update(`${sessionId ?? ""}\0${diffHash}`)
    .digest("hex")
    .slice(0, 16);
}

/** Changed paths in a language Prism 2.0 does not analyse (§4.6). */
export function unsupportedPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const language = sourceLanguageOf(path);
    return language !== null && !isSupportedSourcePath(path);
  });
}

export type VerdictInput = {
  readonly checks: readonly ChangeReceipt["checks"][number][];
  readonly checksState: ChangeReceipt["checksState"];
  readonly testMode: ChangeReceipt["testMode"];
  /** Analysed TS/JS files the session changed. */
  readonly supportedChanged: number;
  readonly unsupported: number;
  readonly selectedTests: number;
  readonly sourcesWithoutTests: number;
  readonly missingDependencies: boolean;
};

/**
 * The verdict and, when not proven, the one reason (plan §5.7). Never
 * "unknown": every path through here names a verdict and a reason.
 */
export function receiptVerdict(input: VerdictInput): {
  readonly verdict: ChangeReceipt["verdict"];
  readonly reason?: NotProvenReason;
} {
  const blocking = input.checks.some(
    (c) => c.status === "failed" && c.cause !== "already-failing",
  );
  if (blocking) return { verdict: "failed" };
  if (input.supportedChanged === 0 && input.unsupported > 0) {
    return { verdict: "not_proven", reason: "unsupported_language" };
  }
  const notProven = (reason: NotProvenReason) =>
    ({ verdict: "not_proven", reason }) as const;
  if (input.selectedTests > 0) {
    const testsPassed = input.checks.some(
      (c) => isTestCheck(c.name) && c.status === "passed",
    );
    if (input.missingDependencies) return notProven("no_node_modules");
    if (input.checksState === "pending") return notProven("still_running");
    if (input.checks.some((c) => c.status === "timeout")) {
      return notProven("timeout");
    }
    if (input.checksState === "skipped") return notProven("skipped_offline");
    if (!testsPassed) {
      if (
        input.checks.some(
          (c) => isTestCheck(c.name) && c.cause === "already-failing",
        )
      ) {
        return notProven("already_failing");
      }
      return notProven("unknown_runner");
    }
  }
  if (input.sourcesWithoutTests > 0) return notProven("untested");
  if (input.unsupported > 0) return notProven("unsupported_language");
  return { verdict: "proven" };
}

/**
 * The structural pass: what changed, what depends on it, which tests reach
 * it. Fast (no command runs), so the stop hook can show it at once.
 */
export async function buildStructuralReceipt(
  workspace: PrismWorkspace,
  options: BuildReceiptOptions = {},
): Promise<Result<StructuralReceipt, PrismError>> {
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

  const root = workspace.rootPath;
  const sessionPaths = guard.value.sessionPaths;
  const diffHash = sessionDiffHash(root, sessionPaths);
  const id = receiptIdFor(options.sessionId, diffHash);
  const unsupported = unsupportedPaths(sessionPaths);
  const files = guard.value.files.slice(0, RECEIPT_FILE_CAP);

  const dependents = new Set<string>();
  const testFiles = new Set<string>();
  const sourcesWithoutTests: string[] = [];
  const flags: ReceiptFlag[] = [];
  const touched = new Set(files.map((f) => f.path));

  for (const file of files) {
    for (const flag of file.flags) {
      flags.push({ path: file.path, kind: flag.kind, detail: flag.detail });
    }
    if (file.risk >= HIGH_BLAST_RISK && folderExistedAtHead(root, file.path)) {
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
  const changedPaths = files.map((f) => f.path);
  const missingDependencies =
    selectedTests.length > 0 &&
    packagesWithoutDependencies(root, [...changedPaths, ...selectedTests])
      .length > 0;
  const runnable = files.length > 0 && !missingDependencies;
  const checksState: ChangeReceipt["checksState"] =
    runnable && options.runChecks !== false ? "pending" : "skipped";
  const { verdict, reason } = receiptVerdict({
    checks: [],
    checksState,
    testMode: "skipped",
    supportedChanged: files.length,
    unsupported: unsupported.length,
    selectedTests: selectedTests.length,
    sourcesWithoutTests: sourcesWithoutTests.length,
    missingDependencies,
  });

  const receipt: ChangeReceipt = {
    id,
    diffHash,
    generatedAt: new Date().toISOString(),
    verdict,
    ...(reason ? { reason } : {}),
    checksState,
    touched: {
      files: changedPaths,
      totalFiles: guard.value.files.length,
      dependents: dependents.size,
      truncated:
        guard.value.truncated || guard.value.files.length > files.length,
    },
    checks: [],
    testMode: files.length === 0 ? "none" : "skipped",
    testFiles: selectedTests,
    notProven: notProvenRows(sourcesWithoutTests, [], reason),
    unsupported,
    flags,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    durationMs: Math.max(0, Math.round(now() - started)),
  };
  const lensFindings = await lensFindingsFor(
    workspace,
    receipt,
    options.env ?? process.env,
  );
  if (lensFindings) {
    receipt.lensFindings = lensFindings;
    receipt.durationMs = Math.max(0, Math.round(now() - started));
  }
  return ok({
    receipt,
    plan:
      checksState === "pending"
        ? {
            root,
            files: changedPaths,
            sessionPaths,
            tests: selectedTests,
            sourcesWithoutTests,
          }
        : null,
  });
}

/**
 * The checks pass: run the scoped commands, tell caused failures from ones
 * already there, and settle the verdict. Each command stops at 60 s and the
 * whole pass at 120 s; a stopped check reads `timeout`, never a hang.
 */
export async function completeReceipt(
  structural: StructuralReceipt,
  options: BuildReceiptOptions = {},
): Promise<ChangeReceipt> {
  const { receipt, plan } = structural;
  if (!plan) return receipt;
  const now = options.now ?? Date.now;
  const started = now();
  const run =
    options.run ??
    verifyRunnerWithTimeout(options.checkTimeoutMs ?? RECEIPT_CHECK_TIMEOUT_MS);
  const packageRun = await runPackageChecks(
    plan.root,
    plan.files,
    plan.tests,
    run,
    now,
    started + (options.totalTimeoutMs ?? RECEIPT_TOTAL_TIMEOUT_MS),
  );
  const causes =
    options.baseline === false
      ? new Map<PackageCheck, Cause>()
      : await classifyFailures(
          plan.root,
          plan.sessionPaths,
          packageRun.checks,
          run,
          options,
          now,
        );
  const checks: ChangeReceipt["checks"] = packageRun.checks.map((check) => {
    const { signature: _signature, ...rest } = check.result;
    const failedCheck = rest.status === "failed";
    return {
      ...rest,
      durationMs: Math.round(rest.durationMs),
      ...(failedCheck ? { cause: causes.get(check) ?? "unknown" } : {}),
    };
  });
  const { verdict, reason } = receiptVerdict({
    checks,
    checksState: "done",
    testMode: packageRun.testMode,
    supportedChanged: plan.files.length,
    unsupported: receipt.unsupported.length,
    selectedTests: plan.tests.length,
    sourcesWithoutTests: plan.sourcesWithoutTests.length,
    missingDependencies: false,
  });
  const testsRan = checks.some(
    (c) => isTestCheck(c.name) && c.status === "passed",
  );
  const { reason: _previous, ...base } = receipt;
  return {
    ...base,
    ...(base.lensFindings
      ? { lensFindings: settleRunFindings(base.lensFindings) }
      : {}),
    generatedAt: new Date().toISOString(),
    verdict,
    ...(reason ? { reason } : {}),
    checksState: "done",
    checks,
    testMode: packageRun.testMode,
    notProven: notProvenRows(
      plan.sourcesWithoutTests,
      testsRan ? [] : plan.files,
      reason,
    ),
    durationMs: receipt.durationMs + Math.max(0, Math.round(now() - started)),
  };
}

/** Once the checks ran, "tests reach it but were not run" no longer holds. */
function settleRunFindings(
  findings: NonNullable<ChangeReceipt["lensFindings"]>,
): NonNullable<ChangeReceipt["lensFindings"]> {
  return findings.map((finding) =>
    finding.check === "test_reaches_but_not_run" && finding.status !== "pass"
      ? {
          lens: finding.lens,
          check: finding.check,
          status: "pass",
          evidence: [],
        }
      : finding,
  );
}

/**
 * Data-backed lens checks for the structural receipt (plan §5.3). Reads the
 * global lens definitions; a repo with none yet uses the shipped three.
 */
async function lensFindingsFor(
  workspace: PrismWorkspace,
  receipt: ChangeReceipt,
  env: NodeJS.ProcessEnv,
): Promise<ChangeReceipt["lensFindings"]> {
  if (receipt.touched.files.length === 0) return undefined;
  const store = await readLensStore(workspace.rootPath, env);
  const lenses = applyDefaultProcedures(
    store.lenses.length > 0 ? store.lenses : DEFAULT_LENSES,
  );
  const signals = gatherLensSignals(workspace, receipt.touched.files);
  return evaluateLensChecks(lenses, receipt, signals);
}

/** Structural pass, then (unless `runChecks: false`) the checks, waited on. */
export async function buildChangeReceipt(
  workspace: PrismWorkspace,
  options: BuildReceiptOptions = {},
): Promise<Result<ChangeReceipt, PrismError>> {
  const structural = await buildStructuralReceipt(workspace, options);
  if (!structural.ok) return structural;
  return ok(await completeReceipt(structural.value, options));
}

const REASON_TEXT: Partial<Record<NotProvenReason, string>> = {
  no_node_modules: "dependencies are not installed, so its tests did not run",
  unknown_runner: "its tests did not run",
  skipped_offline: "checks were not run",
  still_running: "its tests are still running",
  timeout: "its tests timed out",
  already_failing: "its tests were already failing",
};

function notProvenRows(
  sourcesWithoutTests: readonly string[],
  testedButNotRun: readonly string[],
  reason: NotProvenReason | undefined,
): ChangeReceipt["notProven"] {
  const rows = sourcesWithoutTests.map((path) => ({
    path,
    reason: "no test reaches it",
  }));
  const text = reason ? REASON_TEXT[reason] : undefined;
  if (!text) return rows;
  const listed = new Set(sourcesWithoutTests);
  for (const path of testedButNotRun) {
    if (!isTestPath(path) && SOURCE_FILE.test(path) && !listed.has(path)) {
      rows.push({ path, reason: text });
    }
  }
  return rows;
}

/**
 * Packages (by root) that hold tests or changes, declare dependencies, and
 * have no `node_modules` — neither their own nor the workspace root's. Their
 * tests cannot run, so the receipt says `no_node_modules` at once instead of
 * waiting for a runner to fail (RE-2).
 */
export function packagesWithoutDependencies(
  root: string,
  paths: readonly string[],
): string[] {
  if (dependenciesInstalled(root)) return [];
  const missing = new Set<string>();
  for (const path of paths) {
    const pkg = packageRootFor(root, path);
    const dir = pkg ? join(root, pkg) : root;
    if (dependenciesInstalled(dir)) continue;
    if (declaresDependencies(dir) || declaresDependencies(root)) {
      missing.add(pkg);
    }
  }
  return [...missing].sort();
}

/**
 * Installed dependencies: a `node_modules` folder, or a Yarn Plug'n'Play
 * map (`.pnp.cjs` / `.pnp.js`), which installs without one.
 */
function dependenciesInstalled(dir: string): boolean {
  return ["node_modules", ".pnp.cjs", ".pnp.js"].some((name) =>
    existsSync(join(dir, name)),
  );
}

function declaresDependencies(dir: string): boolean {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return false;
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    // An unreadable manifest declares nothing we can install.
    return false;
  }
  return ["dependencies", "devDependencies"].some((key) => {
    const block = manifest[key];
    return (
      block !== null &&
      typeof block === "object" &&
      Object.keys(block as object).length > 0
    );
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
  run: VerifyRunner,
  now: () => number,
  deadline: number,
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
    const results =
      now() < deadline
        ? await runCheckSteps(cwd, scoped.plan.steps, run, now)
        : scoped.plan.steps.map(
            (step): CheckStepResult => ({
              name: step.name,
              status: "timeout",
              detail: "not run: the receipt's total time limit was reached",
              durationMs: 0,
            }),
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
  run: VerifyRunner,
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
        const results = await runCheckSteps(cwd, steps, run, now);
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
