import { DispatchConfigSchema, type DispatchConfig } from "./types.js";
import { configPath } from "./paths.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";

export async function loadConfig(
  workspaceRoot: string,
): Promise<DispatchConfig> {
  const raw = await readJsonFile<unknown>(configPath(workspaceRoot), {});
  return DispatchConfigSchema.parse(raw ?? {});
}

export async function saveConfig(
  workspaceRoot: string,
  patch: Partial<DispatchConfig>,
): Promise<DispatchConfig> {
  const current = await loadConfig(workspaceRoot);
  const next = DispatchConfigSchema.parse({ ...current, ...patch });
  await writeJsonFile(configPath(workspaceRoot), next);
  return next;
}

export function isSectionOn(
  config: DispatchConfig,
  id: DispatchConfig["sectionOrder"][number],
): boolean {
  return !config.sectionsOff.includes(id);
}
