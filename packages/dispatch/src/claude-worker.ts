/**
 * Claude Code worker port (ADR-0044). Same `WorkerPort` contract as the
 * Cursor backend; only the child entry differs. Cancel and status are
 * pid/run-state based and shared from worker-spawn.
 */

import { fileURLToPath } from "node:url";
import {
  cancelWorkerRun,
  launchWorkerChild,
  workerRunStatus,
} from "./worker-spawn.js";
import type { WorkerPort } from "./worker.js";

export function resolveClaudeWorkerChildPath(): string {
  return fileURLToPath(new URL("./claude-worker-child.js", import.meta.url));
}

export type ClaudeWorkerPortOptions = {
  /** Override the worker-child entry (tests). */
  readonly childPath?: string;
};

export function createClaudeWorkerPort(
  options: ClaudeWorkerPortOptions = {},
): WorkerPort {
  const childJs = options.childPath ?? resolveClaudeWorkerChildPath();
  return {
    async start(input) {
      const pid = await launchWorkerChild(input, childJs);
      return { pid };
    },
    async resume(input) {
      const pid = await launchWorkerChild(
        {
          jobId: input.jobId,
          cwd: input.cwd,
          workspaceRoot: input.workspaceRoot,
          prompt: input.prompt ?? "Continue.",
          mcpCommand: input.mcpCommand,
          mcpArgs: input.mcpArgs,
          subagents: input.subagents ?? false,
          verify: input.verify ?? true,
          ...(input.title ? { title: input.title } : {}),
          ...(input.baseRef ? { baseRef: input.baseRef } : {}),
          ...(input.branch ? { branch: input.branch } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.agentId ? { resumeAgentId: input.agentId } : {}),
          ...(input.placement ? { placement: input.placement } : {}),
          ...(input.preExistingChanges
            ? { preExistingChanges: input.preExistingChanges }
            : {}),
        },
        childJs,
      );
      return { pid };
    },
    async cancel(input) {
      await cancelWorkerRun({
        ...(typeof input.pid === "number" ? { pid: input.pid } : {}),
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      });
    },
    async status(input) {
      return workerRunStatus({
        ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
        ...(input.jobId ? { jobId: input.jobId } : {}),
      });
    },
  };
}
