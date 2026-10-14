/**
 * Checks scoped to one change (ADR-0058 §2, M-079 phase 5).
 *
 * The full suite is the repo's business; the stop hook only has time for the
 * tests a change can reach. When the runner is known, the `test` step becomes
 * that runner over the affected test files. When it is not, the repo's own
 * test script stays — slower, but never a guess at a command.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  defaultVerifyRunner,
  firstFailureLine,
  isCheckInterrupted,
  resolveVerifyPlan,
  type VerifyRunner,
} from "./verify.js";
import type { VerifyPlan, VerifyStep } from "./types.js";
import {
  failureSignature,
  type FailureSignature,
} from "./failure-signature.js";

export type TestRunnerId = "vitest" | "jest" | "bun";

/** A runner Prism can point at specific files. */
export type DetectedTestRunner = {
  readonly id: TestRunnerId;
  /** argv prefix; affected test files are appended. */
  readonly argv: readonly [string, ...string[]];
};

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function dependencyNames(pkg: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  for (const key of ["dependencies", "devDependencies"] as const) {
    const deps = pkg[key];
    if (deps && typeof deps === "object" && !Array.isArray(deps)) {
      for (const name of Object.keys(deps)) names.add(name);
    }
  }
  return names;
}

/** Nearest `node_modules/.bin/<bin>` at or above `cwd`. */
function localBin(cwd: string, bin: string): string | null {
  let dir = resolve(cwd);
  for (;;) {
    const candidate = join(dir, "node_modules", ".bin", bin);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function testScript(pkg: Record<string, unknown>): string {
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== "object") return "";
  const test = (scripts as Record<string, unknown>).test;
  return typeof test === "string" ? test : "";
}

/**
 * Which runner the repo's own `test` script uses, and the installed binary to
 * run it. Null when the runner is unknown or not installed — never `npx`.
 */
export function detectTestRunner(cwd: string): DetectedTestRunner | null {
  const pkg = readJson(join(cwd, "package.json"));
  if (!pkg) return null;
  const deps = dependencyNames(pkg);
  const script = testScript(pkg);

  if (/\bbun test\b/.test(script)) {
    return { id: "bun", argv: ["bun", "test"] };
  }
  if (deps.has("vitest") || /\bvitest\b/.test(script)) {
    const bin = localBin(cwd, "vitest");
    if (bin) return { id: "vitest", argv: [bin, "run"] };
  }
  if (deps.has("jest") || /\bjest\b/.test(script)) {
    const bin = localBin(cwd, "jest");
    if (bin) return { id: "jest", argv: [bin, "--passWithNoTests"] };
  }
  return null;
}

const CHECK_SCRIPT =
  /^(typecheck|types|check:types|lint|lint:check|oxlint|test|test:unit|test:ci)$/;

function hasCheckScripts(dir: string): boolean {
  const pkg = readJson(join(dir, "package.json"));
  const scripts = pkg?.scripts;
  if (!scripts || typeof scripts !== "object") return false;
  return Object.keys(scripts).some((key) => CHECK_SCRIPT.test(key));
}

/**
 * The package that owns `relPath`: the nearest directory at or above it with
 * a `package.json` declaring a check script. Repo-relative; `""` is the root.
 */
export function packageRootFor(repoRoot: string, relPath: string): string {
  const root = resolve(repoRoot);
  let dir = dirname(resolve(root, relPath));
  while (dir.startsWith(root)) {
    if (dir === root) return "";
    if (hasCheckScripts(dir)) return dir.slice(root.length + 1);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "";
}

export type ScopedPlan = {
  readonly plan: VerifyPlan;
  /** Test files the change reaches. Empty → no test step at all. */
  readonly testFiles: readonly string[];
  /** How the test step was chosen. */
  readonly testMode: "scoped" | "full-script" | "none";
};

/**
 * The detected plan with its `test` step narrowed to `testFiles`.
 *
 * - runner known + tests reached → runner over those files
 * - runner unknown + tests reached → the repo's own test script
 * - no tests reached → no test step (the receipt says "not proven")
 */
export async function resolveScopedPlan(
  cwd: string,
  testFiles: readonly string[],
): Promise<ScopedPlan> {
  const plan = await resolveVerifyPlan(cwd);
  const others = plan.steps.filter((step) => step.name !== "test");
  const hadTest = plan.steps.length !== others.length;

  if (testFiles.length === 0) {
    return { plan: { ...plan, steps: others }, testFiles, testMode: "none" };
  }
  const runner = detectTestRunner(cwd);
  if (runner) {
    const step: VerifyStep = {
      name: "test",
      kind: "argv",
      argv: [...runner.argv, ...testFiles],
    };
    return {
      plan: {
        ...plan,
        steps: [...others, step],
        provenance: "measured",
        source: plan.source === "none" ? "package.json" : plan.source,
      },
      testFiles,
      testMode: "scoped",
    };
  }
  return {
    plan,
    testFiles,
    testMode: hadTest ? "full-script" : "none",
  };
}

export type CheckStepResult = {
  readonly name: string;
  readonly status: "passed" | "failed" | "absent" | "interrupted";
  /** One chat-safe line for failures. */
  readonly detail: string;
  readonly durationMs: number;
  /** For failures: what failed, so a baseline run can be compared (M-092). */
  readonly signature?: FailureSignature;
};

/**
 * Run every step and report each one. Unlike `verifyJobWork`, a failure does
 * not stop the run: the receipt wants typecheck and tests side by side.
 */
export async function runCheckSteps(
  cwd: string,
  steps: readonly VerifyStep[],
  run: VerifyRunner = defaultVerifyRunner,
  now: () => number = Date.now,
): Promise<readonly CheckStepResult[]> {
  const results: CheckStepResult[] = [];
  for (const step of steps) {
    const started = now();
    let result = await run(cwd, step);
    if (!result.ok && isCheckInterrupted(result.output)) {
      result = await run(cwd, step);
    }
    const durationMs = now() - started;
    if (result.ok) {
      results.push({
        name: step.name,
        status: "passed",
        detail: "",
        durationMs,
      });
    } else if (result.absent) {
      results.push({
        name: step.name,
        status: "absent",
        detail: "script or binary not found",
        durationMs,
      });
    } else if (isCheckInterrupted(result.output)) {
      results.push({
        name: step.name,
        status: "interrupted",
        detail: "interrupted before it finished",
        durationMs,
      });
    } else {
      results.push({
        name: step.name,
        status: "failed",
        detail: firstFailureLine(result.output) || `${step.name} failed`,
        durationMs,
        signature: failureSignature(result.output),
      });
    }
  }
  return results;
}
