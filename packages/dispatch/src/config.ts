import { DispatchConfigSchema, type DispatchConfig } from "./types.js";
import { configPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export async function loadConfig(
  workspaceRoot: string,
): Promise<DispatchConfig> {
  const raw = await readJsonFile<unknown>(configPath(workspaceRoot), {});
  return DispatchConfigSchema.parse(raw ?? {});
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
): Promise<DispatchConfig> {
  const current = await loadConfig(workspaceRoot);
  const next = DispatchConfigSchema.parse({
    ...current,
    ...definedEntries(patch),
  });
  await writeJsonFile(configPath(workspaceRoot), next);
  return next;
}

export function isSectionOn(
  config: DispatchConfig,
  id: DispatchConfig["sectionOrder"][number],
): boolean {
  return !config.sectionsOff.includes(id);
}

/**
 * One standup note for the presenting agent: the template, plus any
 * standing preferences that are not already in it.
 */
export function standupNotesText(config: DispatchConfig): string {
  const template = config.standupTemplate;
  const extras = config.preferences.filter(
    (line) => line.length > 0 && !template.includes(line),
  );
  if (extras.length === 0) return template;
  return template ? `${template}\n${extras.join("\n")}` : extras.join("\n");
}
