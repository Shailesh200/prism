import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * What the agent window already has connected (ADR-0049).
 *
 * Prism used to run its own OAuth for six vendors so `start_my_day` could fill
 * a briefing. The host agent already has those connectors, authenticated once
 * by the user against the vendor's own app. This module finds out which, so
 * Prism can ask the host to fill a section instead of fetching it.
 *
 * **This reads manifests. It never reads a token, a secret, or an OAuth client
 * secret, and it never opens a network connection.** ADR-0036 rejected reading
 * another MCP's credentials; that is still rejected and is not what this does.
 * Knowing a plugin is *signed in* (real tools, not just `mcp_auth`) is the
 * same fact the user sees when the vendor's tools actually appear in chat.
 * A download sitting in Cursor's plugin cache is not a connection.
 */

export type HostKind = "cursor" | "claude";

export type HostConnector = {
  /** The plugin or server name, as the host knows it. */
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  /** Which host it was found in. A connector can be in both. */
  readonly hosts: readonly HostKind[];
  /** Skill directory names shipped with the plugin, if any. */
  readonly skills: readonly string[];
  /** `http`, `sse`, `stdio`, or undefined when no MCP server is declared. */
  readonly transport?: string;
  /** Where it was found. Useful for "why does Prism think this is here". */
  readonly source: string;
};

export type HostDiscovery = {
  readonly connectors: readonly HostConnector[];
  /** Places that exist but could not be read, so a gap is explainable. */
  readonly unreadable: readonly { path: string; detail: string }[];
};

export type DiscoveryDeps = {
  readonly home?: string;
  readonly workspaceRoot?: string;
  readonly readFileImpl?: (path: string) => Promise<string>;
  readonly readDirImpl?: (path: string) => Promise<string[]>;
};

type Manifest = {
  name?: unknown;
  description?: unknown;
  skills?: unknown;
  mcpServers?: unknown;
};

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn a plugin id into something worth reading in a briefing.
 *
 * `google-calendar` becomes `Google Calendar`. Not clever — but the alternative
 * is a UI that shows kebab-case slugs where it means to show product names.
 */
export function labelFor(id: string): string {
  const known: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    "google-calendar": "Google Calendar",
    jira: "Jira",
    mcp: "MCP",
    npm: "npm",
    pagerduty: "PagerDuty",
  };
  if (known[id]) return known[id];
  return id
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => known[part] ?? part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export const HOST_VENDORS = [
  "slack",
  "github",
  "notion",
  "calendar",
  "linear",
  "jira",
] as const;

export type HostVendor = (typeof HOST_VENDORS)[number];

const VENDOR_NEEDLES: Record<HostVendor, readonly string[]> = {
  slack: ["slack"],
  github: ["github"],
  notion: ["notion"],
  calendar: ["calendar"],
  linear: ["linear"],
  jira: ["jira"],
};

/**
 * Whether discovery found a host plugin for this vendor.
 *
 * Used to hide Dispatch settings that would only hallucinate a briefing
 * section the presenting agent cannot fill.
 */
export function connectorCovers(
  connectors: readonly { id: string; label: string }[],
  vendor: HostVendor,
): boolean {
  const needles = VENDOR_NEEDLES[vendor];
  return connectors.some((row) => {
    const hay = `${row.id} ${row.label}`.toLowerCase();
    return needles.some((needle) => hay.includes(needle));
  });
}

export function vendorCoverage(
  connectors: readonly { id: string; label: string }[],
): Record<HostVendor, boolean> {
  return {
    slack: connectorCovers(connectors, "slack"),
    github: connectorCovers(connectors, "github"),
    notion: connectorCovers(connectors, "notion"),
    calendar: connectorCovers(connectors, "calendar"),
    linear: connectorCovers(connectors, "linear"),
    jira: connectorCovers(connectors, "jira"),
  };
}

/**
 * The transport an MCP server entry declares, without touching its auth.
 *
 * Both spellings are in the wild on this machine: Slack writes `"type":
 * "http"`, Linear writes `"transport": "http"`.
 */
export function transportOf(entry: unknown): string | undefined {
  if (!isRecord(entry)) return undefined;
  const declared = str(entry.type) ?? str(entry.transport);
  if (declared) return declared;
  if (str(entry.url)) return "http";
  if (str(entry.command)) return "stdio";
  return undefined;
}

/**
 * Pull server entries out of an MCP config file.
 *
 * Two shapes ship today: wrapped (`{ "mcpServers": { … } }`, what Slack and
 * the host-level configs use) and bare (`{ "linear": { … } }`, what the Linear
 * plugin ships). Guessing only one would silently report half the connectors
 * on this machine as having no transport.
 */
export function serverEntriesOf(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return {};
  if (isRecord(raw.mcpServers)) return raw.mcpServers;
  // A bare map: every value must itself look like a server entry, otherwise
  // this is some other JSON file that happens to sit next to a manifest.
  const values = Object.values(raw);
  if (values.length > 0 && values.every((value) => transportOf(value))) {
    return raw;
  }
  return {};
}

/**
 * Merge two sightings of the same connector.
 *
 * A plugin installed for both Cursor and Claude is one connector the user can
 * use, not two — listing it twice would overstate what they have.
 */
function merge(a: HostConnector, b: HostConnector): HostConnector {
  const hosts = [...new Set([...a.hosts, ...b.hosts])];
  const skills = [...new Set([...a.skills, ...b.skills])];
  return {
    ...a,
    hosts,
    skills,
    ...((a.description ?? b.description)
      ? { description: a.description ?? b.description }
      : {}),
    ...((a.transport ?? b.transport)
      ? { transport: a.transport ?? b.transport }
      : {}),
  };
}

export async function discoverHostConnectors(
  deps: DiscoveryDeps = {},
): Promise<HostDiscovery> {
  const home = deps.home ?? homedir();
  const readFileImpl =
    deps.readFileImpl ?? ((path: string) => readFile(path, "utf8"));
  const readDirImpl = deps.readDirImpl ?? ((path: string) => readdir(path));

  const found = new Map<string, HostConnector>();
  const unreadable: { path: string; detail: string }[] = [];

  const add = (connector: HostConnector): void => {
    const existing = found.get(connector.id);
    found.set(connector.id, existing ? merge(existing, connector) : connector);
  };

  // A missing path is the normal case — a machine with no Claude install has
  // no Claude config. Only a path that exists and will not parse is reported.
  const readJson = async (path: string): Promise<unknown | undefined> => {
    let raw: string;
    try {
      raw = await readFileImpl(path);
    } catch {
      return undefined;
    }
    try {
      return JSON.parse(raw);
    } catch (cause) {
      unreadable.push({
        path,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
      return undefined;
    }
  };

  const listDir = async (path: string): Promise<string[]> => {
    try {
      return await readDirImpl(path);
    } catch {
      return [];
    }
  };

  await collectCursorSessionMcps({
    home,
    ...(deps.workspaceRoot ? { workspaceRoot: deps.workspaceRoot } : {}),
    add,
    listDir,
    readJson,
  });
  await collectMcpConfig({
    path: join(home, ".cursor", "mcp.json"),
    host: "cursor",
    add,
    readJson,
  });
  await collectMcpConfig({
    path: join(home, ".claude.json"),
    host: "claude",
    add,
    readJson,
  });
  if (deps.workspaceRoot) {
    await collectMcpConfig({
      path: join(deps.workspaceRoot, ".cursor", "mcp.json"),
      host: "cursor",
      add,
      readJson,
    });
    await collectMcpConfig({
      path: join(deps.workspaceRoot, ".mcp.json"),
      host: "claude",
      add,
      readJson,
    });
  }
  await collectClaudePlugins({ home, add, listDir, readJson });

  return {
    connectors: [...found.values()].sort((a, b) =>
      a.label.localeCompare(b.label),
    ),
    unreadable,
  };
}

type Collect = {
  home: string;
  workspaceRoot?: string;
  add: (connector: HostConnector) => void;
  listDir: (path: string) => Promise<string[]>;
  readJson: (path: string) => Promise<unknown | undefined>;
};

function isPrismOrHostBuiltin(name: string): boolean {
  return (
    name === "prism" ||
    name.startsWith("prism-") ||
    name === "user-prism" ||
    name.startsWith("cursor-app-") ||
    name.startsWith("cursor-ide-")
  );
}

/**
 * Cursor's on-disk name for a workspace under `~/.cursor/projects/`.
 *
 * `/Users/me/Prism` becomes `Users-me-Prism`. `@` in a path is also a hyphen.
 */
export function cursorProjectSlug(workspaceRoot: string): string {
  return workspaceRoot
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/[@/]/g, "-");
}

/**
 * MCP servers Cursor actually loaded for this workspace.
 *
 * `~/.cursor/plugins/cache` is a download cache — Slack can sit there without
 * ever being signed in. The live session writes `mcps/<id>/tools`. If the only
 * tool is `mcp_auth`, the plugin is present but not connected.
 */
async function collectCursorSessionMcps(ctx: Collect): Promise<void> {
  if (!ctx.workspaceRoot) return;
  const root = join(
    ctx.home,
    ".cursor",
    "projects",
    cursorProjectSlug(ctx.workspaceRoot),
    "mcps",
  );
  for (const name of await ctx.listDir(root)) {
    if (isPrismOrHostBuiltin(name)) continue;
    const dir = join(root, name);
    const tools = (await ctx.listDir(join(dir, "tools"))).filter((file) =>
      file.endsWith(".json"),
    );
    const usable = tools.filter((file) => file !== "mcp_auth.json");
    if (usable.length === 0) continue;
    const meta = await ctx.readJson(join(dir, "SERVER_METADATA.json"));
    const id =
      (isRecord(meta) ? str(meta.serverName) : undefined) ??
      name.replace(/^plugin-/, "");
    ctx.add({
      id,
      label: labelFor(id),
      hosts: ["cursor"],
      skills: [],
      source: dir,
    });
  }
}

/**
 * A host config file listing MCP servers directly.
 *
 * Prism's own entry is skipped: reporting "you have Prism connected" back to
 * Prism is noise, and it would show up in a Host Connectors list as if it were
 * something the user could compose with.
 */
async function collectMcpConfig(input: {
  path: string;
  host: HostKind;
  add: (connector: HostConnector) => void;
  readJson: (path: string) => Promise<unknown | undefined>;
}): Promise<void> {
  const raw = await input.readJson(input.path);
  for (const [name, entry] of Object.entries(serverEntriesOf(raw))) {
    if (isPrismOrHostBuiltin(name)) continue;
    const transport = transportOf(entry);
    input.add({
      id: name,
      label: labelFor(name),
      hosts: [input.host],
      skills: [],
      ...(transport ? { transport } : {}),
      source: input.path,
    });
  }
}

/** `~/.claude/plugins/<name>/.claude-plugin/plugin.json`. */
async function collectClaudePlugins(ctx: Collect): Promise<void> {
  const root = join(ctx.home, ".claude", "plugins");
  for (const name of await ctx.listDir(root)) {
    if (name === "marketplaces") continue;
    const dir = join(root, name);
    const raw = await ctx.readJson(join(dir, ".claude-plugin", "plugin.json"));
    if (!isRecord(raw)) continue;
    const manifest = raw as Manifest;
    const id = str(manifest.name) ?? name;
    ctx.add({
      id,
      label: labelFor(id),
      ...(str(manifest.description)
        ? { description: str(manifest.description)! }
        : {}),
      hosts: ["claude"],
      skills: await ctx.listDir(join(dir, "skills")),
      source: dir,
    });
  }
}
