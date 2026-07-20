import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIR_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  ".prism",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
]);

const MARKER_FILES = [
  "package.json",
  "go.mod",
  "pyproject.toml",
  "Cargo.toml",
] as const;

export type PackageRoot = {
  /** Stable id for Core selector / utility jobs. */
  readonly id: string;
  readonly name?: string;
  /** Repo-relative directory (`""` for workspace root). */
  readonly rootDir: string;
};

function readPackageJsonName(absPkgJson: string): string | undefined {
  try {
    const raw = JSON.parse(readFileSync(absPkgJson, "utf8")) as {
      name?: unknown;
    };
    return typeof raw.name === "string" && raw.name.length > 0
      ? raw.name
      : undefined;
  } catch {
    return undefined;
  }
}

function readGoModule(absGoMod: string): string | undefined {
  try {
    const text = readFileSync(absGoMod, "utf8");
    const line = text.split("\n").find((l) => l.startsWith("module "));
    if (!line) return undefined;
    const mod = line.slice("module ".length).trim();
    return mod.length > 0 ? mod : undefined;
  } catch {
    return undefined;
  }
}

function packageIdFor(rootDir: string, name: string | undefined): string {
  if (name) return name;
  return rootDir === "" ? "pkg:." : `pkg:${rootDir}`;
}

function collectMarkerDirs(workspaceRoot: string): string[] {
  const found = new Set<string>();

  const visit = (dirAbs: string, relDir: string): void => {
    let entries;
    try {
      entries = readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    let hasMarker = false;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if ((MARKER_FILES as readonly string[]).includes(entry.name)) {
        hasMarker = true;
        break;
      }
    }
    if (hasMarker) found.add(relDir);

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      const childRel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      visit(join(dirAbs, entry.name), childRel);
    }
  };

  visit(workspaceRoot, "");
  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Discover package/app roots under a workspace (MR-01).
 * Markers: package.json, go.mod, pyproject.toml, Cargo.toml.
 */
export function discoverPackageRoots(workspaceRoot: string): PackageRoot[] {
  const root = workspaceRoot.trim();
  if (!root || !existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }

  const dirs = collectMarkerDirs(root);
  const packages: PackageRoot[] = [];

  for (const rootDir of dirs) {
    const absDir = rootDir === "" ? root : join(root, rootDir);
    let name: string | undefined;

    const pkgJson = join(absDir, "package.json");
    if (existsSync(pkgJson)) {
      name = readPackageJsonName(pkgJson);
    } else {
      const goMod = join(absDir, "go.mod");
      if (existsSync(goMod)) name = readGoModule(goMod);
    }

    const id = packageIdFor(rootDir, name);
    packages.push({
      id,
      ...(name === undefined ? {} : { name }),
      rootDir,
    });
  }

  // Prefer longer paths first when matching files; keep stable id order by rootDir
  return packages.sort((a, b) => a.rootDir.localeCompare(b.rootDir));
}
