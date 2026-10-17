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
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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

/**
 * One thing install added. `created`: the file did not exist before Prism
 * wrote it, so uninstall may delete it once nothing else is left in it.
 * `existingDepth` (json-key): how many leading key segments were already
 * there; uninstall never removes those, even when empty. `hadHooks`
 * (claude-hooks): the settings already had a `hooks` key. Records from
 * before these fields existed are treated as "the user's": only Prism's
 * own entry goes.
 */
export type InstallFile =
  | {
      readonly kind: "json-key";
      readonly path: string;
      readonly key: readonly string[];
      readonly created?: boolean | undefined;
      readonly existingDepth?: number | undefined;
    }
  | {
      readonly kind: "claude-hooks";
      readonly path: string;
      readonly created?: boolean | undefined;
      readonly hadHooks?: boolean | undefined;
    }
  | {
      readonly kind: "block";
      readonly path: string;
      readonly marker: "md" | "toml";
      readonly created?: boolean | undefined;
    }
  | {
      readonly kind: "file";
      readonly path: string;
      readonly created?: boolean | undefined;
    };

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

/** The file's text now, or undefined when it does not exist. */
function textOnDisk(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

/**
 * What a real install run changed, in order, with what was there before, so
 * a failed run can be put back (J-15) and the record can tell Prism's files
 * from the user's (J-16).
 */
export type JournalEntry =
  | { readonly kind: "text"; readonly path: string; readonly before?: string }
  | { readonly kind: "dir"; readonly path: string; readonly existed: boolean }
  | { readonly kind: "mkdir"; readonly path: string };

/** Open journals, outermost first; every write lands in each of them. */
const journals: JournalEntry[][] = [];

function record(entry: JournalEntry): void {
  for (const list of journals) {
    if (
      entry.kind === "text" &&
      list.some((e) => e.kind === "text" && e.path === entry.path)
    )
      continue;
    list.push(entry);
  }
}

function noteText(path: string): void {
  if (journals.length === 0) return;
  record(
    existsSync(path)
      ? { kind: "text", path, before: readFileSync(path, "utf8") }
      : { kind: "text", path },
  );
}

function makeDir(dir: string): void {
  const first = mkdirSync(dir, { recursive: true });
  if (first) record({ kind: "mkdir", path: first });
}

/** Run `fn` with every real write journaled; the journal is returned either way. */
export function withJournal<T>(fn: () => T): {
  readonly journal: JournalEntry[];
  readonly value?: T;
  readonly error?: unknown;
} {
  const entries: JournalEntry[] = [];
  journals.push(entries);
  try {
    return { journal: entries, value: fn() };
  } catch (error) {
    return { journal: entries, error };
  } finally {
    journals.pop();
  }
}

/** Removes `dir` and the folders inside it when they hold no files. */
function removeEmptyTree(dir: string): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) removeEmptyTree(join(dir, entry.name));
  }
  if (readdirSync(dir).length === 0) rmdirSync(dir);
}

/**
 * Undo a journal, newest first: files get their old bytes back, files Prism
 * created are deleted, new folders go when empty. A replaced skill folder
 * (Prism's own) cannot be put back and is reported in `kept`, as is any path
 * that could not be restored.
 */
export function rollBack(entries: readonly JournalEntry[]): {
  readonly restored: string[];
  readonly kept: { readonly path: string; readonly reason: string }[];
} {
  const restored: string[] = [];
  const kept: { path: string; reason: string }[] = [];
  for (const entry of [...entries].reverse()) {
    try {
      if (entry.kind === "text") {
        if (entry.before === undefined) rmSync(entry.path, { force: true });
        else writeFileSync(entry.path, entry.before);
        restored.push(entry.path);
      } else if (entry.kind === "dir") {
        if (entry.existed) {
          kept.push({
            path: entry.path,
            reason: "Prism's skill folder was replaced",
          });
        } else {
          rmSync(entry.path, { recursive: true, force: true });
          restored.push(entry.path);
        }
      } else {
        removeEmptyTree(entry.path);
      }
    } catch (error) {
      kept.push({
        path: entry.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { restored, kept };
}

/** Writes only when the content differs, so a second install touches nothing. */
export function atomicWrite(path: string, text: string): void {
  if (textOnDisk(path) === text) return;
  makeDir(dirname(path));
  noteText(path);
  const tmp = `${path}.prism-${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text);
    renameSync(tmp, path);
  } catch (error) {
    // Never leave `<file>.prism-<pid>.tmp` beside the user's config (J-15).
    rmSync(tmp, { force: true });
    throw error;
  }
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
  const last = key[key.length - 1] as string;
  // Same value already there: leave the user's file (and its formatting) alone.
  if (JSON.stringify(cursor[last]) === JSON.stringify(value)) return;
  cursor[last] = value;
  atomicWrite(path, formatJsonLike(textOnDisk(path), root));
}

/**
 * The object back as text, in the file's own layout: compact stays compact,
 * the indent and the final newline are kept (J-16/J-20: the user's file comes
 * back as it was, minus Prism's entry).
 */
function formatJsonLike(previous: string | undefined, value: unknown): string {
  const text = previous ?? "";
  const newline = text === "" || text.endsWith("\n") ? "\n" : "";
  if (text.trim() !== "" && !text.trim().includes("\n"))
    return `${JSON.stringify(value)}${newline}`;
  const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? 2;
  return `${JSON.stringify(value, null, indent)}${newline}`;
}

/**
 * Writes the object back. The file is deleted only when nothing is left in
 * it and Prism created it (`dropEmptyFile`); a user's file stays, even `{}`.
 */
function writeOrDropJson(
  path: string,
  root: Record<string, unknown>,
  dropEmptyFile = false,
): void {
  if (Object.keys(root).length === 0 && dropEmptyFile)
    rmSync(path, { force: true });
  else atomicWrite(path, formatJsonLike(textOnDisk(path), root));
}

/**
 * Removes `key` and nothing else of the user's. Parents left empty are
 * removed only below `keep` segments (the ones that existed before Prism);
 * the default keeps every parent. The file goes only with `dropEmptyFile`.
 */
export function deleteJsonKey(
  path: string,
  key: readonly string[],
  options: { readonly keep?: number; readonly dropEmptyFile?: boolean } = {},
): boolean {
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
  // Drop the parents Prism made that the key left empty, deepest first; a
  // parent the user had (`mcpServers: {}`) stays (J-16).
  const keep = Math.max(0, options.keep ?? key.length - 1);
  for (let i = chain.length - 1; i > 0; i -= 1) {
    if (i - 1 < keep || Object.keys(chain[i]!).length > 0) break;
    delete chain[i - 1]![key[i - 1] as string];
  }
  writeOrDropJson(path, root, options.dropEmptyFile === true);
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

/**
 * Removes the block. The file is deleted when nothing else is left only if
 * Prism created it (`dropEmptyFile`); otherwise what is left stays.
 */
export function removeBlock(
  path: string,
  kind: "md" | "toml",
  dropEmptyFile = false,
): boolean {
  if (!existsSync(path)) return false;
  const [begin, end] = markers(kind);
  const text = readFileSync(path, "utf8");
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < start) return false;
  const rest = `${text.slice(0, start).replace(/\n+$/, "\n")}${text.slice(stop + end.length).replace(/^\n+/, "")}`;
  if (rest.trim() === "" && dropEmptyFile) rmSync(path, { force: true });
  else atomicWrite(path, rest.trim() === "" ? "" : rest);
  return true;
}

const PRISM_HOOK = PRISM_HOOK_FILE;

/**
 * Removes Prism's hook entries. An empty `hooks` key goes only when Prism
 * added it (`hadHooks === false`), the file only when Prism created it.
 */
export function removeClaudeHooks(
  path: string,
  options: {
    readonly hadHooks?: boolean | undefined;
    readonly dropEmptyFile?: boolean;
  } = {},
): boolean {
  if (!existsSync(path)) return false;
  const settings = readJsonObject(path);
  if (!settings.hooks) return false;
  const hooks = stripPrismHooks(settings.hooks);
  if (Object.keys(hooks).length > 0 || options.hadHooks !== false)
    settings.hooks = hooks;
  else delete settings.hooks;
  writeOrDropJson(path, settings, options.dropEmptyFile === true);
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
    rmSync(join(dest, name), { recursive: true, force: true });
  }
  const files: InstallFile[] = [];
  for (const name of readdirSync(source)) {
    const to = join(dest, name);
    files.push({ kind: "file", path: to });
    if (sameTree(join(source, name), to)) continue;
    record({ kind: "dir", path: to, existed: existsSync(to) });
    rmSync(to, { recursive: true, force: true });
    makeDir(dirname(to));
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
  atomicWrite(settingsPath, formatJsonLike(textOnDisk(settingsPath), settings));
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
      "Cursor: the Prism MCP server is on for every repo. The prepare/receipt rule is per repo: run `prism install cursor --project` in each repo that should have it.",
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

function parseObject(text: string | undefined): Record<string, unknown> | null {
  if (text === undefined || text.trim() === "") return {};
  try {
    const raw = JSON.parse(text) as unknown;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * What uninstall may remove for `file`, from the journal of this run and the
 * record of an earlier one. A path this run did not write keeps the earlier
 * answer, or the safe one (it is the user's).
 */
export function annotateInstallFile(
  file: InstallFile,
  entries: readonly JournalEntry[],
  previous?: InstallFile,
): InstallFile {
  const entry = entries.find((e) => e.path === file.path);
  const written = entry !== undefined;
  const before =
    entry?.kind === "text"
      ? entry.before
      : entry?.kind === "dir" && entry.existed
        ? ""
        : undefined;
  const createdNow = written && before === undefined;
  const created = createdNow || previous?.created === true;
  switch (file.kind) {
    case "json-key": {
      const prev =
        previous?.kind === "json-key" ? previous.existingDepth : undefined;
      let depth = file.key.length - 1;
      if (written) {
        const root = parseObject(before);
        if (root) {
          depth = 0;
          let cursor: unknown = root;
          for (const part of file.key.slice(0, -1)) {
            const next = (cursor as Record<string, unknown>)[part];
            if (!next || typeof next !== "object" || Array.isArray(next)) break;
            depth += 1;
            cursor = next;
          }
        }
      }
      return {
        ...file,
        key: [...file.key],
        created,
        existingDepth: Math.min(depth, prev ?? depth),
      };
    }
    case "claude-hooks": {
      const root = written ? parseObject(before) : null;
      const now = root ? "hooks" in root : true;
      const prev =
        previous?.kind === "claude-hooks" ? previous.hadHooks : undefined;
      return { ...file, created, hadHooks: now && prev !== false };
    }
    case "block":
    case "file":
      return { ...file, created };
  }
}

function writeHost(target: InstallTarget): HostResult {
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

/**
 * Writes one host's configs. Each recorded file says what of it was there
 * before (`created`, `existingDepth`, `hadHooks`), so uninstall takes back
 * only what Prism added (J-16).
 */
export function installHost(target: InstallTarget): HostResult {
  const run = withJournal(() => writeHost(target));
  if (run.error !== undefined) throw run.error;
  const result = run.value!;
  return {
    ...result,
    files: result.files.map((file) => annotateInstallFile(file, run.journal)),
  };
}

/** Removes one recorded install file. Returns true when something changed. */
export function removeInstallFile(file: InstallFile): boolean {
  const changed = removeOne(file);
  if (changed && !existsSync(file.path)) pruneEmptyParents(file.path);
  return changed;
}

function removeOne(file: InstallFile): boolean {
  const dropEmptyFile = file.created === true;
  switch (file.kind) {
    case "json-key":
      return deleteJsonKey(file.path, file.key, {
        ...(file.existingDepth !== undefined
          ? { keep: file.existingDepth }
          : {}),
        dropEmptyFile,
      });
    case "claude-hooks":
      return removeClaudeHooks(file.path, {
        ...(file.hadHooks !== undefined ? { hadHooks: file.hadHooks } : {}),
        dropEmptyFile,
      });
    case "block":
      return removeBlock(file.path, file.marker, dropEmptyFile);
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
