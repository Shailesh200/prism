import { spawn } from "node:child_process";
import { access, unlink } from "node:fs/promises";
import { setPriority } from "node:os";
import { fileURLToPath } from "node:url";
import { writeJsonFile } from "./json-file.js";
import { formatMemoriesForPrompt, memoriesForJob } from "./memory.js";
import { spawnPayloadPath, runStatePath } from "./paths.js";
import {
  killWorkerTree,
  killWorkerTreeForce,
  patchRunState,
  readRunState,
  writeRunState,
} from "./run-state.js";
import type { JobRecord, MemoryItem } from "./types.js";
import { workerChildEnv } from "./worker-budget.js";

export type WorkerStartInput = {
  readonly jobId: string;
  readonly cwd: string;
  readonly apiKey?: string;
  readonly name?: string;
  readonly prompt: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
  /** Commit message subject and artifact audit context (ADR-0042 §1). */
  readonly title?: string;
  readonly baseRef?: string;
  readonly subagents?: boolean;
  readonly verify?: boolean;
};

export type WorkerHandle = {
  readonly agentId?: string;
  readonly pid?: number;
};

export type WorkerPort = {
  start(input: WorkerStartInput): Promise<WorkerHandle>;
  resume(input: {
    readonly jobId: string;
    readonly agentId: string;
    readonly cwd: string;
    readonly apiKey?: string;
    readonly name?: string;
    readonly prompt?: string;
    readonly mcpCommand: string;
    readonly mcpArgs: readonly string[];
    readonly workspaceRoot: string;
    readonly title?: string;
    readonly baseRef?: string;
    readonly subagents?: boolean;
    readonly verify?: boolean;
  }): Promise<WorkerHandle | void>;
  cancel(input: {
    readonly agentId?: string;
    readonly cwd: string;
    readonly apiKey?: string;
    readonly jobId?: string;
    readonly workspaceRoot?: string;
    readonly pid?: number;
  }): Promise<void>;
  status(input: {
    readonly agentId?: string;
    readonly cwd: string;
    readonly apiKey?: string;
    readonly jobId?: string;
    readonly workspaceRoot?: string;
  }): Promise<{ status: string; detail: string }>;
};

export type CursorSdk = {
  Agent: {
    create(options: Record<string, unknown>): Promise<{
      agentId: string;
      send(prompt: string): Promise<{
        id?: string;
        cancel?: () => Promise<void>;
        supports?: (name: string) => boolean;
        wait?: () => Promise<{ status?: string; result?: unknown }>;
      }>;
    }>;
    resume(
      agentId: string,
      options: Record<string, unknown>,
    ): Promise<{
      send(prompt: string): Promise<{
        cancel?: () => Promise<void>;
        supports?: (name: string) => boolean;
      }>;
    }>;
    listRuns?(
      agentId: string,
      options?: Record<string, unknown>,
    ): Promise<
      { items?: { status?: string; id?: string }[] } | { status?: string }[]
    >;
  };
  Cursor?: {
    auth: {
      login(options?: Record<string, unknown>): Promise<{
        apiKey: string;
        email?: string;
        apiKeyExpiresAtMs: number;
      }>;
      status(): Promise<
        | { status: "logged-out" }
        | {
            status: "logged-in";
            backendUrl: string;
            email?: string;
            apiKeyExpiresAtMs?: number;
          }
      >;
    };
  };
};

export function workerPrompt(input: {
  readonly job: JobRecord;
  readonly memories: readonly MemoryItem[];
  readonly extra?: string;
  readonly subagents?: boolean;
}): string {
  const remembered = formatMemoriesForPrompt(
    memoriesForJob(input.memories, input.job.id),
  );
  return [
    `You are a Prism Dispatch worker for ${input.job.title} (${input.job.id}).`,
    "Work only in this worktree. Do not start new Dispatch jobs, run start_my_day, or begin OAuth. You already have a job.",
    "Do not install dependencies (no bun install, npm install, or yarn). node_modules is already linked from the host repo.",
    "You have no shell. Do not run prism, git, bun, npm, or any CLI. Edit existing source with the file tools only.",
    input.subagents
      ? "For multi-part work, split it with the task tool and run subagents in parallel. They share your sandbox: file tools only, no shell."
      : "",
    "Do not copy the repo, do not create extra worktrees, and do not write large caches. Prefer small, targeted edits.",
    // Prism commits the worktree and runs typecheck/test once the agent
    // stops, so the model must not claim either happened (ADR-0042 §1, §3).
    "Prism commits your work on the job branch and runs typecheck and tests after you stop. Do not claim you committed, ran tests, or verified anything.",
    "Write any write-up to .prism/dispatch/notes/ — that is the one path under .prism/ that ships with the commit. Everything else there is ignored and will be lost.",
    "When you finish, say what changed in a short last message (files and why), even if nothing shipped. Only name files you actually wrote.",
    input.job.prd ? `PRD:\n${input.job.prd}` : "",
    remembered ? `Memories:\n${remembered}` : "",
    input.extra ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function loadCursorSdk(): Promise<CursorSdk | undefined> {
  try {
    return (await import("@cursor/sdk")) as unknown as CursorSdk;
  } catch {
    return undefined;
  }
}

export function resolveWorkerChildPath(): string {
  return fileURLToPath(new URL("./worker-child.js", import.meta.url));
}

export type CursorWorkerPortOptions = {
  /** Override the worker-child entry (tests). */
  readonly childPath?: string;
};

async function launchWorkerChild(
  input: {
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
    readonly subagents?: boolean;
    readonly verify?: boolean;
  },
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
      ...(input.name ? { name: input.name } : {}),
      ...(input.resumeAgentId ? { resumeAgentId: input.resumeAgentId } : {}),
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

export function createCursorWorkerPort(
  options: CursorWorkerPortOptions = {},
): WorkerPort {
  const childJs = options.childPath ?? resolveWorkerChildPath();
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
          ...(input.apiKey ? { apiKey: input.apiKey } : {}),
          ...(input.name ? { name: input.name } : {}),
          ...(input.agentId ? { resumeAgentId: input.agentId } : {}),
        },
        childJs,
      );
      return { pid };
    },
    async cancel(input) {
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
    },
    async status(input) {
      if (!input.workspaceRoot || !input.jobId) {
        return { status: "unknown", detail: "" };
      }
      const run = await readRunState(input.workspaceRoot, input.jobId);
      if (!run) return { status: "unknown", detail: "" };
      return {
        status: run.phase,
        detail: run.lastActivity,
      };
    },
  };
}

export function isPrismMcpBin(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return (
    normalized.endsWith("/mcp-server/dist/bin.js") ||
    normalized.endsWith("/@repo-prism/mcp-server/dist/bin.js") ||
    normalized.endsWith("/@repo-prism/mcp-server/bin.js")
  );
}

export function resolveMcpLaunch(
  env: NodeJS.ProcessEnv,
  argv: readonly string[] = process.argv,
): {
  command: string;
  args: string[];
} {
  if (env.PRISM_MCP_BIN) {
    return { command: process.execPath, args: [env.PRISM_MCP_BIN] };
  }
  const self = argv[1];
  if (self && isPrismMcpBin(self)) {
    return { command: process.execPath, args: [self] };
  }
  return { command: "npx", args: ["-y", "@repo-prism/mcp-server"] };
}
