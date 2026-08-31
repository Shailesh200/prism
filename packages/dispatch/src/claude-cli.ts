/**
 * The `claude` CLI invocation for a Dispatch worker (ADR-0044 §3).
 *
 * The CLI is the contract — no SDK dependency. Flags pin ADR-0041/0042's
 * rules: `--bare` skips hooks/skills/MCP/CLAUDE.md discovery (no second
 * index), `--tools` removes everything but the file allowlist (no shell, so
 * no `bun install` against the symlinked node_modules), `acceptEdits` lets
 * those edits through in non-interactive mode.
 */

/** File tools a worker may use. No Bash — Prism runs checks, not the agent. */
export const CLAUDE_WORKER_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Grep",
  "Glob",
  "LS",
] as const;

/** In-process subagents (ADR-0042 §4): Claude's built-in Task tool. */
export const CLAUDE_SUBAGENT_TOOL = "Task";

export function claudeWorkerArgs(input: {
  readonly subagents?: boolean;
  /** Claude session_id to resume (ADR-0044 §5). */
  readonly resumeSessionId?: string;
}): string[] {
  const tools = [
    ...CLAUDE_WORKER_TOOLS,
    ...(input.subagents ? [CLAUDE_SUBAGENT_TOOL] : []),
  ];
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--bare",
    // Subagent text/thinking flows into the stream so the console can show
    // what each subagent did (M-066 P-P6).
    ...(input.subagents ? ["--forward-subagent-text"] : []),
    "--permission-mode",
    "acceptEdits",
    "--tools",
    tools.join(","),
    // Belt and braces with --tools: a bare name removes the tool entirely.
    "--disallowedTools",
    "Bash",
    "--disallowedTools",
    "mcp__*",
    ...(input.resumeSessionId ? ["--resume", input.resumeSessionId] : []),
  ];
}

/**
 * Environment for the `claude` grandchild. A host MCP server launched by
 * Claude Code carries nesting guards (`CLAUDECODE`, `CLAUDE_CODE_*`) that
 * would make the worker's own CLI refuse to start; strip them. Auth env the
 * user set deliberately (`CLAUDE_CODE_OAUTH_TOKEN`, `ANTHROPIC_API_KEY`)
 * stays.
 */
export function claudeGrandchildEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  delete next.CLAUDECODE;
  for (const key of Object.keys(next)) {
    if (key.startsWith("CLAUDE_CODE_") && key !== "CLAUDE_CODE_OAUTH_TOKEN") {
      delete next[key];
    }
  }
  return next;
}

/** The CLI binary. Windows needs the .cmd shim through a shell. */
export function claudeCliCommand(
  platform: NodeJS.Platform = process.platform,
): { command: string; shell: boolean } {
  return platform === "win32"
    ? { command: "claude.cmd", shell: true }
    : { command: "claude", shell: false };
}
