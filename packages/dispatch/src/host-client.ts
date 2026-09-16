/**
 * Which agent window Prism is talking to.
 *
 * Rescued from `connect-ux.ts` when the OAuth stack was deleted (ADR-0049).
 * The connect flow is gone, but "am I inside Cursor or Claude Code" is still
 * a live question — the worker backend picks a different CLI for each
 * (ADR-0044), and the fill contract's wording depends on which connectors the
 * host has.
 *
 * Envelope prefers the MCP handshake name. When that is empty (Cursor often
 * omits it), the editor process env is a second hint — never a security
 * boundary, and never a reason to invent ChatGPT or Codex.
 *
 * M-073: Added model detection from environment variables and clientInfo title.
 */

export type EnvelopeHostSource = "mcp" | "env" | "worker";

export type EnvelopeClientVersion = {
  readonly name?: string;
  readonly version?: string;
  readonly title?: string | undefined;
};

/** Fields written onto an Envelope ledger line when a host can be named. */
export type EnvelopeHostProbe = {
  readonly host?: string;
  readonly clientName?: string;
  readonly clientVersion?: string;
  readonly clientModel?: string;
  readonly hostSource?: EnvelopeHostSource;
};

export function clientLooksLikeCursor(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("cursor");
}

export function clientLooksLikeClaude(name: string | undefined): boolean {
  return (name ?? "").toLowerCase().includes("claude");
}

function clipMeta(value: string | undefined, max: number): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/**
 * Stable Envelope host id written on each ledger line.
 *
 * Substring match, same family as {@link hostClientLabel} in app-shell — kept
 * here so Dispatch never imports presentation. Unknown names are slugified.
 * Empty / missing client info is omitted from the ledger, not stored as
 * `"unknown"`.
 */
export function envelopeHostFromClient(
  name: string | undefined,
): string | undefined {
  const lower = (name ?? "").trim().toLowerCase();
  if (!lower) return undefined;
  if (lower.includes("cursor")) return "cursor";
  if (lower.includes("claude")) return "claude";
  if (
    lower.includes("visual studio") ||
    lower === "vscode" ||
    lower.includes("vs code") ||
    lower.includes("code-oss") ||
    lower.includes("code - oss")
  ) {
    return "vscode";
  }
  if (lower.includes("kilo")) return "kilo";
  if (lower.includes("roo")) return "roo";
  if (lower.includes("codex") || lower.includes("openai")) return "codex";
  if (lower.includes("windsurf") || lower.includes("cascade")) {
    return "windsurf";
  }
  if (lower.includes("continue")) return "continue";
  if (lower.includes("aider")) return "aider";
  if (lower.includes("cline")) return "cline";
  if (lower.includes("gemini")) return "gemini";
  if (lower.includes("zed")) return "zed";
  if (lower === "console" || lower.includes("dispatch-hub")) return "console";
  const slug = lower.replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "");
  return slug ? slug.slice(0, 40) : undefined;
}

function envFlag(env: NodeJS.ProcessEnv, key: string): boolean {
  const value = (env[key] ?? "").trim();
  return value.length > 0 && value !== "0" && value.toLowerCase() !== "false";
}

function ipcLooksLikeCursor(env: NodeJS.ProcessEnv): boolean {
  const hook =
    `${env.VSCODE_IPC_HOOK ?? ""}\n${env.VSCODE_IPC_HOOK_CLI ?? ""}`.toLowerCase();
  return hook.includes("cursor");
}

/**
 * Detect the model name from environment variables or clientInfo title.
 *
 * Models are typically set via env vars by agents:
 * - ANTHROPIC_MODEL (Claude agents)
 * - OPENAI_MODEL (OpenAI agents)
 * - GEMINI_MODEL (Google agents)
 *
 * Falls back to parsing parenthetical model from clientInfo title
 * (e.g., "OpenCode (gpt-4o)" → "gpt-4o").
 */
export function detectModel(
  env: NodeJS.ProcessEnv = process.env,
  clientTitle?: string,
): string | undefined {
  // Try well-known env vars
  const envModel =
    env.ANTHROPIC_MODEL?.trim() ||
    env.OPENAI_MODEL?.trim() ||
    env.GEMINI_MODEL?.trim() ||
    env.AZURE_OPENAI_MODEL?.trim() ||
    env.OLLAMA_MODEL?.trim();
  if (envModel) return envModel;

  // Try parsing model from clientInfo title: "AgentName (model-name)"
  if (clientTitle) {
    const match = clientTitle.match(/\(([^)]+)\)/);
    if (match?.[1]) return match[1].trim();
  }

  return undefined;
}

/**
 * Editor fingerprint from the MCP process env. Values are never stored —
 * only a host id. Claude wins when both fingerprints are present (a Claude
 * CLI nested under Cursor).
 */
export function envelopeHostFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (
    envFlag(env, "CLAUDECODE") ||
    envFlag(env, "CLAUDE_CODE") ||
    envFlag(env, "CLAUDE_CODE_ENTRYPOINT")
  ) {
    return "claude";
  }
  if (
    envFlag(env, "CURSOR_TRACE_ID") ||
    envFlag(env, "CURSOR_AGENT") ||
    envFlag(env, "CURSOR_WORKSPACE") ||
    ipcLooksLikeCursor(env)
  ) {
    return "cursor";
  }
  if (
    envFlag(env, "VSCODE_IPC_HOOK") ||
    envFlag(env, "VSCODE_PID") ||
    (env.TERM_PROGRAM ?? "").trim().toLowerCase() === "vscode"
  ) {
    return "vscode";
  }
  return undefined;
}

function clientOf(client: EnvelopeClientVersion | string | undefined): {
  name?: string;
  version?: string;
  title?: string;
} {
  if (typeof client === "string") return { name: client };
  if (!client) return {};
  return {
    ...(client.name ? { name: client.name } : {}),
    ...(client.version ? { version: client.version } : {}),
    ...(client.title ? { title: client.title } : {}),
  };
}

/**
 * Host + raw client meta for one Envelope write.
 *
 * Order: MCP handshake name, then a Dispatch worker backend, then the
 * process env. Raw `clientName` / `clientVersion` are stored whenever the
 * handshake sent them, even if the canonical host is still missing.
 *
 * M-073: Also detects and returns the model name.
 */
export function envelopeHostProbe(input: {
  readonly client?: EnvelopeClientVersion | string | undefined;
  readonly env?: NodeJS.ProcessEnv;
  readonly workerHost?: string;
}): EnvelopeHostProbe {
  const { name, version, title } = clientOf(input.client);
  const clientName = clipMeta(name, 80);
  const clientVersion = clipMeta(version, 40);
  const meta = {
    ...(clientName ? { clientName } : {}),
    ...(clientVersion ? { clientVersion } : {}),
  };
  // M-073: detect model from env or title
  const env = input.env ?? process.env;
  const clientModel = detectModel(env, title);
  const metaWithModel = {
    ...meta,
    ...(clientModel ? { clientModel } : {}),
  };
  const fromMcp = envelopeHostFromClient(name);
  if (fromMcp) {
    return { host: fromMcp, hostSource: "mcp", ...metaWithModel };
  }
  const worker = input.workerHost?.trim().toLowerCase().slice(0, 40);
  if (worker) {
    return { host: worker, hostSource: "worker", ...metaWithModel };
  }
  const fromEnv = envelopeHostFromEnv(env);
  if (fromEnv) {
    return { host: fromEnv, hostSource: "env", ...metaWithModel };
  }
  return metaWithModel;
}
