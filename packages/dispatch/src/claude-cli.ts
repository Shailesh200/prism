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

/**
 * Flags we can run without.
 *
 * These buy nicer output, not safety, so an older `claude` that rejects one
 * must not cost the user their job — a worker died with "unknown option
 * `--forward-subagent-text`" before touching a file. Anything not listed here
 * (the tool allowlist, `--bare`, the stream format) is load-bearing: dropping
 * it would either hand the agent a shell or leave us unable to read the run,
 * so an unknown-option failure on those is reported instead of retried.
 */
export const OPTIONAL_CLAUDE_FLAGS: readonly string[] = [
  "--forward-subagent-text",
];

/** The offending flag from a CLI launcher error, if that is what failed. */
export function unknownOptionFrom(stderr: string): string | undefined {
  const match = /unknown option[^'"`]*['"`]([^'"`]+)['"`]/i.exec(stderr);
  return match?.[1];
}

export function isOptionalClaudeFlag(flag: string | undefined): boolean {
  return flag !== undefined && OPTIONAL_CLAUDE_FLAGS.includes(flag);
}

/** Drop a flag (and nothing else) from an argv built by `claudeWorkerArgs`. */
export function withoutClaudeFlag(
  args: readonly string[],
  flag: string,
): string[] {
  return args.filter((arg) => arg !== flag);
}

export function claudeWorkerArgs(input: {
  readonly subagents?: boolean;
  /** Claude session_id to resume (ADR-0044 §5). */
  readonly resumeSessionId?: string;
  /** Flags a previous launch rejected as unknown. */
  readonly omitFlags?: readonly string[];
}): string[] {
  const tools = [
    ...CLAUDE_WORKER_TOOLS,
    ...(input.subagents ? [CLAUDE_SUBAGENT_TOOL] : []),
  ];
  const omit = new Set(input.omitFlags ?? []);
  const args = [
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
  return omit.size === 0 ? args : args.filter((arg) => !omit.has(arg));
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
