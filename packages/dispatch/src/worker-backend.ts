/**
 * Which agent CLI runs a Dispatch job (ADR-0044, M-073).
 *
 * The supervisor — worktree, console log, stall detection, Prism-side commit
 * and checks, review-before-land — is backend-neutral. Only the child that
 * drives an agent differs. Resolution order: `configure` → `PRISM_WORKER` →
 * the MCP client's own name → registry lookup → Cursor (the pre-M-065 default).
 *
 * M-073: Agent-agnostic. The registry maps agent names to CLI configs,
 * so adding a new agent is a config entry, not code.
 */

import type { AgentRegistry } from "./agent-registry.js";
import { clientLooksLikeClaude } from "@repo-prism/core/envelope";
import type { WorkerBackend, WorkerBackendSetting } from "./types.js";

export type { WorkerBackend, WorkerBackendSetting };

/** Backend-neutral worker credential check (ADR-0044 §6). */
export type WorkerAuthInspect = {
  readonly ready: boolean;
  readonly source: string;
  /** Cursor SDK key; Claude workers authenticate through the CLI itself. */
  readonly apiKey?: string;
  readonly email?: string;
  readonly message: string;
};

/**
 * Resolve which agent CLI runs a Dispatch job.
 *
 * Priority:
 * 1. `configure` setting (`config.workerBackend`) — explicit override
 * 2. `PRISM_WORKER` env var
 * 3. MCP `clientInfo.name` → registry lookup → use matched agent
 * 4. `clientLooksLikeClaude` fallback (backward compat)
 * 5. Default: "cursor"
 */
export function resolveWorkerBackend(input: {
  readonly config?:
    | { readonly workerBackend?: WorkerBackendSetting }
    | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly clientName?: string | undefined;
  readonly registry?: AgentRegistry | undefined;
}): WorkerBackend {
  // Priority 1: explicit config
  const configured = input.config?.workerBackend;
  if (configured && configured !== "auto") {
    // Validate against registry if available, otherwise accept raw string
    if (input.registry?.has(configured)) return configured;
    // Accept even if not in registry — user may know what they're doing
    return configured;
  }

  // Priority 2: PRISM_WORKER env
  const fromEnv = (input.env?.PRISM_WORKER ?? "").trim().toLowerCase();
  if (fromEnv) {
    if (input.registry?.has(fromEnv)) return fromEnv;
    // Accept raw env value even if not in registry
    if (fromEnv === "claude" || fromEnv === "cursor") return fromEnv;
  }

  // Priority 3: MCP client name → registry lookup
  const clientName = input.clientName?.trim().toLowerCase();
  if (clientName && input.registry) {
    // Try exact match first
    const entry = input.registry.get(clientName);
    if (entry) return entry.config.name;

    // Try substring match (e.g., "claude-code-2.1" → "claude")
    for (const name of input.registry.names()) {
      if (clientName.includes(name)) return name;
    }
  }

  // Priority 4: backward-compat substring checks
  if (clientLooksLikeClaude(input.clientName)) return "claude";

  // Priority 5: default
  return "cursor";
}

/**
 * Human-readable label for a backend. Uses registry if available,
 * falls back to known labels.
 */
export function workerBackendLabel(
  backend: WorkerBackend,
  registry?: AgentRegistry,
): string {
  const entry = registry?.get(backend);
  if (entry) return entry.config.label;
  // Fallback for known backends
  if (backend === "claude") return "Claude Code";
  if (backend === "cursor") return "Cursor";
  return backend;
}

/**
 * Whether the backend is a built-in (Cursor or Claude) or a custom agent.
 */
export function isBuiltinBackend(
  backend: WorkerBackend,
  registry?: AgentRegistry,
): boolean {
  const entry = registry?.get(backend);
  if (entry) return entry.config.builtin;
  return backend === "cursor" || backend === "claude";
}
