/**
 * The `claude` CLI invocation for a Dispatch worker (ADR-0044 §3).
 *
 * The CLI is the contract — no SDK dependency. Isolation is the tool
 * allowlist plus an explicit `--mcp-config` (ADR-0041 / ADR-0050), not
 * `--bare`. From Claude Code 2.1, `--bare` skips keychain OAuth, so a
 * teammate on the user's existing claude.ai login would fail with an API
 * error before touching a file. `--disable-slash-commands` still drops
 * skills; `--strict-mcp-config` (optional) keeps MCP discovery from merging
 * the user's other servers onto the worker-role Prism config.
 */

import { WORKER_INTELLIGENCE_TOOLS } from "./worker-options.js";

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
 * `--forward-subagent-text` is cosmetic. `--strict-mcp-config` and
 * `--disable-slash-commands` tighten isolation but older CLIs lack them, so
 * an unknown-option failure must not cost the user their job. Anything not
 * listed here (the tool allowlist, the stream format) is load-bearing.
 */
export const OPTIONAL_CLAUDE_FLAGS: readonly string[] = [
  "--forward-subagent-text",
  "--strict-mcp-config",
  "--disable-slash-commands",
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
  /** A written mcp.json holding only worker-role Prism (ADR-0050). */
  readonly mcpConfigPath?: string;
}): string[] {
  const tools = [
    ...CLAUDE_WORKER_TOOLS,
    ...(input.subagents ? [CLAUDE_SUBAGENT_TOOL] : []),
    // Named one by one. `--tools` is an allowlist, so this both admits Prism's
    // tools and is the whole restriction: anything else a `--mcp-config` might
    // carry is excluded by not appearing, with no pattern matching to trust.
    ...(input.mcpConfigPath
      ? WORKER_INTELLIGENCE_TOOLS.map((name) => `mcp__prism__${name}`)
      : []),
  ];
  const omit = new Set(input.omitFlags ?? []);
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--disable-slash-commands",
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
    ...(input.mcpConfigPath
      ? ["--strict-mcp-config", "--mcp-config", input.mcpConfigPath]
      : ["--disallowedTools", "mcp__*"]),
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
