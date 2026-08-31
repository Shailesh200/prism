import { basename } from "node:path";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { hubHome, hubRegistryPath, type HubEnv } from "./paths.js";
import type { WorkspaceEntry, WorkspaceRegistry } from "./types.js";

export function workspaceLabel(path: string): string {
  return basename(path.replace(/[/\\]+$/, "")) || path;
}

export async function loadRegistry(
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  const file = await readJsonFile<WorkspaceRegistry>(
    hubRegistryPath(hubHome(env)),
    { workspaces: [] },
  );
  return [...(file.workspaces ?? [])];
}

export async function saveRegistry(
  workspaces: readonly WorkspaceEntry[],
  env: HubEnv = process.env,
): Promise<void> {
  await writeJsonFile(hubRegistryPath(hubHome(env)), { workspaces });
}

export async function registerWorkspace(
  path: string,
  env: HubEnv = process.env,
  now: () => string = () => new Date().toISOString(),
): Promise<WorkspaceEntry[]> {
  const root = path.trim();
  if (!root) return loadRegistry(env);
  const current = await loadRegistry(env);
  const next: WorkspaceEntry[] = [
    ...current.filter((entry) => entry.path !== root),
    {
      path: root,
      label: workspaceLabel(root),
      lastSeenAt: now(),
    },
  ];
  await saveRegistry(next, env);
  return next;
}

export async function dropMissingWorkspaces(
  exists: (path: string) => Promise<boolean>,
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  const current = await loadRegistry(env);
  const kept: WorkspaceEntry[] = [];
  for (const entry of current) {
    if (await exists(entry.path)) kept.push(entry);
  }
  if (kept.length !== current.length) {
    await saveRegistry(kept, env);
  }
  return kept;
}
