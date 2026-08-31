/**
 * Cursor SDK agent options for a Dispatch worker.
 *
 * The agent edits the job worktree (`local.cwd`). We do **not** attach Prism
 * MCP: a second intelligence server would re-index (or contend on the host
 * SQLite) and is what hung laptops even for one job (ADR-0041).
 */

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

/** Built-in edit tools. No shell and no MCP (ADR-0041). */
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

export function workerTools(subagents: boolean): string[] {
  return subagents
    ? [...WORKER_EDIT_TOOLS, WORKER_SUBAGENT_TOOL]
    : [...WORKER_EDIT_TOOLS];
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
    mcpServers: {},
    // No shell: a teammate with shell ran `prism` and re-indexed the repo
    // (second intelligence pass) and exhausted RAM on 8 GB machines.
    // Verification runs in the supervisor instead (ADR-0042 §3).
    tools: workerTools(input.subagents ?? false),
  };
}
