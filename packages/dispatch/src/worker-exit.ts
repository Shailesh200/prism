/**
 * Last-chance sidecar writes when a worker process dies outside the happy
 * path. SIGTERM/SIGINT already cancel the run; these handlers cover crashes
 * that would otherwise leave a thinking sidecar and a dead pid — reaped as
 * "stopped unexpectedly" with no reason.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { publicRunFailure } from "./job-voice.js";
import { runStatePath } from "./paths.js";
import type { RunState } from "./run-state.js";

function writeRunStateSync(path: string, state: RunState): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.crash.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(temp, path);
}

export function recordWorkerCrash(
  workspaceRoot: string,
  jobId: string,
  pid: number,
  detail: string,
): void {
  const path = runStatePath(workspaceRoot, jobId);
  let current: Partial<RunState> = {};
  try {
    current = JSON.parse(readFileSync(path, "utf8")) as Partial<RunState>;
  } catch {
    /* no sidecar yet */
  }
  if (
    current.phase === "done" ||
    current.phase === "failed" ||
    current.phase === "cancelled"
  ) {
    return;
  }
  const now = new Date().toISOString();
  writeRunStateSync(path, {
    jobId,
    pid: typeof current.pid === "number" ? current.pid : pid,
    phase: "failed",
    lastActivity: current.lastActivity ?? "Error",
    resultSummary: current.resultSummary ?? "",
    errorMessage: publicRunFailure(detail),
    gitSummary: current.gitSummary ?? "",
    startedAt: current.startedAt ?? now,
    updatedAt: now,
    completedAt: now,
  });
}

/** Install once per worker-child process, after the spawn payload is known. */
export function installWorkerCrashGuards(input: {
  readonly workspaceRoot: string;
  readonly jobId: string;
}): void {
  const fail = (detail: string): void => {
    recordWorkerCrash(input.workspaceRoot, input.jobId, process.pid, detail);
  };
  process.on("uncaughtException", (error) => {
    fail(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    fail(reason instanceof Error ? reason.message : String(reason));
    process.exit(1);
  });
}
