/**
 * `prism doctor --surfaces` (ADR-0061).
 *
 * Reports which Prism each host will actually launch, so a checkout cannot
 * silently talk to the published package.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SurfaceKind =
  | "workspace-build"
  | "published-npm"
  /** The server or hooks of an npm install (`npm i -g @prismapp/cli`). */
  | "npm-install"
  | "marketplace-extension"
  | "other";

export type SurfaceHit = {
  readonly host: string;
  readonly where: string;
  readonly kind: SurfaceKind;
  readonly detail: string;
};

/** Classify a launch line. Null when the text is not a Prism launch. */
export function classifyLaunch(text: string): SurfaceKind | null {
  if (!/prism|mcp-server\/dist\/bin\.js/i.test(text)) return null;
  if (/node_modules\/@repo-prism\/(?:mcp-server|plugin)\//.test(text))
    return "npm-install";
  if (
    text.includes("@prismapp/mcp-server") ||
    text.includes("@repo-prism/mcp-server")
  ) {
    return "published-npm";
  }
  if (
    text.includes("packages/mcp-server/dist/bin.js") ||
    text.includes("PRISM_MCP_BIN=")
  ) {
    return "workspace-build";
  }
  if (text.includes("prism-hook.mjs")) return "workspace-build";
  return null;
}

export function isPrismSourceRepo(root: string): boolean {
  const manifest = join(root, "packages", "mcp-server", "package.json");
  if (!existsSync(manifest)) return false;
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: string;
    };
    return parsed.name === "@repo-prism/mcp-server";
  } catch {
    return false;
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function mcpServers(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const servers = (value as { mcpServers?: unknown }).mcpServers;
  if (!servers || typeof servers !== "object") return {};
  return servers as Record<string, unknown>;
}

function launchText(entry: unknown): string {
  if (!entry || typeof entry !== "object") return "";
  const row = entry as {
    command?: unknown;
    args?: unknown;
    env?: Record<string, unknown>;
  };
  const args = Array.isArray(row.args) ? row.args.map(String) : [];
  const env = row.env
    ? Object.entries(row.env).map(([key, val]) => `${key}=${String(val)}`)
    : [];
  return [String(row.command ?? ""), ...args, ...env].join(" ");
}

function pushLaunch(
  hits: SurfaceHit[],
  host: string,
  where: string,
  text: string,
): void {
  const kind = classifyLaunch(text);
  if (!kind) return;
  hits.push({ host, where, kind, detail: text.slice(0, 180) });
}

function walkHooks(value: unknown, hits: SurfaceHit[], where: string): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) walkHooks(item, hits, where);
    return;
  }
  const row = value as { command?: unknown; hooks?: unknown };
  if (typeof row.command === "string") {
    pushLaunch(hits, "claude-hooks", where, row.command);
  }
  if (row.hooks) walkHooks(row.hooks, hits, where);
  for (const [key, child] of Object.entries(value)) {
    if (key === "command" || key === "hooks") continue;
    if (child && typeof child === "object") walkHooks(child, hits, where);
  }
}

/** Scan the host configs under `home`. Does not launch anything. */
export function scanSurfaces(home = homedir()): SurfaceHit[] {
  const hits: SurfaceHit[] = [];

  const cursorMcp = join(home, ".cursor", "mcp.json");
  const cursor = readJson(cursorMcp);
  for (const [name, entry] of Object.entries(mcpServers(cursor))) {
    if (!/prism/i.test(name) && !/prism/i.test(launchText(entry))) continue;
    pushLaunch(hits, "cursor", cursorMcp, `${name} ${launchText(entry)}`);
  }

  const claudeJson = join(home, ".claude.json");
  for (const [name, entry] of Object.entries(
    mcpServers(readJson(claudeJson)),
  )) {
    if (!/prism/i.test(name) && !/prism/i.test(launchText(entry))) continue;
    pushLaunch(hits, "claude", claudeJson, `${name} ${launchText(entry)}`);
  }

  const opencodeJson = join(home, ".config", "opencode", "opencode.json");
  const opencode = readJson(opencodeJson) as {
    mcp?: Record<string, { command?: unknown; environment?: unknown }>;
  } | null;
  for (const [name, entry] of Object.entries(opencode?.mcp ?? {})) {
    const command = Array.isArray(entry.command)
      ? entry.command.map(String)
      : [];
    const text = launchText({
      command: command[0],
      args: command.slice(1),
      env: entry.environment,
    });
    if (!/prism/i.test(name) && !/prism/i.test(text)) continue;
    pushLaunch(hits, "opencode", opencodeJson, `${name} ${text}`);
  }

  const codexToml = join(home, ".codex", "config.toml");
  if (existsSync(codexToml)) {
    const section =
      /^\[mcp_servers\.prism\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(
        readFileSync(codexToml, "utf8"),
      );
    if (section?.[1])
      pushLaunch(
        hits,
        "codex",
        codexToml,
        `prism ${section[1].replace(/\s+/g, " ").trim()}`,
      );
  }

  const claudeSettings = join(home, ".claude", "settings.json");
  walkHooks(readJson(claudeSettings), hits, claudeSettings);

  const installed = readJson(
    join(home, ".claude", "plugins", "installed_plugins.json"),
  ) as { plugins?: Record<string, Array<{ installPath?: string }>> } | null;
  for (const [id, rows] of Object.entries(installed?.plugins ?? {})) {
    if (!id.startsWith("prism@")) continue;
    for (const row of rows) {
      if (!row.installPath) continue;
      const mcpPath = join(row.installPath, "mcp.json");
      for (const [name, entry] of Object.entries(
        mcpServers(readJson(mcpPath)),
      )) {
        pushLaunch(
          hits,
          "claude-plugin",
          mcpPath,
          `${name} ${launchText(entry)}`,
        );
      }
    }
  }

  return hits;
}

/**
 * Inside the Prism checkout, a published launch or two Prism servers on one
 * host is a failure. Elsewhere the same published launch is the normal install.
 */
export function surfaceProblems(
  hits: readonly SurfaceHit[],
  prismSource: boolean,
): string[] {
  if (!prismSource) return [];
  const problems: string[] = [];
  for (const hit of hits) {
    if (
      hit.kind === "published-npm" ||
      hit.kind === "npm-install" ||
      hit.kind === "marketplace-extension"
    ) {
      problems.push(`${hit.host} resolves to ${hit.kind} (${hit.where})`);
    }
  }
  const byHost = new Map<string, number>();
  for (const hit of hits) {
    if (
      hit.kind !== "workspace-build" &&
      hit.kind !== "published-npm" &&
      hit.kind !== "npm-install"
    )
      continue;
    if (hit.host === "claude-hooks") continue;
    byHost.set(hit.host, (byHost.get(hit.host) ?? 0) + 1);
  }
  for (const [host, count] of byHost) {
    if (count > 1) problems.push(`${host} has ${count} Prism servers`);
  }
  return problems;
}
