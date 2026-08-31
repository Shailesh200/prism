#!/usr/bin/env node
/**
 * Out-of-process Dispatch worker (Cursor SDK backend). Spawned by the host
 * MCP so the agent loop never runs inside the prism stdio server (ADR-0040).
 *
 * argv[2] = path to a 0600 spawn payload JSON (deleted after read).
 */

import { stripWorktreePaths } from "./job-artifacts.js";
import { publicWorkerError } from "./job-voice.js";
import {
  appendRunLog,
  lifecycleLogEntry,
  logEntryFromEvent,
} from "./run-log.js";
import { trustSystemCertificateAuthorities } from "./system-ca.js";
import {
  activityFromEvent,
  createRunWriter,
  killDirectChildren,
  patchRunState,
  type RunState,
} from "./run-state.js";
import { readSpawnPayload } from "./worker-spawn.js";
import {
  cancelWorkerRunFinish,
  completeWorkerRun,
  failWorkerRun,
} from "./worker-finish.js";
import { cursorAgentOptions } from "./worker-options.js";

// Own process, own TLS state: the host MCP trusting the OS store does not carry
// across the spawn, and without this the Cursor SDK reports "Network request
// failed" behind corporate HTTPS interception.
trustSystemCertificateAuthorities();

type SdkRun = {
  id?: string;
  wait?: () => Promise<{
    status?: string;
    result?: unknown;
    id?: string;
  }>;
  stream?: () => AsyncIterable<unknown>;
  cancel?: () => Promise<void>;
  supports?: (name: string) => boolean;
};

type SdkAgent = {
  agentId: string;
  send(prompt: string): Promise<SdkRun>;
  [Symbol.asyncDispose]?: () => Promise<void>;
};

function assistantText(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return "";
  const row = result as Record<string, unknown>;
  if (typeof row.text === "string") return row.text;
  if (typeof row.result === "string") return row.result;
  if (typeof row.message === "string") return row.message;
  return "";
}

async function observeRun(
  run: SdkRun,
  patch: (
    partial: Partial<RunState>,
    options?: { immediate?: boolean },
  ) => Promise<unknown>,
  log: (event: unknown) => Promise<void>,
): Promise<void> {
  if (typeof run.stream !== "function") return;
  try {
    for await (const event of run.stream()) {
      // Log first: the one-line activity is throttled and overwritten, so the
      // console is the only place an event survives.
      await log(event);
      const activity = activityFromEvent(event);
      if (activity) await patch(activity);
    }
  } catch {
    /* stream closed when wait() finishes */
  }
}

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

  const logEvent = async (event: unknown): Promise<void> => {
    const entry = logEntryFromEvent(event);
    if (entry) await appendRunLog(payload.workspaceRoot, payload.jobId, entry);
  };
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

  const finish = { patch: writer.patch.bind(writer), logLine: logLine };
  const finishInput = {
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

  let activeRun: SdkRun | undefined;
  const onStop = (): void => {
    void (async () => {
      try {
        if (activeRun?.cancel && (activeRun.supports?.("cancel") ?? true)) {
          await activeRun.cancel();
        }
      } catch {
        /* ignore */
      }
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

  let sdk: {
    Agent: {
      create(options: Record<string, unknown>): Promise<SdkAgent>;
      resume(
        agentId: string,
        options: Record<string, unknown>,
      ): Promise<SdkAgent>;
    };
  };
  try {
    sdk = (await import("@cursor/sdk")) as unknown as typeof sdk;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    await writer.patch(
      {
        phase: "failed",
        errorMessage: publicWorkerError(detail),
        completedAt: new Date().toISOString(),
      },
      { immediate: true },
    );
    process.exit(1);
  }

  const options = cursorAgentOptions({
    cwd: payload.cwd,
    workspaceRoot: payload.workspaceRoot,
    mcpCommand: payload.mcpCommand,
    mcpArgs: payload.mcpArgs,
    subagents: payload.subagents ?? false,
    ...(payload.name ? { name: payload.name } : {}),
  });

  let agent: SdkAgent | undefined;
  try {
    agent = payload.resumeAgentId
      ? await sdk.Agent.resume(payload.resumeAgentId, options)
      : await sdk.Agent.create(options);
    await writer.patch(
      {
        agentId: agent.agentId,
        phase: "running",
        lastActivity: "Teammate is on it",
      },
      { immediate: true },
    );

    const sent = await agent.send(payload.prompt);
    activeRun = sent;
    if (sent.id) {
      await writer.patch({ runId: sent.id, phase: "running" });
    }
    void observeRun(
      sent,
      (partial, extra) => writer.patch(partial, extra),
      logEvent,
    );

    if (typeof sent.wait !== "function") {
      await writer.patch(
        {
          phase: "failed",
          errorMessage:
            "The teammate started but could not report a result. Say resume to try again.",
          completedAt: new Date().toISOString(),
        },
        { immediate: true },
      );
      process.exit(2);
    }

    const result = await sent.wait();
    const rawAssistant = assistantText(result.result);
    const assistant = stripWorktreePaths(rawAssistant, payload.cwd);

    if (result.status === "error") {
      await failWorkerRun(finishInput, assistant || "the run failed", finish);
      process.exit(2);
    }
    if (result.status === "cancelled") {
      await cancelWorkerRunFinish(finishInput, finish);
      process.exit(0);
    }

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
    try {
      await agent?.[Symbol.asyncDispose]?.();
    } catch {
      /* ignore */
    }
    killDirectChildren(process.pid);
  }
}

void main();
