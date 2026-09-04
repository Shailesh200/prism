/**
 * Cursor SDK agent options for a Dispatch worker.
 *
 * The agent edits the job worktree (`local.cwd`) and gets a **worker-role**
 * Prism MCP: read-only intelligence answered by the Console, which already has
 * Core loaded and indexed (ADR-0050).
 *
 * This is not a reversal of ADR-0041. Its rule was "exactly one Core per
 * machine", and a worker-role server keeps it — that process starts no Core at
 * all, and registers no intelligence tools when no Console answers. The thing
 * that hung 8GB laptops was a second index; there is still only one.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type CursorAgentOptionsInput = {
  readonly cwd: string;
  readonly apiKey?: string;
  readonly name?: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
  /** Allow the worker to spawn in-process subagents (ADR-0042 §4). */
  readonly subagents?: boolean;
};

export function workerMcpEnv(
  hostWorkspaceRoot: string,
): Record<string, string> {
  return {
    PRISM_DISPATCH_ROLE: "worker",
    PRISM_WORKSPACE: hostWorkspaceRoot,
  };
}

export function mcpArgsWithWorkspace(
  args: readonly string[],
  workspaceRoot: string,
): string[] {
  if (
    args.includes("--workspace") ||
    args.some((arg) => arg.startsWith("--workspace="))
  ) {
    return [...args];
  }
  return [...args, "--workspace", workspaceRoot];
}

/** Built-in edit tools. No shell (ADR-0041). */
export const WORKER_EDIT_TOOLS = [
  "read",
  "edit",
  "grep",
  "glob",
  "ls",
  "delete",
  "readLints",
] as const;

/**
 * In-process subagents (ADR-0042 §4). A subagent runs inside the worker's own
 * process, so it adds no OS process, no worktree, and no second index — the
 * costs ADR-0041 was actually guarding against. It inherits this same
 * allowlist, so it gets no shell either.
 */
export const WORKER_SUBAGENT_TOOL = "task";

/**
 * The capability group that admits MCP tools at all.
 *
 * The Cursor SDK's `tools` vocabulary has no per-MCP-tool granularity: `"mcp"`
 * grants the whole MCP family and omitting it disables MCP entirely. Unknown
 * names throw a `ConfigurationError` at `Agent.create`, so naming individual
 * Prism tools here would stop every worker from starting rather than narrowing
 * anything. The narrowing happens on the server instead — a worker-role Prism
 * MCP registers only read-only intelligence, and `visibleDispatchTools` already
 * withholds `start_job` (ADR-0050).
 */
export const WORKER_MCP_TOOL = "mcp";

/**
 * The read-only intelligence tools a worker-role Prism MCP registers.
 *
 * Declared here rather than beside the implementation in `mcp-server` because
 * both worker backends need the list and only one of them can import that
 * package: `mcp-server` depends on `dispatch`, not the reverse. Claude names
 * them `mcp__prism__<tool>` in its allowlist; Cursor takes the `"mcp"`
 * capability group and does not enumerate.
 */
export const WORKER_INTELLIGENCE_TOOLS = [
  "blast_radius",
  "rename_impact",
  "safe_delete",
  "test_impact",
  "find_symbol",
  "explain_area",
] as const;

export type WorkerIntelligenceTool = (typeof WORKER_INTELLIGENCE_TOOLS)[number];

export function workerTools(subagents: boolean, mcp = false): string[] {
  return [
    ...WORKER_EDIT_TOOLS,
    ...(subagents ? [WORKER_SUBAGENT_TOOL] : []),
    ...(mcp ? [WORKER_MCP_TOOL] : []),
  ];
}

/**
 * The worker's own Prism MCP registration.
 *
 * `PRISM_WORKSPACE` points at the **host** checkout, not the worktree: that is
 * the tree the Console indexes, and asking about any other one would get an
 * answer about a repository nobody is looking at.
 */
export function workerMcpServers(input: {
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
}): Record<string, unknown> {
  return {
    prism: {
      command: input.mcpCommand,
      args: mcpArgsWithWorkspace(input.mcpArgs, input.workspaceRoot),
      env: workerMcpEnv(input.workspaceRoot),
    },
  };
}

/**
 * Write the worker's `mcp.json` and return its path.
 *
 * Claude takes a file (`--mcp-config`) where Cursor takes an object, so this
 * exists only for that backend. Returns undefined when there is nothing to
 * launch, and never throws: a worker that cannot get intelligence should still
 * edit code, exactly as it did before ADR-0050.
 */
export async function writeWorkerMcpConfig(input: {
  readonly path: string;
  readonly mcpCommand: string;
  readonly mcpArgs: readonly string[];
  readonly workspaceRoot: string;
}): Promise<string | undefined> {
  if (!input.mcpCommand) return undefined;
  try {
    await mkdir(dirname(input.path), { recursive: true });
    await writeFile(
      input.path,
      JSON.stringify({ mcpServers: workerMcpServers(input) }, undefined, 2),
      { mode: 0o600 },
    );
    return input.path;
  } catch {
    return undefined;
  }
}

export function cursorAgentOptions(
  input: CursorAgentOptionsInput,
): Record<string, unknown> {
  return {
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
    ...(input.name ? { name: input.name } : {}),
    model: { id: "auto" },
    local: {
      cwd: input.cwd,
      settingSources: [],
      sandboxOptions: { enabled: true },
    },
    mcpServers: workerMcpServers(input),
    // No shell: a teammate with shell ran `prism` and re-indexed the repo
    // (second intelligence pass) and exhausted RAM on 8 GB machines.
    // Verification runs in the supervisor instead (ADR-0042 §3).
    tools: workerTools(input.subagents ?? false, true),
  };
}
