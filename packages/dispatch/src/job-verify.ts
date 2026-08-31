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

import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitChildEnv } from "./git.js";

const execFileAsync = promisify(execFile);

export const VERIFY_TIMEOUT_MS = 240_000;

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

export const defaultVerifyRunner: VerifyRunner = async (cwd, script) => {
  try {
    const result = await execFileAsync("bun", ["run", script], {
      cwd,
      env: gitChildEnv(),
      encoding: "utf8",
      timeout: VERIFY_TIMEOUT_MS,
      maxBuffer: 4_000_000,
    });
    return { ok: true, output: result.stdout };
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
      killed?: boolean;
    };
    if (err.killed) {
      return { ok: false, output: `timed out after ${VERIFY_TIMEOUT_MS}ms` };
    }
    return {
      ok: false,
      output: err.stderr || err.stdout || err.message || "failed",
    };
  }
};

/** First failing line, so chat gets a reason rather than a wall of output. */
export function firstFailureLine(output: string): string {
  const line = output
    .split("\n")
    .map((part) => part.trim())
    .find((part) => /error|fail|✗|×/i.test(part) && part.length > 3);
  if (!line) return "";
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
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
    const result = await run(cwd, step.script);
    if (result.ok) {
      passed.push(step.name);
      continue;
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
