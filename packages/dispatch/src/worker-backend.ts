/**
 * Which agent CLI runs a Dispatch job (ADR-0044).
 *
 * The supervisor — worktree, console log, stall detection, Prism-side commit
 * and checks, review-before-land — is backend-neutral. Only the child that
 * drives an agent differs: Cursor SDK (`worker-child`) or Claude Code CLI
 * (`claude-worker-child`). Resolution order: `configure` → `PRISM_WORKER` →
 * the MCP client's own name → Cursor (the pre-M-065 default).
 */

import { clientLooksLikeClaude } from "./connect-ux.js";
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

export function resolveWorkerBackend(input: {
  readonly config?:
    | { readonly workerBackend?: WorkerBackendSetting }
    | undefined;
  readonly env?: NodeJS.ProcessEnv | undefined;
  readonly clientName?: string | undefined;
}): WorkerBackend {
  const configured = input.config?.workerBackend;
  if (configured === "cursor" || configured === "claude") return configured;
  const fromEnv = (input.env?.PRISM_WORKER ?? "").trim().toLowerCase();
  if (fromEnv === "claude" || fromEnv === "cursor") return fromEnv;
  if (clientLooksLikeClaude(input.clientName)) return "claude";
  return "cursor";
}

export function workerBackendLabel(backend: WorkerBackend): string {
  return backend === "claude" ? "Claude Code" : "Cursor";
}
