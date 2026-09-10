/**
 * Cheap orientation for a Dispatch worker, paid once in the spawn prompt.
 *
 * Cursor/Claude CLI agents do not preload the repo either — they search, then
 * read slices. The expensive pattern is `ls` / glob / read until the window
 * fills. This module writes a bounded package map (workspace manifests only,
 * never Core/index) plus a clipped AGENTS.md so the first turn already has a
 * map. Skip when the job is a Skills playbook (it must not touch the repo).
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export const MAX_ORIENTATION_PACKAGES = 40;
export const MAX_GUIDE_CHARS = 4_000;

export type PackageMapRow = {
  readonly id: string;
  readonly name?: string;
  readonly rootDir: string;
};

export function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}

export function compactPackageRows(rows: readonly unknown[]): PackageMapRow[] {
  const out: PackageMapRow[] = [];
  for (const row of rows) {
    if (out.length >= MAX_ORIENTATION_PACKAGES) break;
    if (!row || typeof row !== "object") continue;
    const pkg = row as { id?: unknown; name?: unknown; rootDir?: unknown };
    const rootDir = typeof pkg.rootDir === "string" ? pkg.rootDir : undefined;
    const name = typeof pkg.name === "string" ? pkg.name : undefined;
    const id = typeof pkg.id === "string" ? pkg.id : (name ?? rootDir);
    if (!id || !rootDir) continue;
    out.push({
      id,
      ...(name ? { name } : {}),
      rootDir,
    });
  }
  return out;
}

export function formatPackageMap(rows: readonly PackageMapRow[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((row) => {
    const label = row.name ?? row.id;
    return label === row.rootDir
      ? `- ${row.rootDir}`
      : `- ${label}  ${row.rootDir}`;
  });
  return `Indexed packages (do not ls the tree):\n${lines.join("\n")}`;
}

async function readManifest(
  dir: string,
  rootDir: string,
): Promise<PackageMapRow | undefined> {
  try {
    const raw = JSON.parse(
      await readFile(join(dir, "package.json"), "utf8"),
    ) as {
      name?: unknown;
    };
    const name = typeof raw.name === "string" ? raw.name : undefined;
    return {
      id: name ?? rootDir,
      ...(name ? { name } : {}),
      rootDir,
    };
  } catch {
    return undefined;
  }
}

/** Bounded workspace map from package.json files — no indexer, no network. */
export async function packagesFromManifests(
  workspaceRoot: string,
): Promise<PackageMapRow[]> {
  const rows: PackageMapRow[] = [];
  const root = await readManifest(workspaceRoot, ".");
  if (root) rows.push(root);
  for (const bucket of ["packages", "apps"] as const) {
    const names = await readdir(join(workspaceRoot, bucket)).catch(() => []);
    for (const name of names) {
      if (rows.length >= MAX_ORIENTATION_PACKAGES) break;
      const row = await readManifest(
        join(workspaceRoot, bucket, name),
        `${bucket}/${name}`,
      );
      if (row) rows.push(row);
    }
  }
  return rows;
}

export async function readRepoGuide(
  workspaceRoot: string,
): Promise<string | undefined> {
  for (const file of ["AGENTS.md", "CLAUDE.md"]) {
    try {
      const text = (await readFile(join(workspaceRoot, file), "utf8")).trim();
      if (!text) continue;
      return text.length > MAX_GUIDE_CHARS
        ? `${text.slice(0, MAX_GUIDE_CHARS)}\n…`
        : text;
    } catch {
      // Try the next filename.
    }
  }
  return undefined;
}

export function formatWorkerOrientation(input: {
  readonly packages?: readonly PackageMapRow[];
  readonly guide?: string;
}): string {
  const parts: string[] = [];
  const map = formatPackageMap(input.packages ?? []);
  if (map) parts.push(map);
  if (input.guide?.trim()) {
    parts.push(`Repo guide:\n${input.guide.trim()}`);
  }
  return parts.join("\n\n");
}

export async function loadWorkerOrientation(
  workspaceRoot: string,
): Promise<string> {
  const [packages, guide] = await Promise.all([
    packagesFromManifests(workspaceRoot),
    readRepoGuide(workspaceRoot),
  ]);
  return formatWorkerOrientation({
    packages,
    ...(guide ? { guide } : {}),
  });
}
