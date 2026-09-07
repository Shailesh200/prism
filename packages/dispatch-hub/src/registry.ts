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
  if (isFixtureWorkspacePath(root)) {
    const kept = pruneHubWorkspaces(current);
    if (kept.length !== current.length) await saveRegistry(kept, env);
    return kept;
  }
  const next: WorkspaceEntry[] = pruneHubWorkspaces([
    ...current.filter((entry) => entry.path !== root),
    {
      path: root,
      label: workspaceLabel(root),
      lastSeenAt: now(),
    },
  ]);
  await saveRegistry(next, env);
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
