import { formatMemoriesForPrompt, memoriesForJob } from "./memory.js";
import type { JobRecord, MemoryItem } from "./types.js";

export type WorkerStartInput = {
  readonly cwd: string;
  readonly apiKey: string;
  readonly prompt: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
};

export type WorkerHandle = {
  readonly agentId: string;
};

export type WorkerPort = {
  start(input: WorkerStartInput): Promise<WorkerHandle>;
  resume(input: {
    readonly agentId: string;
    readonly cwd: string;
    readonly apiKey: string;
    readonly prompt?: string;
    readonly mcpCommand: string;
    readonly mcpArgs: readonly string[];
    readonly workspaceRoot: string;
  }): Promise<void>;
  cancel(input: {
    readonly agentId: string;
    readonly cwd: string;
    readonly apiKey: string;
  }): Promise<void>;
  status(input: {
    readonly agentId: string;
    readonly cwd: string;
    readonly apiKey: string;
  }): Promise<{ status: string; detail: string }>;
};

type CursorSdk = {
  Agent: {
    create(options: Record<string, unknown>): Promise<{
      agentId: string;
      send(prompt: string): Promise<{
        id?: string;
        cancel?: () => Promise<void>;
        supports?: (name: string) => boolean;
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
};

const inflight = new Map<
  string,
  { cancel?: () => Promise<void>; supports?: (name: string) => boolean }
>();

export function workerPrompt(input: {
  readonly job: JobRecord;
  readonly memories: readonly MemoryItem[];
  readonly extra?: string;
}): string {
  const remembered = formatMemoriesForPrompt(
    memoriesForJob(input.memories, input.job.id),
  );
  return [
    `You are a Prism Dispatch worker for job ${input.job.id}: ${input.job.title}.`,
    "Work only in this worktree. Use Prism MCP intelligence tools before risky edits: call blast_radius on the file or symbol, then test_impact.",
    "Do not start new Dispatch jobs, run start_my_day, or begin OAuth. You already have a job.",
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

export function createCursorWorkerPort(): WorkerPort {
  return {
    async start(input) {
      const sdk = await loadCursorSdk();
      if (!sdk) {
        throw new Error(
          "@cursor/sdk is not installed. bun add @cursor/sdk in the Prism workspace, then retry.",
        );
      }
      const agent = await sdk.Agent.create(agentOptions(input));
      const run = await agent.send(input.prompt);
      inflight.set(agent.agentId, {
        ...(run.cancel ? { cancel: () => run.cancel!() } : {}),
        ...(run.supports ? { supports: run.supports } : {}),
      });
      return { agentId: agent.agentId };
    },
    async resume(input) {
      const sdk = await loadCursorSdk();
      if (!sdk) throw new Error("@cursor/sdk is not installed");
      const agent = await sdk.Agent.resume(input.agentId, agentOptions(input));
      if (input.prompt) {
        const run = await agent.send(input.prompt);
        inflight.set(input.agentId, {
          ...(run.cancel ? { cancel: () => run.cancel!() } : {}),
          ...(run.supports ? { supports: run.supports } : {}),
        });
      }
    },
    async cancel(input) {
      const run = inflight.get(input.agentId);
      if (run?.cancel && (run.supports?.("cancel") ?? true)) {
        await run.cancel();
        inflight.delete(input.agentId);
        return;
      }
      const sdk = await loadCursorSdk();
      if (!sdk) return;
      const agent = await sdk.Agent.resume(input.agentId, {
        apiKey: input.apiKey,
        local: { cwd: input.cwd },
      });
      const sent = await agent.send("Stop. Cancel the current run.");
      if (sent.cancel && (sent.supports?.("cancel") ?? true)) {
        await sent.cancel();
      }
    },
    async status(input) {
      const sdk = await loadCursorSdk();
      if (!sdk?.Agent.listRuns) {
        return {
          status: inflight.has(input.agentId) ? "running" : "unknown",
          detail: inflight.has(input.agentId)
            ? "in-process run"
            : "SDK listRuns unavailable",
        };
      }
      const listed = await sdk.Agent.listRuns(input.agentId, {
        runtime: "local",
        limit: 1,
      });
      const items = Array.isArray(listed) ? listed : (listed.items ?? []);
      const latest = items[0] as { status?: string; id?: string } | undefined;
      return {
        status: latest?.status ?? "unknown",
        detail: latest?.id ?? "",
      };
    },
  };
}

function agentOptions(input: {
  readonly cwd: string;
  readonly apiKey: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
}): Record<string, unknown> {
  return {
    apiKey: input.apiKey,
    model: { id: "auto" },
    local: { cwd: input.cwd },
    mcpServers: {
      prism: {
        type: "stdio",
        command: input.mcpCommand,
        args: [...input.mcpArgs],
        env: {
          PRISM_DISPATCH_ROLE: "worker",
          PRISM_WORKSPACE: input.cwd,
        },
      },
    },
  };
}

export function resolveMcpLaunch(env: NodeJS.ProcessEnv): {
  command: string;
  args: string[];
} {
  if (env.PRISM_MCP_BIN) {
    return { command: process.execPath, args: [env.PRISM_MCP_BIN] };
  }
  return { command: "npx", args: ["-y", "@repo-prism/mcp-server"] };
}
