/**
 * Backend-neutral worker process plumbing (ADR-0044).
 *
 * Both worker children — Cursor SDK (`worker-child`) and Claude Code CLI
 * (`claude-worker-child`) — are spawned the same way: a 0600 spawn payload
 * under `runs/`, a fresh run-state sidecar, a detached Node child. Cancel and
 * status are pid/run-state based and identical for every backend, so the
 * ports share them from here.
 */

import { spawn } from "node:child_process";
import { access, unlink } from "node:fs/promises";
import { setPriority } from "node:os";
import { writeJsonFile, readJsonFile } from "./json-file.js";
import { spawnPayloadPath, runStatePath } from "./paths.js";
import {
  killWorkerTree,
  killWorkerTreeForce,
  patchRunState,
  readRunState,
  writeRunState,
} from "./run-state.js";
import { workerChildEnv } from "./worker-budget.js";

/** The 0600 payload a worker child reads once at boot (then deletes). */
export type SpawnPayload = {
  readonly jobId: string;
  readonly cwd: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly name?: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  /** Cursor agentId or Claude session_id, depending on the backend. */
  readonly resumeAgentId?: string;
  readonly title?: string;
  readonly baseRef?: string;
  readonly branch?: string;
  readonly subagents?: boolean;
  readonly verify?: boolean;
  /** Absent = worktree (the pre-M-066 default, ADR-0045). */
  readonly placement?: "checkout" | "worktree";
  /** Checkout only: paths already dirty at dispatch (ADR-0045 §3). */
  readonly preExistingChanges?: readonly string[];
};

export function isSpawnPayload(value: unknown): value is SpawnPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.jobId === "string" &&
    typeof row.cwd === "string" &&
    typeof row.workspaceRoot === "string" &&
    typeof row.prompt === "string" &&
    typeof row.mcpCommand === "string" &&
    Array.isArray(row.mcpArgs)
  );
}

/** Read and delete the spawn payload a worker child was launched with. */
export async function readSpawnPayload(
  payloadPath: string,
): Promise<SpawnPayload | undefined> {
  const raw = await readJsonFile<unknown>(payloadPath, null);
  await unlink(payloadPath).catch(() => undefined);
  return isSpawnPayload(raw) ? raw : undefined;
}

export type LaunchWorkerInput = {
  readonly jobId: string;
  readonly cwd: string;
  readonly apiKey?: string;
  readonly name?: string;
  readonly prompt: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
  readonly resumeAgentId?: string;
  readonly title?: string;
  readonly baseRef?: string;
  readonly branch?: string;
  readonly subagents?: boolean;
  readonly verify?: boolean;
  readonly placement?: "checkout" | "worktree";
  readonly preExistingChanges?: readonly string[];
};

export async function launchWorkerChild(
  input: LaunchWorkerInput,
  childJs: string,
): Promise<number> {
  try {
    await access(childJs);
  } catch {
    throw new Error(
      "Prism could not start a teammate. Reload the prism MCP server, then say prism init.",
    );
  }

  const payloadPath = spawnPayloadPath(input.workspaceRoot, input.jobId);
  await writeJsonFile(
    payloadPath,
    {
      jobId: input.jobId,
      cwd: input.cwd,
      workspaceRoot: input.workspaceRoot,
      prompt: input.prompt,
      mcpCommand: input.mcpCommand,
      mcpArgs: [...input.mcpArgs],
      runPath: runStatePath(input.workspaceRoot, input.jobId),
      subagents: input.subagents ?? false,
      verify: input.verify ?? true,
      ...(input.title ? { title: input.title } : {}),
      ...(input.baseRef ? { baseRef: input.baseRef } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.resumeAgentId ? { resumeAgentId: input.resumeAgentId } : {}),
      ...(input.placement ? { placement: input.placement } : {}),
      ...(input.preExistingChanges
        ? { preExistingChanges: [...input.preExistingChanges] }
        : {}),
    },
    0o600,
  );

  const startedAt = new Date().toISOString();
  await writeRunState(input.workspaceRoot, input.jobId, {
    jobId: input.jobId,
    phase: "starting",
    lastActivity: "Starting",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt,
    updatedAt: startedAt,
  });

  const child = spawn(process.execPath, [childJs, payloadPath], {
    detached: true,
    stdio: "ignore",
    cwd: input.cwd,
    env: workerChildEnv(process.env, input.apiKey),
  });
  const pid = child.pid;
  if (pid == null) {
    await unlink(payloadPath).catch(() => undefined);
    throw new Error("Prism could not start a teammate.");
  }
  child.unref();
  try {
    setPriority(pid, 10);
  } catch {
    /* best-effort niceness */
  }
  await patchRunState(input.workspaceRoot, input.jobId, {
    pid,
    phase: "starting",
    lastActivity: "Starting",
  });
  return pid;
}

/** Cancel is a pid kill plus a run-state patch — the same for every backend. */
export async function cancelWorkerRun(input: {
  readonly pid?: number;
  readonly workspaceRoot?: string;
  readonly jobId?: string;
}): Promise<void> {
  let pid = input.pid;
  if (pid == null && input.workspaceRoot && input.jobId) {
    pid = (await readRunState(input.workspaceRoot, input.jobId))?.pid;
  }
  if (pid != null) {
    killWorkerTree(pid);
    const captured = pid;
    setTimeout(() => {
      killWorkerTreeForce(captured);
    }, 2_000).unref();
  }
  if (input.workspaceRoot && input.jobId) {
    await patchRunState(input.workspaceRoot, input.jobId, {
      phase: "cancelled",
      lastActivity: "Cancelled",
      completedAt: new Date().toISOString(),
    });
  }
}

/** Status is read from the run-state sidecar — the same for every backend. */
export async function workerRunStatus(input: {
  readonly workspaceRoot?: string;
  readonly jobId?: string;
}): Promise<{ status: string; detail: string }> {
  if (!input.workspaceRoot || !input.jobId) {
    return { status: "unknown", detail: "" };
  }
  const run = await readRunState(input.workspaceRoot, input.jobId);
  if (!run) return { status: "unknown", detail: "" };
  return {
    status: run.phase,
    detail: run.lastActivity,
  };
}
