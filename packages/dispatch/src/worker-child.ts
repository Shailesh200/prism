#!/usr/bin/env node
/**
 * Out-of-process Dispatch worker. Spawned by the host MCP so the agent loop
 * never runs inside the prism stdio server (ADR-0040).
 *
 * argv[2] = path to a 0600 spawn payload JSON (deleted after read).
 */

import { unlink } from "node:fs/promises";
import { readJsonFile } from "./json-file.js";
import { gitChangeSummary } from "./git.js";
import { publicRunFailure, publicWorkerError } from "./job-voice.js";
import { trustSystemCertificateAuthorities } from "./system-ca.js";
import {
  activityFromEvent,
  composeResultSummary,
  createRunWriter,
  killDirectChildren,
  patchRunState,
  type RunState,
} from "./run-state.js";
import { cursorAgentOptions } from "./worker-options.js";

// Own process, own TLS state: the host MCP trusting the OS store does not carry
// across the spawn, and without this the Cursor SDK reports "Network request
// failed" behind corporate HTTPS interception.
trustSystemCertificateAuthorities();

type SpawnPayload = {
  readonly jobId: string;
  readonly cwd: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly name?: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly resumeAgentId?: string;
};

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

function isPayload(value: unknown): value is SpawnPayload {
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
): Promise<void> {
  if (typeof run.stream !== "function") return;
  try {
    for await (const event of run.stream()) {
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

  const raw = await readJsonFile<unknown>(payloadPath, null);
  await unlink(payloadPath).catch(() => undefined);
  if (!isPayload(raw)) {
    process.stderr.write("dispatch-worker: invalid spawn payload\n");
    process.exit(1);
  }
  const payload = raw;
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
    void observeRun(sent, (partial, extra) => writer.patch(partial, extra));

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
    const gitSummary = await gitChangeSummary(payload.cwd);
    const assistant = assistantText(result.result);
    const completedAt = new Date().toISOString();

    if (result.status === "error") {
      await writer.patch(
        {
          phase: "failed",
          errorMessage: publicRunFailure(assistant || "the run failed"),
          gitSummary,
          resultSummary: gitSummary,
          completedAt,
        },
        { immediate: true },
      );
      process.exit(2);
    }
    if (result.status === "cancelled") {
      await writer.patch(
        {
          phase: "cancelled",
          gitSummary,
          lastActivity: "Cancelled",
          completedAt,
        },
        { immediate: true },
      );
      process.exit(0);
    }

    await writer.patch(
      {
        phase: "done",
        gitSummary,
        resultSummary: composeResultSummary(gitSummary, assistant),
        lastActivity: "Done",
        completedAt,
      },
      { immediate: true },
    );
    process.exit(0);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
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
