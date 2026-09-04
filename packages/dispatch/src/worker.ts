import { fileURLToPath } from "node:url";
import { formatMemoriesForPrompt, memoriesForJob } from "./memory.js";
import {
  cancelWorkerRun,
  launchWorkerChild,
  workerRunStatus,
} from "./worker-spawn.js";
import type { JobRecord, MemoryItem } from "./types.js";

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
  /** Job branch, named in the review summary so chat never says a worktree. */
  readonly branch?: string;
  readonly subagents?: boolean;
  readonly verify?: boolean;
  /** ADR-0045: checkout edits the user's tree, uncommitted. */
  readonly placement?: "checkout" | "worktree";
  readonly preExistingChanges?: readonly string[];
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
    readonly branch?: string;
    readonly subagents?: boolean;
    readonly verify?: boolean;
    readonly placement?: "checkout" | "worktree";
    readonly preExistingChanges?: readonly string[];
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
  /** ADR-0045: checkout jobs edit the user's tree and never commit. */
  readonly placement?: "checkout" | "worktree";
  /** Standing how-to from Dispatch Settings; injected on every job. */
  readonly jobInstructions?: string;
}): string {
  const remembered = formatMemoriesForPrompt(
    memoriesForJob(input.memories, input.job.id),
  );
  const checkout = input.placement === "checkout";
  const standing = input.jobInstructions?.trim() ?? "";
  return [
    `You are a Prism Dispatch worker for ${input.job.title} (${input.job.id}).`,
    checkout
      ? "Work only in this repository checkout — the user's own working tree on their current branch. Do not start new Dispatch jobs, run start_my_day, or begin OAuth. You already have a job."
      : "Work only in this worktree. Do not start new Dispatch jobs, run start_my_day, or begin OAuth. You already have a job.",
    "Do not install dependencies (no bun install, npm install, or yarn). node_modules is already linked from the host repo.",
    "You have no shell. Do not run prism, git, bun, npm, or any CLI. Edit existing source with the file tools only.",
    input.subagents
      ? "For multi-part work, split it with the task tool and run subagents in parallel. They share your sandbox: file tools only, no shell."
      : "",
    "Do not copy the repo, do not create extra worktrees, and do not write large caches. Prefer small, targeted edits.",
    // Prism runs typecheck/test once the agent stops, so the model must not
    // claim either happened (ADR-0042 §3). Committing is placement-dependent
    // (ADR-0045): worktree jobs are committed by Prism; checkout jobs stay
    // uncommitted in the user's tree.
    checkout
      ? "Prism never commits here: your edits stay uncommitted in the user's working tree. Prism runs typecheck and tests after you stop. Do not claim you committed, ran tests, or verified anything."
      : "Prism commits your work on the job branch and runs typecheck and tests after you stop. Do not claim you committed, ran tests, or verified anything.",
    checkout
      ? "Write any write-up to .prism/dispatch/notes/ — the one .prism/ path included if the user later asks for a commit. Everything else there is ignored."
      : "Write any write-up to .prism/dispatch/notes/ — that is the one path under .prism/ that ships with the commit. Everything else there is ignored and will be lost.",
    "If the brief says to change nothing, print something and stop, or otherwise avoid edits: do not create, edit, or delete any files. Answer in your last message only.",
    "When you finish, say what changed in a short last message (files and why), even if nothing shipped. Only name files you actually wrote.",
    standing ? `Standing job instructions from the user:\n${standing}` : "",
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
          ...(input.branch ? { branch: input.branch } : {}),
          ...(input.apiKey ? { apiKey: input.apiKey } : {}),
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
