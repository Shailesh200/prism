import { basename, resolve, sep } from "node:path";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { hubHome, hubRegistryPath, type HubEnv } from "./paths.js";
import type { WorkspaceEntry, WorkspaceRegistry } from "./types.js";

export function workspaceLabel(path: string): string {
  return basename(path.replace(/[/\\]+$/, "")) || path;
}

function resolvedPath(path: string): string {
  return resolve(path).replace(/[/\\]+$/, "");
}

/** Test fixtures under packages/.../fixtures — not user checkouts. */
export function isFixtureWorkspacePath(path: string): boolean {
  return /(?:^|[/\\])(?:packages|apps)[/\\][^/\\]+[/\\]fixtures[/\\]/.test(
    path.replace(/\\/g, "/"),
  );
}

export function isNestedWorkspace(path: string, parent: string): boolean {
  const child = resolvedPath(path);
  const root = resolvedPath(parent);
  if (child === root) return false;
  const prefix = root.endsWith(sep) ? root : root + sep;
  return child.startsWith(prefix);
}

/** Keep top-level checkouts. Drop nested folders and intelligence fixtures. */
export function pruneHubWorkspaces(
  workspaces: readonly WorkspaceEntry[],
): WorkspaceEntry[] {
  const withoutFixtures = workspaces.filter(
    (entry) => !isFixtureWorkspacePath(entry.path),
  );
  return withoutFixtures.filter(
    (entry) =>
      !withoutFixtures.some((other) =>
        isNestedWorkspace(entry.path, other.path),
      ),
  );
}

export function mergeWorkspaceEntries(
  primary: readonly WorkspaceEntry[],
  extraPaths: readonly string[],
  now: string = new Date().toISOString(),
): WorkspaceEntry[] {
  const seen = new Set(primary.map((entry) => resolvedPath(entry.path)));
  const rows = [...primary];
  for (const path of extraPaths) {
    const root = resolvedPath(path.trim());
    if (!root || seen.has(root)) continue;
    seen.add(root);
    rows.push({
      path: root,
      label: workspaceLabel(root),
      lastSeenAt: now,
    });
  }
  return rows;
}

export async function loadRegistryFile(
  env: HubEnv = process.env,
): Promise<WorkspaceRegistry> {
  const file = await readJsonFile<WorkspaceRegistry>(
    hubRegistryPath(hubHome(env)),
    { workspaces: [] },
  );
  return {
    workspaces: [...(file.workspaces ?? [])],
    ...(file.selectedPath?.trim()
      ? { selectedPath: resolvedPath(file.selectedPath) }
      : {}),
  };
}

export async function loadRegistry(
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  return [...(await loadRegistryFile(env)).workspaces];
}

export async function selectedWorkspace(
  env: HubEnv = process.env,
): Promise<string | undefined> {
  const file = await loadRegistryFile(env);
  const selected = file.selectedPath?.trim();
  if (
    selected &&
    file.workspaces.some((row) => resolvedPath(row.path) === selected)
  ) {
    return selected;
  }
  return file.workspaces[0]?.path;
}

export async function saveRegistry(
  workspaces: readonly WorkspaceEntry[],
  env: HubEnv = process.env,
  selectedPath?: string,
): Promise<void> {
  const current = await loadRegistryFile(env);
  const selected =
    selectedPath?.trim() ||
    (current.selectedPath &&
    workspaces.some(
      (row) => resolvedPath(row.path) === resolvedPath(current.selectedPath!),
    )
      ? current.selectedPath
      : workspaces[0]?.path);
  await writeJsonFile(hubRegistryPath(hubHome(env)), {
    workspaces,
    ...(selected ? { selectedPath: resolvedPath(selected) } : {}),
  });
}

export async function setSelectedWorkspace(
  path: string,
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  const current = await loadRegistry(env);
  const root = resolvedPath(path.trim());
  if (!root) return current;
  if (!current.some((entry) => resolvedPath(entry.path) === root)) {
    return current;
  }
  await saveRegistry(current, env, root);
  return current;
}

export async function registerWorkspace(
  path: string,
  env: HubEnv = process.env,
  now: () => string = () => new Date().toISOString(),
): Promise<WorkspaceEntry[]> {
  const root = resolvedPath(path.trim());
  if (!root) return loadRegistry(env);
  const current = await loadRegistry(env);
  if (isFixtureWorkspacePath(root)) {
    const kept = pruneHubWorkspaces(current);
    if (kept.length !== current.length) await saveRegistry(kept, env);
    return kept;
  }
  const next: WorkspaceEntry[] = pruneHubWorkspaces([
    ...current.filter((entry) => resolvedPath(entry.path) !== root),
    {
      path: root,
      label: workspaceLabel(root),
      lastSeenAt: now(),
    },
  ]);
  await saveRegistry(next, env, root);
  return next;
}

/** Drop a checkout from the Console. Does not delete the tree or its jobs. */
export async function unregisterWorkspace(
  path: string,
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  const root = resolvedPath(path.trim());
  if (!root) return loadRegistry(env);
  const current = await loadRegistry(env);
  const next = current.filter((entry) => resolvedPath(entry.path) !== root);
  if (next.length !== current.length) await saveRegistry(next, env);
  return next;
}

export async function dropMissingWorkspaces(
  exists: (path: string) => Promise<boolean>,
  env: HubEnv = process.env,
): Promise<WorkspaceEntry[]> {
  const current = await loadRegistry(env);
  const present: WorkspaceEntry[] = [];
  for (const entry of current) {
    if (await exists(entry.path)) present.push(entry);
  }
  const kept = pruneHubWorkspaces(present);
  if (
    kept.length !== current.length ||
    kept.some((entry, index) => entry.path !== current[index]?.path)
  ) {
    await saveRegistry(kept, env);
  }
  return kept;
}
