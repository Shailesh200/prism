import { access } from "node:fs/promises";
import { DispatchConfigSchema, type DispatchConfig } from "./types.js";
import { configPath, repoConfigPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseConfig(raw: unknown): DispatchConfig {
  return DispatchConfigSchema.parse(raw ?? {});
}

/**
 * Spoken after configure get/set so the host agent tells the human that
 * Cursor, Claude Code, Codex, and Claude Desktop all read this file
 * (ADR-0047). MCP install files stay per-host; vendor credentials stay
 * per-backend.
 */
export const SHARED_DISPATCH_CONFIG_SPEAK =
  "These settings apply to every repository and every MCP host on this machine (Cursor, Claude Code, Codex, Claude Desktop).";

/**
 * Dispatch settings live in `~/.prism/dispatch/config.json` so every
 * repository and every MCP host on the machine shares them (ADR-0047).
 * A leftover in-repo file is copied there once, then ignored.
 */
export async function loadConfig(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DispatchConfig> {
  const userPath = configPath(workspaceRoot, env);
  if (await pathExists(userPath)) {
    return parseConfig(await readJsonFile<unknown>(userPath, {}));
  }
  const legacyPath = repoConfigPath(workspaceRoot);
  if (await pathExists(legacyPath)) {
    const migrated = parseConfig(await readJsonFile<unknown>(legacyPath, {}));
    await writeJsonFile(userPath, migrated);
    return migrated;
  }
  return parseConfig({});
}

/**
 * A patch means "change these keys", not "reset the rest".
 *
 * Spreading a patch that carries explicitly-undefined keys overwrote stored
 * values with undefined, and the schema then filled in its defaults — so
 * setting one field quietly reset every other one. Callers build patches by
 * reading optional fields off a tool payload, which is exactly how undefined
 * keys get there, so the guard belongs here rather than in each caller.
 */
function definedEntries(
  patch: Partial<DispatchConfig>,
): Partial<DispatchConfig> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) next[key] = value;
  }
  return next as Partial<DispatchConfig>;
}

export async function saveConfig(
  workspaceRoot: string,
  patch: Partial<DispatchConfig>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DispatchConfig> {
  const current = await loadConfig(workspaceRoot, env);
  const next = DispatchConfigSchema.parse({
    ...current,
    ...definedEntries(patch),
  });
  await writeJsonFile(configPath(workspaceRoot, env), next);
  return next;
}

export function isSectionOn(
  config: DispatchConfig,
  id: DispatchConfig["sectionOrder"][number],
): boolean {
  return !config.sectionsOff.includes(id);
}
