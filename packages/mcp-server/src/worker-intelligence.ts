/**
 * Intelligence tools for a Dispatch job worker, served by the Console
 * (ADR-0050).
 *
 * ADR-0041 gave workers `mcpServers: {}` because a teammate that started its
 * own Core would index the repository a second time and exhaust an 8GB laptop.
 * That rule was never "workers must be blind" — it was "there must be exactly
 * one Core per machine". ADR-0048's Console is that one Core, already loaded
 * and already warm, so a worker can ask it questions over loopback for the cost
 * of an HTTP round trip and no additional memory.
 *
 * Three limits are deliberate:
 *
 * - Every tool here maps onto a `HostRequest` method the Console already
 *   serves. No new Console capability is invented to widen the worker surface.
 * - Answers describe the **host checkout**, which is what the Console indexes —
 *   not the worker's worktree. Structural facts are the same either way and are
 *   the reason to ask; "what did I just write" is not, and the descriptions
 *   say so.
 * - With no Console reachable, no tool is registered. Falling back to a local
 *   Core would silently reintroduce the exact failure ADR-0041 prevented.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readHubRecord } from "@repo-prism/dispatch-hub";
import {
  WORKER_INTELLIGENCE_TOOLS,
  type WorkerIntelligenceTool,
} from "@repo-prism/dispatch";

export type ConsoleLink = {
  readonly port: number;
  readonly token: string;
};

/** A `HostResponse`, narrowed to what a proxy needs to branch on. */
type HostAnswer =
  | { ok: true; data: unknown }
  | { ok: false; error?: string }
  | undefined;

export type HostCall = (
  method: string,
  params: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Find a live Console.
 *
 * A record on disk is a claim, not a fact — the daemon may have been killed
 * since it was written. The health probe is what turns it into a fact, and it
 * is cheap enough to pay for on worker start.
 */
export async function findConsole(
  options: {
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
  } = {},
): Promise<ConsoleLink | undefined> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const record = await readHubRecord(options.env ?? process.env).catch(
    () => undefined,
  );
  const port = record?.port;
  const token = record?.token;
  if (typeof port !== "number" || typeof token !== "string" || !token) {
    return undefined;
  }
  try {
    const health = await fetchImpl(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!health.ok) return undefined;
  } catch {
    return undefined;
  }
  return { port, token };
}

/** Post one `HostRequest` to the Console and unwrap its answer. */
export function consoleCaller(
  link: ConsoleLink,
  workspace: string,
  fetchImpl: typeof fetch = fetch,
): HostCall {
  let seq = 0;
  return async (method, params) => {
    seq += 1;
    const res = await fetchImpl(`http://127.0.0.1:${link.port}/api/host`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${link.token}`,
      },
      body: JSON.stringify({ id: `w${seq}`, method, workspace, ...params }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(`the Prism Console answered ${res.status} for ${method}`);
    }
    const answer = (await res.json()) as HostAnswer;
    if (!answer?.ok) {
      throw new Error(
        answer?.error ?? `the Console could not answer ${method}`,
      );
    }
    return answer.data;
  };
}

/**
 * `impact` returns blast radius, rename, safe-delete and test impact together,
 * and its payload is a Result rather than the value — so every tool built on it
 * has the same two-layer unwrap to do.
 */
async function impactBundle(
  call: HostCall,
  target: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = (await call("impact", { target })) as
    | { ok: true; value: Record<string, unknown> }
    | { ok: false; error: string };
  if (!data.ok) throw new Error(data.error);
  return data.value;
}

const WORKTREE_NOTE =
  "Answers describe the host checkout that Prism indexes, not this worktree — correct for structural questions, stale for code you just wrote.";

type WorkerToolBody = {
  readonly title: string;
  readonly description: string;
  readonly schema: z.ZodRawShape;
  run(call: HostCall, args: Record<string, unknown>): Promise<unknown>;
};

export type WorkerTool = WorkerToolBody & {
  readonly name: WorkerIntelligenceTool;
};

const target = {
  kind: z
    .enum(["file", "symbol"])
    .describe("Whether `id` names a file path or a symbol."),
  id: z.string().describe("Workspace-relative file path, or symbol name."),
  path: z
    .string()
    .optional()
    .describe("For a symbol, the file that declares it."),
};

/**
 * The worker tool set.
 *
 * Chosen for one job: deciding whether an edit is safe before making it. A
 * teammate does not need `repository_health` or a dependency graph dump — it
 * needs to know what breaks and which tests cover it.
 *
 * Keyed by `WorkerIntelligenceTool` so the set and the list the worker backends
 * allowlist from cannot drift: adding a name there without an implementation
 * here, or the reverse, is a compile error rather than a tool that never
 * resolves.
 */
const WORKER_TOOL_BODIES: Record<WorkerIntelligenceTool, WorkerToolBody> = {
  blast_radius: {
    title: "Blast radius",
    description: `What depends on a file or symbol, and how risky changing it is. Call before editing code you have not read in full. ${WORKTREE_NOTE}`,
    schema: target,
    async run(call, args) {
      const bundle = await impactBundle(call, { ...args, intent: "edit" });
      return { blast: bundle.blast, testImpact: bundle.testImpact };
    },
  },
  rename_impact: {
    title: "Rename impact",
    description: `Every site that has to change when a symbol is renamed. Call before renaming, so the rename lands whole. ${WORKTREE_NOTE}`,
    schema: {
      ...target,
      newName: z.string().describe("The proposed new name."),
    },
    async run(call, args) {
      const bundle = await impactBundle(call, args);
      return bundle.rename;
    },
  },
  safe_delete: {
    title: "Safe delete",
    description: `Whether anything still depends on a file or symbol you plan to remove. ${WORKTREE_NOTE}`,
    schema: target,
    async run(call, args) {
      const bundle = await impactBundle(call, { ...args, intent: "delete" });
      return bundle.safeDelete;
    },
  },
  test_impact: {
    title: "Test impact",
    description: `Which test suites cover a file or symbol, so you can run those instead of everything. ${WORKTREE_NOTE}`,
    schema: target,
    async run(call, args) {
      const bundle = await impactBundle(call, { ...args, intent: "edit" });
      return bundle.testImpact;
    },
  },
  find_symbol: {
    title: "Find symbol",
    description: `Locate a symbol by name and see where it is declared. ${WORKTREE_NOTE}`,
    schema: { query: z.string().describe("Symbol name or fragment.") },
    async run(call, args) {
      return await call("symbols", { query: String(args.query ?? "") });
    },
  },
  explain_area: {
    title: "Explain area",
    description: `What a directory or file is for, and what it connects to. ${WORKTREE_NOTE}`,
    schema: { path: z.string().describe("Workspace-relative path.") },
    async run(call, args) {
      return await call("explainArea", { path: String(args.path ?? "") });
    },
  },
};

/** The record, flattened back into the order the backends allowlist in. */
export const WORKER_TOOLS: readonly WorkerTool[] =
  WORKER_INTELLIGENCE_TOOLS.map((name) => ({
    name,
    ...WORKER_TOOL_BODIES[name],
  }));

/**
 * The tool set and the name list the worker backends allowlist from are the
 * same thing. Claude enumerates `mcp__prism__<name>` in `--tools`, so a tool
 * registered here but missing from that list would be invisible, and one
 * listed there but not registered would be a name that never resolves.
 */
export function workerToolNames(): readonly string[] {
  return WORKER_TOOLS.map((tool) => tool.name);
}

/**
 * Register the worker intelligence tools, if a Console can answer them.
 *
 * Returns the number registered — zero means no Console, which is a legitimate
 * state and not an error: the teammate works without them, as it did before.
 */
export async function registerWorkerIntelligence(
  server: McpServer,
  options: {
    readonly workspaceRoot: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly fetchImpl?: typeof fetch;
    readonly link?: ConsoleLink;
  },
): Promise<number> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const link =
    options.link ??
    (await findConsole({
      ...(options.env ? { env: options.env } : {}),
      fetchImpl,
    }));
  if (!link) return 0;

  const call = consoleCaller(link, options.workspaceRoot, fetchImpl);
  for (const tool of WORKER_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.schema,
      },
      async (args: Record<string, unknown>) => {
        try {
          const data = await tool.run(call, args);
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(data, undefined, 2),
              },
            ],
          };
        } catch (err: unknown) {
          const detail = err instanceof Error ? err.message : String(err);
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Prism could not answer that: ${detail}`,
              },
            ],
          };
        }
      },
    );
  }
  return WORKER_TOOLS.length;
}
