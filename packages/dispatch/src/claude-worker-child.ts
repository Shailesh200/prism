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
  isOptionalClaudeFlag,
  unknownOptionFrom,
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
    ...(payload.placement ? { placement: payload.placement } : {}),
    ...(payload.preExistingChanges
      ? { preExistingChanges: payload.preExistingChanges }
      : {}),
  };
  const finish = {
    patch: (partial: Partial<RunState>, options?: { immediate?: boolean }) =>
      writer.patch(partial, options),
    logLine,
  };

  const cli = claudeCliCommand();
  /** Optional flags this CLI rejected; dropped on the retry. */
  const omitFlags: string[] = [];
  const buildArgs = (): string[] =>
    claudeWorkerArgs({
      subagents: payload.subagents ?? false,
      ...(payload.resumeAgentId
        ? { resumeSessionId: payload.resumeAgentId }
        : {}),
      omitFlags,
    });

  let args = buildArgs();
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
      // `child` is reassigned on a retry; kill whichever is current.
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
  let result: ClaudeResult | undefined;
  let sessionPatched = false;

  /** Wire one CLI process up to the console and run it to completion. */
  const runChild = async (active: ChildProcess): Promise<number | null> => {
    stderrTail = "";
    let buffer = "";

    active.stderr?.on("data", (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString("utf8")).slice(-STDERR_TAIL);
    });

    active.stdout?.on("data", (chunk: Buffer) => {
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

    active.on("error", (cause) => {
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
    active.stdin?.on("error", () => {
      /* EPIPE when the CLI exits before reading */
    });
    active.stdin?.write(payload.prompt);
    active.stdin?.end();

    return new Promise<number | null>((resolve) => {
      active.on("close", (code) => resolve(code));
    });
  };

  let exitCode = await runChild(child);
  if (cancelled) return; // the signal handler already patched and exited

  // An older CLI can reject a flag we only use to enrich the console. Losing
  // subagent detail is worth far less than losing the job, so drop it and go
  // again — but only for flags that are not load-bearing. A rejected safety
  // flag falls through to the normal failure path rather than silently
  // running the agent without its tool allowlist.
  if (!result && exitCode !== 0) {
    const rejected = unknownOptionFrom(stderrTail);
    if (isOptionalClaudeFlag(rejected) && !omitFlags.includes(rejected!)) {
      omitFlags.push(rejected!);
      await logLine(
        "starting",
        `This claude does not support ${rejected}; retrying without it.`,
      );
      args = buildArgs();
      child = spawn(cli.command, args, {
        cwd: payload.cwd,
        env: claudeGrandchildEnv(process.env),
        shell: cli.shell,
        stdio: ["pipe", "pipe", "pipe"],
      });
      exitCode = await runChild(child);
      if (cancelled) return;
    }
  }

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
