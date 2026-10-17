/**
 * Prism-run verification (ADR-0042 §3, M-069; lifted out of Dispatch by
 * ADR-0058 §3).
 *
 * The model never chooses a command. Prism runs a detected allowlist after the
 * agent has stopped, so a change carries a real pass/fail signal instead of
 * reporting done on unverified edits.
 *
 * Never assume `typecheck`. Parse the repo first. Missing scripts are not
 * invoked (Bun can fall through to `/bin/test`). An empty plan is skipped
 * with UI "—", never Failure.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { constants as osConstants, homedir, setPriority } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gitChildEnv } from "./env.js";
import type { VerifyPlan, VerifyStep } from "./types.js";

export type { VerifyPlan, VerifyStep };

/** Ten minutes per step — `moon run :typecheck` over a monorepo is slow. */
export const VERIFY_TIMEOUT_MS = 600_000;
/** Keep the last 16 MB so a verbose moon run is not killed for maxBuffer. */
export const VERIFY_MAX_BUFFER = 16_000_000;

export type VerificationStatus = "passed" | "failed" | "skipped";

export type VerificationResult = {
  readonly status: VerificationStatus;
  /** One chat-safe line. Never a worktree path, never command output dumps. */
  readonly detail: string;
  readonly plan?: VerifyPlan;
};

/**
 * Historical allowlist, kept for tests that pass `steps` explicitly.
 * Live jobs use {@link resolveVerifyPlan} instead.
 */
export const VERIFY_STEPS: readonly { name: string; script: string }[] = [
  { name: "typecheck", script: "typecheck" },
  { name: "test", script: "test" },
];

export type VerifyRunResult = {
  readonly ok: boolean;
  readonly output: string;
  /** ENOENT / missing script — not a test failure. */
  readonly absent?: boolean;
  /** Killed for running past its time limit (receipt reason `timeout`). */
  readonly timedOut?: boolean;
};

export type VerifyRunner = (
  cwd: string,
  step: VerifyStep,
) => Promise<VerifyRunResult>;

const IGNORE_SCRIPT = /watch|fix|dev|start|install|prism/i;
const TYPECHECK_SCRIPTS = ["typecheck", "types", "check:types"] as const;
const LINT_SCRIPTS = ["lint", "lint:check", "oxlint"] as const;
const TEST_SCRIPTS = ["test", "test:unit", "test:ci"] as const;
const SCRIPT_MISSING =
  /script not found|script "[^"]+" was not found|a package\.json script "[^"]+" was not found/i;

/**
 * Hub and workers launched from a GUI often have a PATH without `bun`.
 * Prefer the current Bun binary, then ~/.bun/bin, then PATH.
 */
export function bunCliPath(
  execPath = process.execPath,
  home = homedir(),
  platform = process.platform,
): string {
  const normalized = execPath.replace(/\\/g, "/").toLowerCase();
  if (
    normalized.endsWith("/bun") ||
    normalized.endsWith("/bun.exe") ||
    /\/bun[-_]/.test(normalized)
  ) {
    return execPath;
  }
  const fromHome = join(
    home,
    ".bun",
    "bin",
    platform === "win32" ? "bun.exe" : "bun",
  );
  if (existsSync(fromHome)) return fromHome;
  return platform === "win32" ? "bun.exe" : "bun";
}

const INTERRUPT_NOISE =
  /terminated by signal|polite quit|killed by|cancelled by|canceled by/i;
const WRAPPER_NOISE =
  /exited with code|failed to run|task_runner::run_failed|\$\s*bun\s+-e|const parts=\[/i;

function truncateLine(line: string): string {
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

function capBuffer(text: string): string {
  if (text.length <= VERIFY_MAX_BUFFER) return text;
  return text.slice(text.length - VERIFY_MAX_BUFFER);
}

function commandOnPath(
  bin: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const pathVar = env.PATH ?? "";
  const sep = process.platform === "win32" ? ";" : ":";
  const extras =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of pathVar.split(sep)) {
    if (!dir) continue;
    for (const extra of extras) {
      if (existsSync(join(dir, `${bin}${extra}`))) return true;
    }
  }
  return false;
}

function allowedScriptKey(key: string): boolean {
  if (key === "lint:fix") return false;
  return !IGNORE_SCRIPT.test(key);
}

/** A check must never rewrite the tree it is checking. */
const WRITES_FILES = /--fix\b|--write\b|\s-w\b/;

function firstScript(
  scripts: Record<string, unknown>,
  names: readonly string[],
): string | undefined {
  for (const name of names) {
    const body = scripts[name];
    if (
      typeof body === "string" &&
      allowedScriptKey(name) &&
      !WRITES_FILES.test(body)
    ) {
      return name;
    }
  }
  return undefined;
}

const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json",
] as const;

/** Nearest lockfile at or above `start`. Workspace packages keep theirs at the root. */
function findLockfile(start: string): { dir: string; name: string } | null {
  let dir = resolve(start);
  for (;;) {
    for (const name of LOCKFILES) {
      if (existsSync(join(dir, name))) return { dir, name };
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Yarn Berry ships its own binary (`yarnPath` in `.yarnrc.yml`) and is often
 * not on PATH. Run that file with node; classic yarn stays `yarn` on PATH.
 */
export function yarnCommand(
  dir: string,
  args: readonly string[],
): [string, ...string[]] {
  const yarnrc = join(dir, ".yarnrc.yml");
  if (existsSync(yarnrc)) {
    const text = readFileSync(yarnrc, "utf8");
    const rel = /^yarnPath:\s*['"]?(\S+?)['"]?\s*$/m.exec(text)?.[1];
    if (rel && existsSync(join(dir, rel))) {
      return [process.execPath, join(dir, rel), ...args];
    }
  }
  return ["yarn", ...args];
}

function yarnArgv(
  dir: string,
  script: string,
): { argv: [string, ...string[]] } {
  return { argv: yarnCommand(dir, ["run", script]) };
}

/**
 * The Yarn Plug'n'Play project root at or above `start`: the folder holding
 * `.pnp.cjs`. PnP installs have no `node_modules/.bin`, so tools there run as
 * `yarn <bin>`.
 *
 * The walk stops at the repo root (the folder holding `.git`, a directory or
 * a worktree file): a stray `.pnp.cjs` above the repo belongs to some other
 * project and must never pick the runner.
 */
export function findPnpRoot(start: string): string | null {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".pnp.cjs"))) return dir;
    if (existsSync(join(dir, ".git"))) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function packageManagerArgv(
  cwd: string,
  script: string,
): { argv: [string, ...string[]] } {
  const lock = findLockfile(cwd);
  const dir = lock?.dir ?? cwd;
  if (lock?.name === "bun.lock" || lock?.name === "bun.lockb") {
    return { argv: [bunCliPath(), "run", script] };
  }
  if (lock?.name === "pnpm-lock.yaml") {
    return { argv: ["pnpm", "run", script] };
  }
  if (lock?.name === "yarn.lock") return yarnArgv(dir, script);
  return { argv: ["npm", "run", script] };
}

function parsePackageScripts(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const scripts = (parsed as { scripts?: unknown }).scripts;
    if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) {
      return {};
    }
    return scripts as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasPytest(cwd: string, pyproject: string): boolean {
  if (existsSync(join(cwd, "pytest.ini"))) return true;
  return /\[tool\.pytest/.test(pyproject);
}

function emptyPlan(
  source: VerifyPlan["source"] = "none",
  absent: VerifyPlan["absent"] = [],
): VerifyPlan {
  return {
    steps: [],
    absent,
    source,
    provenance: "unavailable",
  };
}

/**
 * Detect this repo's checks. Never spawn. Empty steps → skipped / "—".
 */
export async function resolveVerifyPlan(cwd: string): Promise<VerifyPlan> {
  const absent: { name: string; reason: string }[] = [];
  const pkgPath = join(cwd, "package.json");
  let nodeSteps: VerifyStep[] = [];

  if (existsSync(pkgPath)) {
    let raw = "";
    try {
      raw = await readFile(pkgPath, "utf8");
    } catch {
      absent.push({ name: "package.json", reason: "unreadable" });
    }
    const scripts = raw ? parsePackageScripts(raw) : null;
    if (scripts) {
      const typecheck = firstScript(scripts, TYPECHECK_SCRIPTS);
      const lint = firstScript(scripts, LINT_SCRIPTS);
      const test = firstScript(scripts, TEST_SCRIPTS);
      if (typecheck) {
        nodeSteps.push({
          name: "typecheck",
          kind: "package-script",
          script: typecheck,
        });
      } else {
        absent.push({
          name: "typecheck",
          reason: "no typecheck/types/check:types script",
        });
      }
      if (lint) {
        nodeSteps.push({
          name: "lint",
          kind: "package-script",
          script: lint,
        });
      } else {
        absent.push({
          name: "lint",
          reason: "no lint/lint:check/oxlint script",
        });
      }
      if (test) {
        nodeSteps.push({
          name: "test",
          kind: "package-script",
          script: test,
        });
      } else {
        absent.push({
          name: "test",
          reason: "no test/test:unit/test:ci script",
        });
      }
    }
  }

  if (nodeSteps.length > 0) {
    return {
      steps: nodeSteps,
      absent,
      source: "package.json",
      provenance: "measured",
    };
  }

  if (existsSync(join(cwd, "go.mod"))) {
    return {
      steps: [{ name: "test", kind: "argv", argv: ["go", "test", "./..."] }],
      absent,
      source: "go.mod",
      provenance: "measured",
    };
  }

  if (existsSync(join(cwd, "Cargo.toml"))) {
    if (commandOnPath("cargo")) {
      return {
        steps: [
          {
            name: "test",
            kind: "argv",
            argv: ["cargo", "test", "--offline"],
          },
        ],
        absent,
        source: "Cargo.toml",
        provenance: "measured",
      };
    }
    absent.push({ name: "test", reason: "cargo not on PATH" });
    return emptyPlan("Cargo.toml", absent);
  }

  const pyprojectPath = join(cwd, "pyproject.toml");
  const hasPyproject = existsSync(pyprojectPath);
  const pyproject = hasPyproject ? readFileSync(pyprojectPath, "utf8") : "";
  if (hasPytest(cwd, pyproject)) {
    const bin = commandOnPath("python3")
      ? "python3"
      : commandOnPath("python")
        ? "python"
        : null;
    if (bin) {
      return {
        steps: [
          {
            name: "test",
            kind: "argv",
            argv: [bin, "-m", "pytest", "-q"],
          },
        ],
        absent,
        source: "pyproject",
        provenance: "measured",
      };
    }
    absent.push({ name: "test", reason: "python not on PATH" });
    return emptyPlan("pyproject", absent);
  }

  if (existsSync(join(cwd, "Makefile"))) {
    absent.push({
      name: "makefile",
      reason: "makefile-not-in-allowlist",
    });
  }

  return emptyPlan("none", absent);
}

/**
 * Map a child exit into the chat-safe failure blob `firstFailureLine` reads.
 * A SIGTERM from moon cancelling a sibling task is not a timeout.
 */
export function verifyRunFailure(input: {
  readonly timedOut?: boolean;
  readonly timeoutMs?: number;
  readonly code?: string | number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message?: string;
}): VerifyRunResult {
  if (input.code === "ENOENT") {
    return {
      ok: false,
      absent: true,
      output: "error: check binary is not available",
    };
  }
  if (input.timedOut) {
    return {
      ok: false,
      timedOut: true,
      output: `timed out after ${input.timeoutMs ?? VERIFY_TIMEOUT_MS}ms`,
    };
  }
  return {
    ok: false,
    output:
      [input.stderr, input.stdout, input.message]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join("\n") || "failed",
  };
}

/**
 * Checks run in the background after a stop, often for minutes (typecheck,
 * lint, tests, then the baseline re-run). At normal priority they starve the
 * daemon, so the next prompt's Prepare missed its 1 s budget (round 2: 6 of
 * 22 B6 prompts, and every probe miss came while checks ran). Children of the
 * check start at a low priority and inherit it.
 */
const CHECK_PRIORITY = osConstants.priority.PRIORITY_LOW;

function lowerPriority(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    setPriority(pid, CHECK_PRIORITY);
  } catch {
    // The child already exited, or the OS refused: the check still runs,
    // only at normal priority.
    return;
  }
}

/** Output of a check stopped because a newer change superseded it. */
export const CHECK_CANCELLED =
  "cancelled: a newer change superseded these checks";

function spawnArgv(
  cwd: string,
  argv: readonly string[],
  timeoutMs: number = VERIFY_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<VerifyRunResult> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ ok: false, output: CHECK_CANCELLED });
      return;
    }
    let settled = false;
    const finish = (result: VerifyRunResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const bin = argv[0];
    if (!bin) {
      finish({ ok: false, absent: true, output: "error: empty argv" });
      return;
    }

    const child = spawn(bin, argv.slice(1), {
      cwd,
      env: gitChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    lowerPriority(child.pid);

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const onChunk = (which: "out" | "err") => (chunk: Buffer | string) => {
      if (which === "out") stdout = capBuffer(stdout + String(chunk));
      else stderr = capBuffer(stderr + String(chunk));
    };
    child.stdout?.on("data", onChunk("out"));
    child.stderr?.on("data", onChunk("err"));

    const killGroup = (): void => {
      if (child.pid != null && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* not a group leader */
        }
      }
      child.kill("SIGTERM");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutMs);
    let cancelled = false;
    const onAbort = (): void => {
      cancelled = true;
      clearTimeout(timer);
      killGroup();
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    child.on("error", (error) => {
      clearTimeout(timer);
      const code = (error as NodeJS.ErrnoException).code;
      finish(
        verifyRunFailure({
          ...(code !== undefined ? { code } : {}),
          message: error.message,
          stdout,
          stderr,
        }),
      );
    });

    child.on("close", (code, exitSignal) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (cancelled) {
        finish({ ok: false, output: CHECK_CANCELLED });
        return;
      }
      if (timedOut) {
        finish(verifyRunFailure({ timedOut: true, timeoutMs, stdout, stderr }));
        return;
      }
      if (code === 0) {
        finish({ ok: true, output: stdout });
        return;
      }
      if (
        exitSignal === "SIGTERM" ||
        exitSignal === "SIGINT" ||
        exitSignal === "SIGHUP"
      ) {
        finish(
          verifyRunFailure({
            stdout,
            stderr: stderr || `terminated by signal ${exitSignal}`,
          }),
        );
        return;
      }
      const combined = [stderr, stdout].filter(Boolean).join("\n");
      if (SCRIPT_MISSING.test(combined)) {
        finish({ ok: false, absent: true, output: combined });
        return;
      }
      finish(verifyRunFailure({ code, stdout, stderr }));
    });
  });
}

/**
 * Own process group so a later `kill(-workerPid)` cannot SIGTERM checks
 * that happen to share the hub's group. Pipes stay attached so we still
 * read the failure.
 */
export const defaultVerifyRunner: VerifyRunner = (cwd, step) =>
  verifyRunnerWithTimeout(VERIFY_TIMEOUT_MS)(cwd, step);

/** The default runner with a per-command limit (the receipt uses 60 s). */
export function verifyRunnerWithTimeout(
  timeoutMs: number,
  signal?: AbortSignal,
): VerifyRunner {
  return (cwd, step) => {
    if (step.kind === "package-script") {
      const { argv } = packageManagerArgv(cwd, step.script);
      return spawnArgv(cwd, argv, timeoutMs, signal);
    }
    return spawnArgv(cwd, step.argv, timeoutMs, signal);
  };
}

/** First failing line, so chat gets a reason rather than a wall of output. */
export function firstFailureLine(output: string): string {
  const lines = output
    .split("\n")
    .map((part) => part.trim())
    .filter(
      (part) => part.length > 3 && /error|fail|✗|×|TS\d{3,5}/i.test(part),
    );
  const skip = (part: string): boolean =>
    INTERRUPT_NOISE.test(part) || WRAPPER_NOISE.test(part);
  const line = lines.find((part) => !skip(part));
  if (line) return truncateLine(line);
  if (lines.some((part) => INTERRUPT_NOISE.test(part))) {
    return "checks were interrupted before they finished";
  }
  return "";
}

/** Moon SIGTERM / polite quit with no compiler error is not a test failure. */
export function isCheckInterrupted(output: string): boolean {
  if (/error TS\d{3,5}/i.test(output)) return false;
  if (INTERRUPT_NOISE.test(output)) return true;
  return /interrupted before they finished/i.test(firstFailureLine(output));
}

async function hasPackageJson(cwd: string): Promise<boolean> {
  try {
    await access(join(cwd, "package.json"));
    return true;
  } catch {
    return false;
  }
}

function joinPassed(names: readonly string[]): string {
  if (names.length === 0) return "Checks passed.";
  if (names.length === 1) return `${names[0]} passed.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} passed.`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} passed.`;
}

/**
 * Run the detected plan. Stops at the first real
 * failure. Missing binaries and missing scripts are absent, not failed.
 */
export async function verifyJobWork(
  cwd: string,
  options: {
    readonly run?: VerifyRunner;
    readonly enabled?: boolean;
  } = {},
): Promise<VerificationResult> {
  if (options.enabled === false) {
    return { status: "skipped", detail: "Checks are turned off." };
  }

  const plan = await resolveVerifyPlan(cwd);

  if (plan.steps.length === 0) {
    return { status: "skipped", detail: "No checks to run.", plan };
  }

  const hasPkg = await hasPackageJson(cwd);
  const run = options.run ?? defaultVerifyRunner;
  const passed: string[] = [];
  const runtimeAbsent = [...plan.absent];

  for (const step of plan.steps) {
    if (step.kind === "package-script" && !hasPkg && !options.run) {
      runtimeAbsent.push({ name: step.name, reason: "no package.json" });
      continue;
    }
    let result = await run(cwd, step);
    if (!result.ok && isCheckInterrupted(result.output)) {
      result = await run(cwd, step);
    }
    if (result.ok) {
      passed.push(step.name);
      continue;
    }
    if (result.absent || SCRIPT_MISSING.test(result.output)) {
      runtimeAbsent.push({
        name: step.name,
        reason: "script or binary not found",
      });
      continue;
    }
    if (isCheckInterrupted(result.output)) {
      return {
        status: "skipped",
        detail: "Checks were interrupted before they finished.",
        plan: { ...plan, absent: runtimeAbsent },
      };
    }
    const reason = firstFailureLine(result.output);
    return {
      status: "failed",
      detail: reason
        ? `${step.name} failed — ${reason}`
        : `${step.name} failed.`,
      plan: { ...plan, absent: runtimeAbsent },
    };
  }

  if (passed.length === 0) {
    return {
      status: "skipped",
      detail: "No checks to run.",
      plan: { ...plan, absent: runtimeAbsent, provenance: "unavailable" },
    };
  }

  return {
    status: "passed",
    detail: joinPassed(passed),
    plan: { ...plan, absent: runtimeAbsent },
  };
}
