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
  readlinkSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  loadUserConfigSync,
  userConfigPath,
} from "@repo-prism/shared/user-config";
import { lstatOrUndefined } from "./backups.js";
import { keptUserConfig } from "./wipe.js";
import {
  mergeClaudeHooks,
  PRISM_HOOK_FILE,
  stripPrismHooks,
} from "@repo-prism/shared/hook-config";

export const INSTALL_HOSTS = ["claude", "cursor", "codex", "opencode"] as const;
export type InstallHost = (typeof INSTALL_HOSTS)[number];
export type InstallScope = "user" | "project";

/** Where each host keeps its user config. Present means the host is installed (plan P19). */
const HOST_MARKERS: Record<InstallHost, readonly string[]> = {
  claude: [".claude", ".claude.json"],
  cursor: [".cursor"],
  codex: [".codex"],
  opencode: [join(".config", "opencode")],
};

/** The coding agents set up on this machine, in INSTALL_HOSTS order. */
export function detectHosts(home: string): InstallHost[] {
  return INSTALL_HOSTS.filter((host) =>
    HOST_MARKERS[host].some((marker) => existsSync(join(home, marker))),
  );
}

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
  /**
   * Where Prism's own `config.json` lives (`PRISM_HOME`). Every host Prism
   * sets up turns the `receipt` tool on there (Arc, PR 1). Omitted only by
   * tests and benches that do not want it.
   */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * Planning while a 1.x home is still to be moved first (`runInstall` runs
   * `wipe1x` before any host): the receipt write is planned against the kept
   * keys, never the 1.x `config.json` (Scout QA).
   */
  readonly afterWipe?: boolean;
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

/**
 * One planned change from a dry pass of the host writers: a file whose
 * content would change, or a skill folder that differs from the pack.
 */
export type PlannedWrite = {
  readonly path: string;
  readonly kind: "file" | "dir";
  /** It exists now (a dangling link counts), so a real run backs it up first. */
  readonly exists: boolean;
  /** `path` is a symlink: the write goes through to this file (Arc review). */
  readonly linkTo?: string;
};

/**
 * Plan mode (`prism start` consent): while set, the writers below record what
 * they would change instead of changing it, and later reads see the earlier
 * planned text. Real code paths, no second copy of the per-host rules.
 *
 * A module global (Arc review): safe only while every writer is synchronous.
 * `planWrites` throws if `fn` returns a promise, so a writer that turns async
 * cannot write for real during a dry run once `planning` has been reset.
 */
let planning: Map<string, { text?: string; write: PlannedWrite }> | null = null;

/** Run `fn` with every write recorded, not made; returns the changes. */
export function planWrites(fn: () => void): PlannedWrite[] {
  const previous = planning;
  planning = new Map();
  try {
    const result: unknown = fn();
    if (result && typeof (result as { then?: unknown }).then === "function")
      throw new Error(
        "planWrites needs synchronous writers (plan mode is a module global)",
      );
    return [...planning.values()].map((entry) => entry.write);
  } finally {
    planning = previous;
  }
}

/** File text as the writers see it: planned text first, then the disk. */
function currentText(path: string): string | undefined {
  const planned = planning?.get(path);
  if (planned?.text !== undefined) return planned.text;
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * Where a write to `path` lands (Arc review). A symlinked config (stow,
 * chezmoi) is written through to its target, so the link stays a link; a
 * dangling link writes the file it points at. Otherwise `path` itself.
 */
export function writeTarget(path: string): string {
  const info = lstatOrUndefined(path);
  if (!info?.isSymbolicLink()) return path;
  try {
    return realpathSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return resolve(dirname(path), readlinkSync(path));
  }
}

/** Writes only when the content differs, so a second install touches nothing. */
export function atomicWrite(path: string, text: string): void {
  if (currentText(path) === text) return;
  if (planning) {
    const exists = lstatOrUndefined(path) !== undefined;
    const target = writeTarget(path);
    planning.set(path, {
      text,
      write: {
        path,
        kind: "file",
        exists,
        ...(target !== path ? { linkTo: target } : {}),
      },
    });
    return;
  }
  const target = writeTarget(path);
  mkdirSync(dirname(target), { recursive: true });
  const tmp = `${target}.prism-${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, target);
}

function readJsonObject(path: string): Record<string, unknown> {
  const text = currentText(path);
  if (text === undefined) return {};
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
  const last = key[key.length - 1] as string;
  // Same value already there: leave the user's file (and its formatting) alone.
  if (JSON.stringify(cursor[last]) === JSON.stringify(value)) return;
  cursor[last] = value;
  atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
}

/** Writes the object back; deletes the file when nothing is left in it. */
function writeOrDropJson(path: string, root: Record<string, unknown>): void {
  if (Object.keys(root).length === 0) rmSync(path, { force: true });
  else atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`);
}

export function deleteJsonKey(path: string, key: readonly string[]): boolean {
  if (!existsSync(path)) return false;
  const root = readJsonObject(path);
  const chain: Record<string, unknown>[] = [root];
  for (const part of key.slice(0, -1)) {
    const next: unknown = chain[chain.length - 1]?.[part];
    if (!next || typeof next !== "object") return false;
    chain.push(next as Record<string, unknown>);
  }
  const last = key[key.length - 1] as string;
  const parent = chain[chain.length - 1]!;
  if (!(last in parent)) return false;
  delete parent[last];
  // Drop the parents the key left empty (`mcpServers: {}`), deepest first.
  for (let i = chain.length - 1; i > 0; i -= 1) {
    if (Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![key[i - 1] as string];
  }
  writeOrDropJson(path, root);
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
  const text = currentText(path) ?? "";
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

const PRISM_HOOK = PRISM_HOOK_FILE;

export function removeClaudeHooks(path: string): boolean {
  if (!existsSync(path)) return false;
  const settings = readJsonObject(path);
  if (!settings.hooks) return false;
  const hooks = stripPrismHooks(settings.hooks);
  if (Object.keys(hooks).length > 0) settings.hooks = hooks;
  else delete settings.hooks;
  writeOrDropJson(path, settings);
  return true;
}

function quote(path: string): string {
  return `"${path.replace(/"/g, '\\"')}"`;
}

/** `promptHook`: the host's prompt hook shows the Prism line and lens (Claude). */
function mcpEntry(target: InstallTarget, promptHook = false) {
  return {
    command: target.node,
    args: [target.bin],
    env: {
      NODE_USE_SYSTEM_CA: "1",
      PRISM_MCP_BIN: target.bin,
      ...(promptHook ? { PRISM_PROMPT_HOOK: "1" } : {}),
    },
  };
}

/** Skills earlier packs installed, merged into the one `prism` skill. */
const RETIRED_SKILLS = [
  "prism-review-pr",
  "prism-safe-change",
  "prism-onboard",
  "prism-lens",
  "prism-habits",
];

/** True when both folders hold the same files with the same bytes. */
function sameTree(a: string, b: string): boolean {
  if (!existsSync(b)) return false;
  const list = (dir: string) =>
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name).slice(dir.length))
      .sort();
  const files = list(a);
  const other = list(b);
  return (
    files.length === other.length &&
    files.every(
      (file, i) =>
        file === other[i] &&
        readFileSync(join(a, file)).equals(readFileSync(join(b, file))),
    )
  );
}

function copySkills(target: InstallTarget, dest: string): InstallFile[] {
  const source = join(target.pack, "skills");
  if (!existsSync(source)) return [];
  for (const name of RETIRED_SKILLS) {
    const old = join(dest, name);
    if (planning) {
      if (existsSync(old))
        planning.set(old, { write: { path: old, kind: "dir", exists: true } });
      continue;
    }
    rmSync(old, { recursive: true, force: true });
  }
  const files: InstallFile[] = [];
  for (const name of readdirSync(source)) {
    const to = join(dest, name);
    files.push({ kind: "file", path: to });
    if (sameTree(join(source, name), to)) continue;
    if (planning) {
      planning.set(to, {
        write: { path: to, kind: "dir", exists: existsSync(to) },
      });
      continue;
    }
    rmSync(to, { recursive: true, force: true });
    mkdirSync(dirname(to), { recursive: true });
    cpSync(join(source, name), to, { recursive: true });
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
  setJsonKey(mcpPath, ["mcpServers", "prism"], mcpEntry(target, true));
  const hook = join(target.pack, "hooks", PRISM_HOOK);
  const settingsPath = join(base, "settings.json");
  const settings = readJsonObject(settingsPath);
  // The user's hooks stay; Prism's entries come from the one plan in
  // shared/hook-config, which the session hook also upgrades old installs to.
  const hooks = mergeClaudeHooks(
    settings.hooks,
    `${quote(target.node)} ${quote(hook)}`,
  );
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
  // User scope: no rule file, and no extra note; the per-agent Cursor line
  // (HOST_SETUP_COPY) is the only Cursor line printed (Muse).
  if (target.scope === "project") {
    const rule = join(target.root, ".cursor", "rules", "prism.mdc");
    atomicWrite(rule, cursorRule());
    files.push({ kind: "file", path: rule });
  }
  return { files, notes: [] };
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
      if (event.type === "session.created") run("session", { ...base(sessionID), hook_event_name: "SessionStart", host: "opencode" });
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
  const result = hostWriter(target);
  return { files: result.files, notes: [...result.notes, ...receipt(target)] };
}

function hostWriter(target: InstallTarget): HostResult {
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

export const RECEIPT_NOTE = "Enabled the `receipt` MCP tool (extraTools).";

/** Adds `receipt` to `extraTools` in Prism's config.json; true when it changed it. */
export function enableReceipt(env: NodeJS.ProcessEnv): boolean {
  const loaded = loadUserConfigSync(env);
  if (!loaded.ok) throw new Error(loaded.error.message);
  const tools = loaded.value.extraTools ?? [];
  if (tools.includes("receipt")) return false;
  setJsonKey(userConfigPath(env), ["extraTools"], [...tools, "receipt"]);
  return true;
}

/**
 * The receipt tool, on for every host (Arc, PR 1): a host with no stop hook
 * (Cursor) only gets a verdict when the agent calls `receipt`. One note, from
 * the host that turned it on.
 */
function receipt(target: InstallTarget): string[] {
  if (!target.env) return [];
  if (planning && target.afterWipe) {
    const tools = keptUserConfig(target.env).extraTools;
    if (Array.isArray(tools) && tools.includes("receipt")) return [];
    const path = userConfigPath(target.env);
    if (!planning.has(path))
      planning.set(path, { write: { path, kind: "file", exists: false } });
    return [];
  }
  return enableReceipt(target.env) ? [RECEIPT_NOTE] : [];
}

/** Removes one recorded install file. Returns true when something changed. */
export function removeInstallFile(file: InstallFile): boolean {
  const changed = removeOne(file);
  if (changed && !existsSync(file.path)) pruneEmptyParents(file.path);
  return changed;
}

function removeOne(file: InstallFile): boolean {
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

/**
 * Removes the folders an install left empty above `path` (`.cursor/rules`),
 * stopping at the first folder with anything in it. The home folder and each
 * host's own folder stay: they were there before Prism.
 */
function pruneEmptyParents(path: string): void {
  const home = homedir();
  const keep = new Set([
    home,
    ...Object.values(HOST_MARKERS).flatMap((paths) =>
      paths.map((marker) => join(home, marker)),
    ),
  ]);
  for (let dir = dirname(path); !keep.has(dir); dir = dirname(dir)) {
    if (dir === dirname(dir) || readdirSync(dir).length > 0) return;
    rmdirSync(dir);
  }
}
