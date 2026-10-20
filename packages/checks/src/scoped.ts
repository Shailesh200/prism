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

/**
 * True when `body` is one plain runner command (`vitest …`, `jest …`,
 * `bun test …`) whose every flag is on {@link SAFE_FLAGS}. Only then does
 * swapping it for the bare runner over the reached files drop nothing that
 * could change the result. Anything else (a chain such as Hono's
 * `tsc --noEmit && vitest --run`, a pipe, redirect, substitution, quote, env
 * prefix, wrapper, positional filter, or any flag not on the list) runs the
 * whole script instead.
 */
export function isPlainRunnerScript(body: string): boolean {
  if (/[;&|<>`\n'"\\$]/.test(body)) return false;
  const tokens = body.trim().split(/\s+/).filter(Boolean);
  let flags: string[];
  if (tokens[0] === "vitest") {
    flags = tokens[1] === "run" ? tokens.slice(2) : tokens.slice(1);
  } else if (tokens[0] === "jest") {
    flags = tokens.slice(1);
  } else if (tokens[0] === "bun" && tokens[1] === "test") {
    flags = tokens.slice(2);
  } else {
    return false;
  }
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i] ?? "";
    if (SAFE_FLAGS.has(flag)) continue;
    if (/^--coverage\.[\w.]+(?:=\S+)?$/.test(flag)) continue;
    if (/^--reporter=\S+$/.test(flag)) continue;
    const value = flags[i + 1];
    if (flag === "--reporter" && value && !value.startsWith("-")) {
      i++;
      continue;
    }
    return false;
  }
  return true;
}

/**
 * Flags a narrowed run may drop because they cannot turn a failing suite into
 * a passing one. Everything else (config, project, root, environment, setup
 * files, mode, typecheck, preload, `--ci`, `-u`, …) keeps the full script.
 *
 * - `--run`: the narrowed vitest call is already `vitest run`.
 * - `--coverage`, `--coverage.*`: coverage collection; dropping it is the
 *   es-toolkit speed fix (Arc). A coverage threshold is the one way it could
 *   fail a run, and the full suite, not a scoped one, is where that belongs.
 * - `--silent`, `--verbose`, `--color`, `--no-color`, and `--reporter <name>`
 *   / `--reporter=<name>` (checked in the loop, since it takes a value):
 *   output only.
 * - `--passWithNoTests`: only matters when no test file matches; a narrowed
 *   run always names reached test files (jest's narrowed call adds it too).
 */
const SAFE_FLAGS = new Set([
  "--run",
  "--coverage",
  "--silent",
  "--verbose",
  "--color",
  "--no-color",
  "--passWithNoTests",
]);

function scriptBody(cwd: string, name: string): string {
  const scripts = readJson(join(cwd, "package.json"))?.scripts;
  if (!scripts || typeof scripts !== "object") return "";
  const body = (scripts as Record<string, unknown>)[name];
  return typeof body === "string" ? body : "";
}

/** A `pre<name>` or `post<name>` script runs with the script; narrowing would skip it. */
function hasPrePost(cwd: string, name: string): boolean {
  return (
    scriptBody(cwd, `pre${name}`) !== "" ||
    scriptBody(cwd, `post${name}`) !== ""
  );
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
    if (hasCheckScripts(dir)) {
      return dir.slice(root.length + 1).replaceAll("\\", "/");
    }
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
 * - runner unknown, or the test script is more than one plain runner
 *   command, or it has a `pre`/`post` script (narrowing would drop a part of
 *   it) + tests reached → the repo's own test script
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
  const script = plan.steps.find((step) => step.name === "test");
  const narrowable =
    script?.kind !== "package-script" ||
    (isPlainRunnerScript(scriptBody(cwd, script.script)) &&
      !hasPrePost(cwd, script.script));
  const runner = narrowable ? detectTestRunner(cwd) : null;
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
  readonly status: "passed" | "failed" | "absent" | "interrupted" | "timeout";
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
    } else if (result.timedOut) {
      results.push({
        name: step.name,
        status: "timeout",
        detail: result.output,
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
