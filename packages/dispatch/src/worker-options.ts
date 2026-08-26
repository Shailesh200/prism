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

/** Built-in tools only — no shell, MCP, or nested agents (ADR-0041). */
export const WORKER_EDIT_TOOLS = [
  "read",
  "edit",
  "grep",
  "glob",
  "ls",
  "delete",
  "readLints",
] as const;

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
    tools: [...WORKER_EDIT_TOOLS],
  };
}
