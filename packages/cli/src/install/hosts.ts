/**
 * Per-host config writers for `prism install` (plan §2.1, §5.10).
 *
 * Every write is atomic (temp file + rename) and recorded as an
 * `InstallFile`, so `prism uninstall` removes exactly what install added:
 * a JSON key, a managed text block, or a whole file/folder Prism created.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export const INSTALL_HOSTS = ["claude", "cursor", "codex", "opencode"] as const;
export type InstallHost = (typeof INSTALL_HOSTS)[number];
export type InstallScope = "user" | "project";

export type InstallFile =
  | {
      readonly kind: "json-key";
      readonly path: string;
      readonly key: readonly string[];
    }
  | { readonly kind: "claude-hooks"; readonly path: string }
  | {
      readonly kind: "block";
      readonly path: string;
      readonly marker: "md" | "toml";
    }
  | { readonly kind: "file"; readonly path: string };

export type InstallTarget = {
  readonly host: InstallHost;
  readonly scope: InstallScope;
  /** User home (the `HOME` the agents read). */
  readonly home: string;
  /** Repository root for `--project`, and for project-only files. */
  readonly root: string;
  readonly node: string;
  /** Absolute path of the `prism-mcp` entry (`dist/bin.js`). */
  readonly bin: string;
  /** Built plugin pack (hooks + skills). */
  readonly pack: string;
};

export type HostResult = {
  readonly files: InstallFile[];
  readonly notes: string[];
};

/** The rule line Cursor and Codex rely on (§5.10). */
export const RULE_TEXT = [
  "Before editing, call `prepare_change` with the task.",
  "Before you say a coding task is done, call the Prism `receipt` tool and report its verdict in one line.",
].join("\n");

const MD_BEGIN =
  "<!-- prism:begin (managed by `prism install`; edit outside this block) -->";
const MD_END = "<!-- prism:end -->";
const TOML_BEGIN = "# prism:begin (managed by `prism install`)";
const TOML_END = "# prism:end";

export function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.prism-${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const text = readFileSync(path, "utf8");
  if (text.trim() === "") return {};
  const raw = JSON.parse(text) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${path} is not a JSON object`);
  return raw as Record<string, unknown>;
}

export function setJsonKey(
  path: string,
  key: readonly string[],
  value: unknown,
): void {
  const root = readJsonObject(path);
  let cursor: Record<string, unknown> = root;
  for (const part of key.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== "object" || Array.isArray(next))
      cursor[part] = {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[key[key.length - 1] as string] = value;
  atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
}

export function deleteJsonKey(path: string, key: readonly string[]): boolean {
  if (!existsSync(path)) return false;
  const root = readJsonObject(path);
  let cursor: Record<string, unknown> | undefined = root;
  for (const part of key.slice(0, -1)) {
    const next: unknown = cursor?.[part];
    cursor =
      next && typeof next === "object"
        ? (next as Record<string, unknown>)
        : undefined;
  }
  const last = key[key.length - 1] as string;
  if (!cursor || !(last in cursor)) return false;
  delete cursor[last];
  atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
  return true;
}

function markers(kind: "md" | "toml"): [string, string] {
  return kind === "md" ? [MD_BEGIN, MD_END] : [TOML_BEGIN, TOML_END];
}

export function blockHash(body: string): string {
  return createHash("sha256").update(body.trim()).digest("hex").slice(0, 12);
}

/** Text between the markers, or undefined when the block is absent. */
export function readBlock(
  path: string,
  kind: "md" | "toml",
): string | undefined {
  if (!existsSync(path)) return undefined;
  const [begin, end] = markers(kind);
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < start) return undefined;
  return text.slice(start + begin.length, stop).trim();
}

export function writeBlock(
  path: string,
  kind: "md" | "toml",
  body: string,
): void {
  const [begin, end] = markers(kind);
  const block = `${begin}\n${body.trim()}\n${end}`;
  const text = existsSync(path) ? readFileSync(path, "utf8") : "";
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  const next =
    start >= 0 && stop > start
      ? `${text.slice(0, start)}${block}${text.slice(stop + end.length)}`
      : `${text}${text === "" || text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n"}${block}\n`;
  atomicWrite(path, next);
}

/** Removes the block; deletes the file when nothing else is left. */
export function removeBlock(path: string, kind: "md" | "toml"): boolean {
  if (!existsSync(path)) return false;
  const [begin, end] = markers(kind);
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < start) return false;
  const rest = `${text.slice(0, start).replace(/\n+$/, "\n")}${text.slice(stop + end.length).replace(/^\n+/, "")}`;
  if (rest.trim() === "") rmSync(path, { force: true });
  else atomicWrite(path, rest);
  return true;
}

const PRISM_HOOK = "prism-hook.mjs";

type HookEntry = { matcher?: string; hooks: Record<string, unknown>[] };

function stripPrismHooks(value: unknown): Record<string, HookEntry[]> {
  const out: Record<string, HookEntry[]> = {};
  if (!value || typeof value !== "object") return out;
  for (const [event, entries] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!Array.isArray(entries)) continue;
    const kept = entries
      .map((entry: HookEntry) => ({
        ...entry,
        hooks: (entry.hooks ?? []).filter(
          (hook) =>
            !(
              typeof hook.command === "string" &&
              hook.command.includes(PRISM_HOOK)
            ),
        ),
      }))
      .filter((entry) => entry.hooks.length > 0);
    if (kept.length > 0) out[event] = kept;
  }
  return out;
}

export function removeClaudeHooks(path: string): boolean {
  if (!existsSync(path)) return false;
  const settings = readJsonObject(path);
  if (!settings.hooks) return false;
  const hooks = stripPrismHooks(settings.hooks);
  if (Object.keys(hooks).length > 0) settings.hooks = hooks;
  else delete settings.hooks;
  atomicWrite(path, `${JSON.stringify(settings, null, 2)}\n`);
  return true;
}

function quote(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

function mcpEntry(target: InstallTarget) {
  return {
    command: target.node,
    args: [target.bin],
    env: { NODE_USE_SYSTEM_CA: "1", PRISM_MCP_BIN: target.bin },
  };
}

function copySkills(target: InstallTarget, dest: string): InstallFile[] {
  const source = join(target.pack, "skills");
  if (!existsSync(source)) return [];
  const files: InstallFile[] = [];
  for (const name of readdirSync(source)) {
    const to = join(dest, name);
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(source, name), to, { recursive: true });
    files.push({ kind: "file", path: to });
  }
  return files;
}

function claude(target: InstallTarget): HostResult {
  const base =
    target.scope === "user"
      ? join(target.home, ".claude")
      : join(target.root, ".claude");
  const mcpPath =
    target.scope === "user"
      ? join(target.home, ".claude.json")
      : join(target.root, ".mcp.json");
  setJsonKey(mcpPath, ["mcpServers", "prism"], mcpEntry(target));
  const hook = join(target.pack, "hooks", PRISM_HOOK);
  const command = (name: string, timeout: number) => ({
    type: "command",
    command: `${quote(target.node)} ${quote(hook)} ${name}`,
    timeout,
  });
  const settingsPath = join(base, "settings.json");
  const settings = readJsonObject(settingsPath);
  const hooks = stripPrismHooks(settings.hooks);
  const add = (event: string, entry: HookEntry) => {
    hooks[event] = [...(hooks[event] ?? []), entry];
  };
  add("SessionStart", { hooks: [command("session", 5)] });
  add("UserPromptSubmit", { hooks: [command("prompt", 8)] });
  add("PreToolUse", {
    matcher: "Write|Edit|NotebookEdit",
    hooks: [command("before-edit", 5)],
  });
  add("PostToolUse", {
    matcher: "Write|Edit|NotebookEdit",
    hooks: [command("after-edit", 5)],
  });
  add("Stop", { hooks: [command("stop", 120)] });
  settings.hooks = hooks;
  atomicWrite(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return {
    files: [
      { kind: "json-key", path: mcpPath, key: ["mcpServers", "prism"] },
      { kind: "claude-hooks", path: settingsPath },
      ...copySkills(target, join(base, "skills")),
    ],
    notes: [],
  };
}

function cursor(target: InstallTarget): HostResult {
  const mcpPath =
    target.scope === "user"
      ? join(target.home, ".cursor", "mcp.json")
      : join(target.root, ".cursor", "mcp.json");
  setJsonKey(mcpPath, ["mcpServers", "prism"], mcpEntry(target));
  const files: InstallFile[] = [
    { kind: "json-key", path: mcpPath, key: ["mcpServers", "prism"] },
  ];
  const notes: string[] = [];
  if (target.scope === "project") {
    const rule = join(target.root, ".cursor", "rules", "prism.mdc");
    atomicWrite(rule, cursorRule());
    files.push({ kind: "file", path: rule });
  } else {
    notes.push(
      "Cursor reads rules per repository: run `prism install cursor --project` in each repository to add the prepare/receipt rule.",
    );
  }
  return { files, notes };
}

export function cursorRule(): string {
  return `---\ndescription: Prism prepare and receipt\nalwaysApply: true\n---\n${MD_BEGIN}\n${RULE_TEXT}\n${MD_END}\n`;
}

function codex(target: InstallTarget): HostResult {
  const config = join(target.home, ".codex", "config.toml");
  const toml = [
    "[mcp_servers.prism]",
    `command = ${JSON.stringify(target.node)}`,
    `args = [${JSON.stringify(target.bin)}]`,
    "",
    "[mcp_servers.prism.env]",
    'NODE_USE_SYSTEM_CA = "1"',
    `PRISM_MCP_BIN = ${JSON.stringify(target.bin)}`,
  ].join("\n");
  writeBlock(config, "toml", toml);
  const agents =
    target.scope === "user"
      ? join(target.home, ".codex", "AGENTS.md")
      : join(target.root, "AGENTS.md");
  writeBlock(agents, "md", RULE_TEXT);
  return {
    files: [
      { kind: "block", path: config, marker: "toml" },
      { kind: "block", path: agents, marker: "md" },
    ],
    notes: [],
  };
}

/** opencode loads local plugins from its plugins folder (opencode.ai/docs/plugins). */
export function opencodeShim(
  target: Pick<InstallTarget, "node" | "pack">,
): string {
  const hook = join(target.pack, "hooks", PRISM_HOOK);
  return `// Managed by \`prism install opencode\`. Runs the Prism hook for opencode events.
import { spawnSync } from "node:child_process";

const NODE = ${JSON.stringify(target.node)};
const HOOK = ${JSON.stringify(hook)};
const EDIT_TOOLS = new Set(["edit", "write", "patch", "multiedit"]);

function run(event, payload) {
  const result = spawnSync(NODE, [HOOK, event], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: event === "stop" ? 120000 : 8000,
  });
  if (result.status !== 0 || !result.stdout.trim()) return {};
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { text: result.stdout.trim() };
  }
}

export const Prism = async ({ directory, client }) => {
  const base = (sessionID) => ({ session_id: sessionID ?? "opencode", cwd: directory });
  return {
    "tool.execute.before": async (input, output) => {
      if (!EDIT_TOOLS.has(input.tool)) return;
      const file = output.args?.filePath ?? output.args?.file_path;
      if (typeof file !== "string") return;
      const out = run("before-edit", { ...base(input.sessionID), hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: file } });
      const decision = out.hookSpecificOutput;
      if (decision?.permissionDecision === "deny") throw new Error(decision.permissionDecisionReason ?? "Prism: edit blocked");
    },
    "tool.execute.after": async (input, output) => {
      if (!EDIT_TOOLS.has(input.tool)) return;
      const file = output?.metadata?.filepath ?? output?.args?.filePath;
      if (typeof file !== "string") return;
      run("after-edit", { ...base(input.sessionID), hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: file } });
    },
    event: async ({ event }) => {
      const sessionID = event.properties?.sessionID ?? event.properties?.info?.id;
      if (event.type === "session.created") run("session", { ...base(sessionID), hook_event_name: "SessionStart" });
      if (event.type === "session.idle") {
        const out = run("stop", { ...base(sessionID), hook_event_name: "Stop" });
        const text = out.systemMessage ?? out.reason ?? out.text;
        if (text) await client.app.log({ body: { service: "prism", level: "info", message: String(text) } });
      }
    },
  };
};
`;
}

function opencode(target: InstallTarget): HostResult {
  const configDir = join(target.home, ".config", "opencode");
  const configPath =
    target.scope === "user"
      ? join(configDir, "opencode.json")
      : join(target.root, "opencode.json");
  setJsonKey(configPath, ["mcp", "prism"], {
    type: "local",
    command: [target.node, target.bin],
    enabled: true,
    environment: { NODE_USE_SYSTEM_CA: "1", PRISM_MCP_BIN: target.bin },
  });
  const pluginPath =
    target.scope === "user"
      ? join(configDir, "plugins", "prism.js")
      : join(target.root, ".opencode", "plugins", "prism.js");
  atomicWrite(pluginPath, opencodeShim(target));
  const agents =
    target.scope === "user"
      ? join(configDir, "AGENTS.md")
      : join(target.root, "AGENTS.md");
  writeBlock(agents, "md", RULE_TEXT);
  return {
    files: [
      { kind: "json-key", path: configPath, key: ["mcp", "prism"] },
      { kind: "file", path: pluginPath },
      { kind: "block", path: agents, marker: "md" },
    ],
    notes: [],
  };
}

export function installHost(target: InstallTarget): HostResult {
  switch (target.host) {
    case "claude":
      return claude(target);
    case "cursor":
      return cursor(target);
    case "codex":
      return codex(target);
    case "opencode":
      return opencode(target);
  }
}

/** Removes one recorded install file. Returns true when something changed. */
export function removeInstallFile(file: InstallFile): boolean {
  switch (file.kind) {
    case "json-key":
      return deleteJsonKey(file.path, file.key);
    case "claude-hooks":
      return removeClaudeHooks(file.path);
    case "block":
      return removeBlock(file.path, file.marker);
    case "file": {
      if (!existsSync(file.path)) return false;
      rmSync(file.path, { recursive: true, force: true });
      return true;
    }
  }
}
