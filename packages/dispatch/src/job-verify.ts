/**
 * Supervisor-run verification for a finished job (ADR-0042 §3).
 *
 * ADR-0041 removed `shell` from the *agent* because a teammate with a shell
 * ran the `prism` CLI and started a second index. That property is preserved
 * here: the model never chooses a command. `worker-child` — plain Node, which
 * already owns the process lifecycle — runs a fixed allowlist after the agent
 * has stopped, so a job carries a real pass/fail signal instead of reporting
 * `done` on unverified edits.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { gitChildEnv } from "./git.js";

/** Ten minutes per step — `moon run :typecheck` over a monorepo is slow. */
export const VERIFY_TIMEOUT_MS = 600_000;
/** Keep the last 16 MB so a verbose moon run is not killed for maxBuffer. */
export const VERIFY_MAX_BUFFER = 16_000_000;

export type VerificationStatus = "passed" | "failed" | "skipped";

export type VerificationResult = {
  readonly status: VerificationStatus;
  /** One chat-safe line. Never a worktree path, never command output dumps. */
  readonly detail: string;
};

/**
 * The only scripts a worker may run. Not configurable: an allowlist the user
 * can extend is a shell with extra steps. `install`, `add`, and the `prism`
 * CLI are absent on purpose — no second index, no mutation of the host
 * `node_modules` that worktrees symlink to (ADR-0041 §2, §4).
 */
export const VERIFY_STEPS: readonly { name: string; script: string }[] = [
  { name: "typecheck", script: "typecheck" },
  { name: "test", script: "test" },
];

export type VerifyRunner = (
  cwd: string,
  script: string,
) => Promise<{ ok: boolean; output: string }>;

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

/**
 * Map a child exit into the chat-safe failure blob `firstFailureLine` reads.
 * A SIGTERM from moon cancelling a sibling task is not a timeout.
 */
export function verifyRunFailure(input: {
  readonly timedOut?: boolean;
  readonly code?: string | number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly message?: string;
}): { ok: false; output: string } {
  if (input.code === "ENOENT") {
    return { ok: false, output: "error: bun is not available to run checks" };
  }
  if (input.timedOut) {
    return { ok: false, output: `timed out after ${VERIFY_TIMEOUT_MS}ms` };
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
 * Own process group so a later `kill(-workerPid)` cannot SIGTERM checks
 * that happen to share the hub's group. Pipes stay attached so we still
 * read the failure.
 */
export const defaultVerifyRunner: VerifyRunner = (cwd, script) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; output: string }): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const child = spawn(bunCliPath(), ["run", script], {
      cwd,
      env: gitChildEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const onChunk = (which: "out" | "err") => (chunk: Buffer | string) => {
      if (which === "out") stdout = capBuffer(stdout + String(chunk));
      else stderr = capBuffer(stderr + String(chunk));
    };
    child.stdout?.on("data", onChunk("out"));
    child.stderr?.on("data", onChunk("err"));

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid != null && process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* not a group leader */
        }
      }
      child.kill("SIGTERM");
    }, VERIFY_TIMEOUT_MS);

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

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        finish(verifyRunFailure({ timedOut: true, stdout, stderr }));
        return;
      }
      if (code === 0) {
        finish({ ok: true, output: stdout });
        return;
      }
      if (signal === "SIGTERM" || signal === "SIGINT" || signal === "SIGHUP") {
        finish(
          verifyRunFailure({
            stdout,
            stderr: stderr || `terminated by signal ${signal}`,
          }),
        );
        return;
      }
      finish(verifyRunFailure({ code, stdout, stderr }));
    });
  });

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

/**
 * Run the allowlist in the worktree. Stops at the first failure — a failing
 * typecheck makes the test result uninteresting.
 */
export async function verifyJobWork(
  cwd: string,
  options: {
    readonly run?: VerifyRunner;
    readonly steps?: readonly { name: string; script: string }[];
    readonly enabled?: boolean;
  } = {},
): Promise<VerificationResult> {
  if (options.enabled === false) {
    return { status: "skipped", detail: "Checks are turned off." };
  }
  if (!(await hasPackageJson(cwd))) {
    return { status: "skipped", detail: "No package.json to check." };
  }

  const run = options.run ?? defaultVerifyRunner;
  const steps = options.steps ?? VERIFY_STEPS;
  const passed: string[] = [];

  for (const step of steps) {
    let result = await run(cwd, step.script);
    if (!result.ok && isCheckInterrupted(result.output)) {
      result = await run(cwd, step.script);
    }
    if (result.ok) {
      passed.push(step.name);
      continue;
    }
    if (isCheckInterrupted(result.output)) {
      return {
        status: "skipped",
        detail: "Checks were interrupted before they finished.",
      };
    }
    const reason = firstFailureLine(result.output);
    return {
      status: "failed",
      detail: reason
        ? `${step.name} failed — ${reason}`
        : `${step.name} failed.`,
    };
  }

  return {
    status: "passed",
    detail: passed.length
      ? `${passed.join(" and ")} passed.`
      : "Checks passed.",
  };
}
