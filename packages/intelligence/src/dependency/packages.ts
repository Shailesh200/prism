import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type LocalPackage = {
  name: string;
  /** Repo-relative directory containing package.json ("" for root). */
  rootDir: string;
};

/**
 * Discover local packages by reading `package.json` under the workspace root.
 * Uses indexed paths that end with `package.json`, plus the workspace root.
 */
export function discoverLocalPackages(
  workspaceRoot: string,
  indexedPaths: readonly string[],
): LocalPackage[] {
  const pkgJsonPaths = new Set<string>();
  pkgJsonPaths.add("package.json");
  for (const p of indexedPaths) {
    if (p === "package.json" || p.endsWith("/package.json")) {
      pkgJsonPaths.add(p);
    }
  }

  const packages: LocalPackage[] = [];
  for (const rel of [...pkgJsonPaths].sort((a, b) => a.localeCompare(b))) {
    const abs = join(workspaceRoot, rel);
    if (!existsSync(abs)) continue;
    let name: string;
    try {
      const raw = JSON.parse(readFileSync(abs, "utf8")) as { name?: unknown };
      if (typeof raw.name !== "string" || raw.name.length === 0) continue;
      name = raw.name;
    } catch {
      continue;
    }
    const rootDir =
      rel === "package.json" ? "" : rel.slice(0, -"/package.json".length);
    packages.push({ name, rootDir });
  }

  // Longest root first for nearest-package matching
  return packages.sort((a, b) => b.rootDir.length - a.rootDir.length);
}

/** Nearest local package for a repo-relative file path. */
export function packageForFile(
  filePath: string,
  packages: readonly LocalPackage[],
): LocalPackage | null {
  for (const pkg of packages) {
    if (pkg.rootDir === "") {
      // Root package matches everything only if no nested package matched first
      // (packages sorted longest-first, so root is last)
      return pkg;
    }
    if (filePath === pkg.rootDir || filePath.startsWith(`${pkg.rootDir}/`)) {
      return pkg;
    }
  }
  return null;
}

export function packageNodeId(name: string): string {
  return `pkg:${name}`;
}
