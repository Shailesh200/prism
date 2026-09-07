/**
 * Model ids for a Dispatch job come from the selected agent, never from a
 * Prism catalog. Cursor: `Cursor.models.list()`. Claude Code: this install's
 * `--help` plus the user's `modelPicker` / `availableModels` settings.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { claudeCliCommand } from "./claude-cli.js";
import { loadCursorSdk } from "./worker.js";
import type { WorkerBackend } from "./worker-backend.js";

export type WorkerModelOption = {
  readonly id: string;
  readonly label: string;
};

const LIST_TIMEOUT_MS = 12_000;
const CLAUDE_HELP_TTL_MS = 10 * 60 * 1000;

let claudeHelpCache: { readonly text: string; readonly at: number } | undefined;
let cursorModelsCache:
  | { readonly models: readonly WorkerModelOption[]; readonly at: number }
  | undefined;
let cursorModelsPending: Promise<WorkerModelOption[]> | undefined;

/** Trim a caller-supplied model id. Empty means "agent default". */
export function requestedWorkerModel(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  return id ? id : undefined;
}

const PLACEHOLDER_MODEL = /^(auto|default|agent[- ]?default)$/i;

function isPlaceholderModel(id: string): boolean {
  return PLACEHOLDER_MODEL.test(id.trim());
}

/**
 * Cursor's local SDK requires `model: { id }` on Agent.create. "Agent default"
 * in compose used to omit the field; pick a real id from the agent's list.
 */
export function pickCursorSpawnModel(
  models: readonly WorkerModelOption[],
  requested?: string,
): string | undefined {
  const explicit = requestedWorkerModel(requested);
  if (explicit && !isPlaceholderModel(explicit)) return explicit;
  for (const row of models) {
    const id = row.id.trim();
    if (id && !isPlaceholderModel(id)) return id;
  }
  return undefined;
}

/**
 * Cursor local SDK needs an explicit model id. Resolve one from the agent's
 * list when compose left "Agent default". Tests skip the live list.
 */
export async function cursorModelForSpawn(
  requested?: string,
  list?: () => Promise<readonly WorkerModelOption[]>,
): Promise<string | undefined> {
  const immediate = pickCursorSpawnModel([], requested);
  if (immediate) return immediate;
  if (process.env.VITEST && !list) return undefined;
  const models = await (
    list ?? (() => listWorkerModels({ backend: "cursor" }))
  )();
  return pickCursorSpawnModel(models, requested);
}

export function modelsFromAgentList(
  items: readonly unknown[],
): WorkerModelOption[] {
  const out: WorkerModelOption[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const row = modelOptionFromUnknown(item);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function modelOptionFromUnknown(item: unknown): WorkerModelOption | undefined {
  if (typeof item === "string") {
    const id = item.trim();
    return id ? { id, label: id } : undefined;
  }
  if (!item || typeof item !== "object") return undefined;
  const row = item as Record<string, unknown>;
  const nested =
    row.model && typeof row.model === "object"
      ? (row.model as Record<string, unknown>)
      : undefined;
  const idRaw = [row.id, row.value, row.model, nested?.id].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (typeof idRaw !== "string") return undefined;
  const id = idRaw.trim();
  if (!id) return undefined;
  const labelRaw = [
    row.displayName,
    row.label,
    row.name,
    nested?.displayName,
  ].find((value) => typeof value === "string" && value.trim());
  const label = typeof labelRaw === "string" ? labelRaw.trim() : id;
  return { id, label };
}

function uniqueById(rows: readonly WorkerModelOption[]): WorkerModelOption[] {
  const seen = new Set<string>();
  const out: WorkerModelOption[] = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/**
 * Quoted tokens in the CLI's `--model` help — aliases this install advertises.
 * Names that are not in the help are not added.
 */
export function parseClaudeModelHelp(help: string): WorkerModelOption[] {
  const section = claudeHelpOptionBlock(help, "--model");
  if (!section) return [];
  const found: string[] = [];
  const quoted =
    /'([A-Za-z0-9][A-Za-z0-9._:[\]-]*)'|"([A-Za-z0-9][A-Za-z0-9._:[\]-]*)"/g;
  for (const match of section.matchAll(quoted)) {
    const token = (match[1] ?? match[2] ?? "").trim();
    if (!isClaudeModelToken(token)) continue;
    found.push(token);
  }
  return modelsFromAgentList(found);
}

/** Shape of a vendor model id — not a catalog of names. */
function isClaudeModelToken(token: string): boolean {
  return (
    token.length > 0 &&
    token.length <= 80 &&
    !token.startsWith("-") &&
    /^[A-Za-z0-9][A-Za-z0-9._:[\]-]*$/.test(token)
  );
}

function claudeHelpOptionBlock(help: string, flag: string): string | undefined {
  const lines = help.split("\n");
  const start = lines.findIndex((line) => {
    const trimmed = line.trimStart();
    return trimmed === flag || trimmed.startsWith(`${flag} `);
  });
  if (start < 0) return undefined;
  const block = [lines[start]];
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trimStart();
    if (trimmed.startsWith("-")) break;
    block.push(line);
  }
  return block.join("\n");
}

export type ClaudePickerSettings = {
  readonly options: readonly WorkerModelOption[];
  readonly replaceBuiltIn: boolean;
  readonly availableModels: readonly string[];
};

/** User/org Claude Code settings — still the agent's list, not Prism's. */
export function claudePickerFromSettings(value: unknown): ClaudePickerSettings {
  const empty: ClaudePickerSettings = {
    options: [],
    replaceBuiltIn: false,
    availableModels: [],
  };
  if (!value || typeof value !== "object") return empty;
  const root = value as Record<string, unknown>;
  const picker = root.modelPicker;
  const availableModels = stringList(root.availableModels);
  if (!picker || typeof picker !== "object") {
    return { ...empty, availableModels };
  }
  const row = picker as Record<string, unknown>;
  const options = modelsFromAgentList(
    Array.isArray(row.options) ? row.options : [],
  );
  return {
    options,
    replaceBuiltIn: row.replaceBuiltInOptions === true,
    availableModels,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "string") return [];
    const id = item.trim();
    return id ? [id] : [];
  });
}

export function mergeClaudeModelSources(input: {
  readonly fromHelp?: readonly WorkerModelOption[];
  readonly fromPicker?: ClaudePickerSettings;
}): WorkerModelOption[] {
  const picker = input.fromPicker;
  const help = input.fromHelp ?? [];
  const extra = picker?.options ?? [];
  const merged = uniqueById(
    picker?.replaceBuiltIn ? extra : [...help, ...extra],
  );
  const allow = picker?.availableModels ?? [];
  if (allow.length === 0) return merged;
  const allowSet = new Set(allow.map((id) => id.toLowerCase()));
  const filtered = merged.filter((row) => allowSet.has(row.id.toLowerCase()));
  if (filtered.length > 0) return filtered;
  return modelsFromAgentList(allow);
}

export async function listWorkerModels(input: {
  readonly backend: WorkerBackend;
  readonly listCursor?: () => Promise<WorkerModelOption[]>;
  readonly listClaude?: () => Promise<WorkerModelOption[]>;
}): Promise<WorkerModelOption[]> {
  if (input.backend === "claude") {
    return await (input.listClaude ?? listClaudeModelsFromCli)();
  }
  return await (input.listCursor ?? listCursorModelsFromSdk)();
}

export async function listCursorModelsFromSdk(): Promise<WorkerModelOption[]> {
  const now = Date.now();
  if (cursorModelsCache && now - cursorModelsCache.at < CLAUDE_HELP_TTL_MS) {
    return [...cursorModelsCache.models];
  }
  if (cursorModelsPending) return await cursorModelsPending;
  cursorModelsPending = (async () => {
    const sdk = await loadCursorSdk();
    const list = sdk?.Cursor?.models?.list;
    if (typeof list !== "function") return [];
    try {
      const items = await withTimeout(list(), LIST_TIMEOUT_MS);
      const models = modelsFromAgentList(Array.isArray(items) ? items : []);
      cursorModelsCache = { models, at: Date.now() };
      return models;
    } catch {
      return [];
    }
  })().finally(() => {
    cursorModelsPending = undefined;
  });
  return await cursorModelsPending;
}

export async function listClaudeModelsFromCli(): Promise<WorkerModelOption[]> {
  const settings = await readClaudeUserSettings();
  const picker = claudePickerFromSettings(settings);
  const fromHelp = parseClaudeModelHelp(await claudeHelpText());
  return mergeClaudeModelSources({ fromHelp, fromPicker: picker });
}

async function readClaudeUserSettings(): Promise<unknown> {
  const path = join(homedir(), ".claude", "settings.json");
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

async function claudeHelpText(): Promise<string> {
  const now = Date.now();
  if (claudeHelpCache && now - claudeHelpCache.at < CLAUDE_HELP_TTL_MS) {
    return claudeHelpCache.text;
  }
  const cli = claudeCliCommand();
  const text = await runCliText(
    cli.command,
    ["--help"],
    cli.shell,
    LIST_TIMEOUT_MS,
  );
  claudeHelpCache = { text, at: now };
  return text;
}

function runCliText(
  command: string,
  args: readonly string[],
  shell: boolean,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (text: string): void => {
      if (settled) return;
      settled = true;
      resolve(text);
    };
    let child: ChildProcess;
    try {
      child = spawn(command, [...args], {
        stdio: ["ignore", "pipe", "pipe"],
        shell,
      });
    } catch {
      done("");
      return;
    }
    let out = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      out += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      out += chunk;
    });
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      done(out);
    }, timeoutMs);
    timer.unref();
    child.on("error", () => {
      clearTimeout(timer);
      done("");
    });
    child.on("close", () => {
      clearTimeout(timer);
      done(out);
    });
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout"));
    }, ms);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}
