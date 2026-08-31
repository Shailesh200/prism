#!/usr/bin/env node
/**
 * Out-of-process Dispatch worker (Claude Code backend, ADR-0044). Same
 * supervision contract as the Cursor child: own worktree, stream events into
 * the console log and run-state sidecar, and Prism — not the agent — commits
 * and runs checks when the agent stops (ADR-0042).
 *
 * argv[2] = path to a 0600 spawn payload JSON (deleted after read).
 * The prompt goes to `claude -p` over stdin: no argv length limit, no shell
 * quoting of user text.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { stripWorktreePaths } from "./job-artifacts.js";
import { publicWorkerError } from "./job-voice.js";
import {
  claudeGrandchildEnv,
  claudeCliCommand,
  claudeWorkerArgs,
} from "./claude-cli.js";
import {
  claudeActivityFrom,
  claudeLogEntryFrom,
  claudeResultFrom,
  claudeSessionIdFrom,
  type ClaudeResult,
} from "./claude-stream.js";
import { appendRunLog, lifecycleLogEntry } from "./run-log.js";
import {
  createRunWriter,
  killDirectChildren,
  patchRunState,
  type RunState,
} from "./run-state.js";
import { readSpawnPayload } from "./worker-spawn.js";
import {
  completeWorkerRun,
  failWorkerRun,
  type WorkerFinishInput,
} from "./worker-finish.js";

/** stderr is not the console; keep the tail for the failure message. */
const STDERR_TAIL = 2_000;

async function main(): Promise<void> {
  const payloadPath = process.argv[2];
  if (!payloadPath) {
    process.stderr.write("dispatch-worker: missing spawn payload path\n");
    process.exit(1);
  }

  const payload = await readSpawnPayload(payloadPath);
  if (!payload) {
    process.stderr.write("dispatch-worker: invalid spawn payload\n");
    process.exit(1);
  }
  const now = new Date().toISOString();
  const writer = createRunWriter(payload.workspaceRoot, payload.jobId, {
    jobId: payload.jobId,
    pid: process.pid,
    phase: "starting",
    lastActivity: "Starting",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt: now,
    updatedAt: now,
  });
  await writer.patch(
    { pid: process.pid, phase: "starting" },
    { immediate: true },
  );

  const logLine = async (
    phase: RunState["phase"],
    text: string,
  ): Promise<void> => {
    await appendRunLog(
      payload.workspaceRoot,
      payload.jobId,
      lifecycleLogEntry(phase, text),
    );
  };
  await logLine("starting", "Teammate starting");

  const finishInput: WorkerFinishInput = {
    jobId: payload.jobId,
    cwd: payload.cwd,
    workspaceRoot: payload.workspaceRoot,
    ...(payload.title ? { title: payload.title } : {}),
    ...(payload.baseRef ? { baseRef: payload.baseRef } : {}),
    ...(payload.branch ? { branch: payload.branch } : {}),
    ...(payload.verify !== undefined ? { verify: payload.verify } : {}),
  };
  const finish = {
    patch: (partial: Partial<RunState>, options?: { immediate?: boolean }) =>
      writer.patch(partial, options),
    logLine,
  };

  const cli = claudeCliCommand();
  const args = claudeWorkerArgs({
    subagents: payload.subagents ?? false,
    ...(payload.resumeAgentId
      ? { resumeSessionId: payload.resumeAgentId }
      : {}),
  });

  let child: ChildProcess;
  try {
    child = spawn(cli.command, args, {
      cwd: payload.cwd,
      env: claudeGrandchildEnv(process.env),
      shell: cli.shell,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    await failWorkerRun(finishInput, publicWorkerError(detail), finish);
    process.exit(1);
  }

  let cancelled = false;
  const onStop = (): void => {
    cancelled = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* already gone */
    }
    void (async () => {
      await writer.patch(
        {
          phase: "cancelled",
          lastActivity: "Cancelled",
          completedAt: new Date().toISOString(),
        },
        { immediate: true },
      );
      process.exit(0);
    })();
  };
  process.once("SIGTERM", onStop);
  process.once("SIGINT", onStop);

  let stderrTail = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL);
  });

  let result: ClaudeResult | undefined;
  let sessionPatched = false;
  let buffer = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const newline = buffer.indexOf("\n");
      if (newline < 0) break;
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let event: unknown;
      try {
        event = JSON.parse(line);
      } catch {
        continue; // a truncated line must not take the job down
      }
      const sessionId = claudeSessionIdFrom(event);
      if (sessionId && !sessionPatched) {
        sessionPatched = true;
        void writer.patch(
          {
            agentId: sessionId,
            phase: "running",
            lastActivity: "Teammate is on it",
          },
          { immediate: true },
        );
      }
      const entry = claudeLogEntryFrom(event);
      if (entry) {
        void appendRunLog(payload.workspaceRoot, payload.jobId, entry);
      }
      const activity = claudeActivityFrom(event);
      if (activity) void writer.patch(activity);
      const terminal = claudeResultFrom(event);
      if (terminal) result = terminal;
    }
  });

  child.on("error", (cause) => {
    // ENOENT and friends: the CLI is not installed or not on PATH.
    const detail = cause instanceof Error ? cause.message : String(cause);
    void (async () => {
      await logLine("failed", detail);
      await patchRunState(payload.workspaceRoot, payload.jobId, {
        phase: "failed",
        errorMessage: publicWorkerError(detail),
        completedAt: new Date().toISOString(),
      });
      process.exit(1);
    })();
  });

  // The prompt travels over stdin: user text never touches argv.
  child.stdin?.on("error", () => {
    /* EPIPE when the CLI exits before reading */
  });
  child.stdin?.write(payload.prompt);
  child.stdin?.end();

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on("close", (code) => resolve(code));
  });
  if (cancelled) return; // the signal handler already patched and exited

  try {
    if (result?.isError) {
      await failWorkerRun(
        finishInput,
        result.text || `the run failed (${result.subtype || "error"})`,
        finish,
      );
      process.exit(2);
    }
    if (!result && exitCode !== 0) {
      const detail =
        stderrTail.trim() || `claude exited with code ${exitCode ?? "?"}`;
      await failWorkerRun(finishInput, publicWorkerError(detail), finish);
      process.exit(1);
    }
    const assistant = stripWorktreePaths(result?.text ?? "", payload.cwd);
    await completeWorkerRun(finishInput, assistant, finish);
    process.exit(0);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    await logLine("failed", detail);
    await patchRunState(payload.workspaceRoot, payload.jobId, {
      phase: "failed",
      errorMessage: publicWorkerError(detail),
      completedAt: new Date().toISOString(),
    });
    process.exit(1);
  } finally {
    killDirectChildren(process.pid);
  }
}

void main();
