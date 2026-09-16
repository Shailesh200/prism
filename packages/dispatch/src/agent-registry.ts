/**
 * Agent registry: data-driven mapping from agent names to their CLI
 * configurations. Adding a new agent is a config entry, not code.
 *
 * Built-in agents (Cursor, Claude) ship with the package. User agents
 * are loaded from `.prism/dispatch/agents.json` and merged.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";

// ── Schema ───────────────────────────────────────────────────────────────

export const AgentCliFlagsSchema = z.object({
  /** Flag prefix for the prompt string (e.g., "-p", "--prompt"). */
  prompt: z.string().min(1),
  /** Flag for output format (e.g., "--output-format"). */
  outputFormat: z.string().optional(),
  /** Value to pass after outputFormat (e.g., "stream-json"). */
  outputFormatValue: z.string().optional(),
  /** Verbose flag (e.g., "--verbose"). */
  verbose: z.string().optional(),
  /** Tool allowlist flag (e.g., "--tools"). */
  tools: z.string().optional(),
  /** Resume flag (e.g., "--resume"). */
  resume: z.string().optional(),
  /** Disallowed tools flag (e.g., "--disallowedTools"). */
  disallowedTools: z.string().optional(),
  /** Extra static flags to always pass. */
  extra: z.array(z.string()).default([]),
});
export type AgentCliFlags = z.infer<typeof AgentCliFlagsSchema>;

export const AgentOutputFormatSchema = z.enum([
  "stream-json",
  "sdk-events",
  "plain-text",
]);
export type AgentOutputFormat = z.infer<typeof AgentOutputFormatSchema>;

export const AgentConfigSchema = z.object({
  /** Canonical slug used in config and job records. */
  name: z.string().min(1).max(40),
  /** Human-readable label for UI display. */
  label: z.string().min(1),
  /** CLI command to spawn (e.g., "claude", "cursor-agent"). */
  cli: z.string().min(1),
  /** Command to check auth status (e.g., "claude auth status"). */
  authCheck: z.string().optional(),
  /** Command to trigger login (e.g., "claude auth login"). */
  authLogin: z.string().optional(),
  /** CLI flags this agent accepts. */
  flags: AgentCliFlagsSchema,
  /** How the agent's CLI outputs results. */
  outputFormat: AgentOutputFormatSchema.default("plain-text"),
  /** Whether this agent is built-in (cannot be overridden by config). */
  builtin: z.boolean().default(false),
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const AgentsConfigSchema = z.record(z.string(), AgentConfigSchema);
export type AgentsConfig = z.infer<typeof AgentsConfigSchema>;

// ── Built-in agents ──────────────────────────────────────────────────────

const BUILTIN_AGENTS: AgentConfig[] = [
  {
    name: "cursor",
    label: "Cursor",
    cli: "cursor-agent",
    authCheck: "cursor auth status",
    authLogin: "cursor auth login",
    flags: {
      prompt: "--prompt",
      tools: "--tools",
      extra: [],
    },
    outputFormat: "sdk-events",
    builtin: true,
  },
  {
    name: "claude",
    label: "Claude Code",
    cli: "claude",
    authCheck: "claude auth status",
    authLogin: "claude auth login",
    flags: {
      prompt: "-p",
      outputFormat: "--output-format",
      outputFormatValue: "stream-json",
      verbose: "--verbose",
      tools: "--tools",
      resume: "--resume",
      disallowedTools: "--disallowedTools",
      extra: ["--verbose"],
    },
    outputFormat: "stream-json",
    builtin: true,
  },
];

// ── Registry ─────────────────────────────────────────────────────────────

export type AgentRegistryEntry = {
  readonly config: AgentConfig;
  readonly source: "builtin" | "config";
};

/**
 * In-memory registry. Created once per dispatch runtime, merged from
 * builtins + `.prism/dispatch/agents.json`.
 */
export class AgentRegistry {
  private readonly agents: Map<string, AgentRegistryEntry> = new Map();

  constructor(userAgents: AgentsConfig = {}) {
    // Load builtins first
    for (const agent of BUILTIN_AGENTS) {
      this.agents.set(agent.name, { config: agent, source: "builtin" });
    }
    // Merge user agents (can override builtins)
    for (const [name, agent] of Object.entries(userAgents)) {
      this.agents.set(name, { config: agent, source: "config" });
    }
  }

  /** Look up an agent by canonical name. */
  get(name: string): AgentRegistryEntry | undefined {
    return this.agents.get(name.toLowerCase().trim());
  }

  /** Check if an agent name is registered (even if CLI is missing). */
  has(name: string): boolean {
    return this.agents.has(name.toLowerCase().trim());
  }

  /** List all registered agents. */
  all(): AgentRegistryEntry[] {
    return [...this.agents.values()];
  }

  /** List just the names. */
  names(): string[] {
    return [...this.agents.keys()];
  }

  /** Human-readable list for error messages. */
  availableLabel(): string {
    const names = this.names();
    if (names.length === 0) return "(none registered)";
    return names.join(", ");
  }
}

// ── Config loading ───────────────────────────────────────────────────────

/**
 * Load `agents.json` from the dispatch dir. Returns an empty record
 * on any error (file missing, parse error, schema mismatch).
 */
export function loadAgentsConfig(dispatchDir: string): AgentsConfig {
  try {
    const raw = JSON.parse(
      readFileSync(`${dispatchDir}/agents.json`, "utf8"),
    ) as unknown;
    const parsed = AgentsConfigSchema.safeParse(raw);
    if (!parsed.success) return {};
    return parsed.data;
  } catch {
    return {};
  }
}

/**
 * Create an `AgentRegistry` for a workspace. Loads user agents from
 * `agents.json` if present, merges with builtins.
 */
export function createAgentRegistry(dispatchDir: string): AgentRegistry {
  const userAgents = loadAgentsConfig(dispatchDir);
  return new AgentRegistry(userAgents);
}
