import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRelativeSpecifier } from "./resolve.js";
import { parseJsonc } from "./soft-impact-utils.js";

export type LocalPackage = {
  name: string;
  /** Repo-relative directory containing package.json ("" for root). */
  rootDir: string;
  /**
   * Repo-relative package entry file when resolvable against the index
   * (`exports` / `main` / `module` / `types`, else `src/index.*` / `index.*`).
   */
  entryPath: string | null;
  /** Raw `exports` field from package.json (for subpath resolution). */
  exportsField?: unknown;
  /**
   * Build output → source directory pairs (package-relative), so an `exports`
   * target such as `./dist/lens-store.js` maps back to `src/lens-store.ts`.
   */
  outDirs?: readonly OutDirMap[];
};

/** One build-output directory and the source directory it is compiled from. */
export type OutDirMap = { readonly out: string; readonly src: string };

/** Used only when the package has no tsconfig declaring `outDir`. */
const CONVENTIONAL_OUT_DIRS: readonly OutDirMap[] = [
  { out: "dist", src: "src" },
  { out: "lib", src: "src" },
  { out: "build", src: "src" },
];

const norm = (p: string) => p.replace(/^\.\//, "").replace(/\/$/, "");

/**
 * Read `outDir`/`rootDir` from the package's own tsconfig(s). A tsconfig that
 * exists but cannot be parsed is skipped (the conventional pairs then apply);
 * the alias loader reports parse errors for the same files.
 */
export function readOutDirMaps(
  workspaceRoot: string,
  rootDir: string,
): readonly OutDirMap[] {
  const maps: OutDirMap[] = [];
  for (const name of ["tsconfig.build.json", "tsconfig.json"]) {
    const abs = join(workspaceRoot, rootDir, name);
    if (!existsSync(abs)) continue;
    let json: { compilerOptions?: { outDir?: unknown; rootDir?: unknown } };
    try {
      json = parseJsonc(readFileSync(abs, "utf8")) as typeof json;
    } catch {
      continue; // reported by loadTsconfigPathAliases (PathAliasMap.errors)
    }
    const out = json?.compilerOptions?.outDir;
    if (typeof out !== "string" || out.length === 0) continue;
    const src = json.compilerOptions?.rootDir;
    maps.push({
      out: norm(out),
      src: typeof src === "string" && src.length > 0 ? norm(src) : "src",
    });
  }
  return maps.length > 0 ? maps : CONVENTIONAL_OUT_DIRS;
}

/** `dist/x.js` → `src/x.js` for each matching out→src pair. */
export function remapToSource(
  entryRel: string,
  maps: readonly OutDirMap[],
): string[] {
  const rel = norm(entryRel);
  const out: string[] = [];
  for (const { out: o, src } of maps) {
    if (rel === o || rel.startsWith(`${o}/`)) {
      const rest = rel.slice(o.length).replace(/^\//, "");
      out.push(src === "." || src === "" ? rest : `${src}/${rest}`);
    }
  }
  return out;
}

type PackageJsonFields = {
  name?: unknown;
  main?: unknown;
  module?: unknown;
  types?: unknown;
  typings?: unknown;
  exports?: unknown;
};

const ENTRY_FALLBACKS = [
  "src/index.ts",
  "src/index.tsx",
  "src/index.mts",
  "src/index.js",
  "index.ts",
  "index.tsx",
  "index.mts",
  "index.js",
] as const;

function joinPosix(base: string, rel: string): string {
  const cleaned = rel.replace(/^\.\//, "").replace(/\\/g, "/");
  if (!base) return cleaned;
  return `${base}/${cleaned}`.replace(/\/{2,}/g, "/");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Pull candidate entry strings from a package.json `exports` value. */
function exportsCandidates(exportsField: unknown, subpath: string): string[] {
  if (typeof exportsField === "string") {
    return subpath === "." ? [exportsField] : [];
  }
  if (!exportsField || typeof exportsField !== "object") return [];

  const map = exportsField as Record<string, unknown>;
  const keys =
    subpath === "."
      ? [".", "./index", "./index.js", "./index.ts"]
      : [subpath, `${subpath}.js`, `${subpath}.ts`, `${subpath}.tsx`];

  const out: string[] = [];
  const pushRaw = (raw: unknown) => {
    if (typeof raw === "string") {
      out.push(raw);
      return;
    }
    if (raw && typeof raw === "object") {
      const cond = raw as Record<string, unknown>;
      for (const c of ["import", "default", "require", "types", "node"]) {
        const v = asString(cond[c]);
        if (v) out.push(v);
      }
    }
  };

  for (const key of keys) {
    if (key in map) pushRaw(map[key]);
  }
  // Conditional root exports without "." key (rare): import/require/default
  if (subpath === "." && !("." in map)) {
    for (const c of ["import", "default", "require"]) {
      if (c in map) pushRaw(map[c]);
    }
  }
  return out;
}

/**
 * Remap a package.json entry path (often `.js` / `.mjs`) onto an indexed
 * source file under `rootDir`.
 */
export function resolveEntryAgainstIndex(
  rootDir: string,
  entryRel: string,
  indexedPaths: ReadonlySet<string>,
): string | null {
  const abs = joinPosix(rootDir, entryRel);
  const stems = new Set<string>([
    abs,
    abs.replace(/\.(js|jsx|mjs|cjs|mts|cts)$/i, ""),
    abs.replace(/\.d\.ts$/i, ""),
  ]);

  for (const stem of stems) {
    for (const ext of [
      "",
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      "/index.ts",
      "/index.tsx",
      "/index.js",
    ]) {
      const tryPath = `${stem}${ext}`.replace(/\/{2,}/g, "/");
      if (indexedPaths.has(tryPath)) return tryPath;
    }
  }
  return null;
}

function pickPackageEntry(
  rootDir: string,
  pkg: PackageJsonFields,
  indexedPaths: ReadonlySet<string>,
  subpath = ".",
  outDirs: readonly OutDirMap[] = [],
): string | null {
  const candidates: string[] = [];
  if (pkg.exports !== undefined) {
    candidates.push(...exportsCandidates(pkg.exports, subpath));
  }
  if (subpath === ".") {
    for (const field of [pkg.main, pkg.module, pkg.types, pkg.typings]) {
      const s = asString(field);
      if (s) candidates.push(s);
    }
    for (const fb of ENTRY_FALLBACKS) candidates.push(fb);
  } else {
    candidates.push(subpath.replace(/^\.\//, ""));
  }

  for (const c of candidates) {
    const hit = resolveEntryAgainstIndex(rootDir, c, indexedPaths);
    if (hit) return hit;
  }
  // A workspace package's exports usually point at build output, which is
  // not indexed. Map it back to the source it was compiled from.
  for (const c of candidates) {
    for (const remapped of remapToSource(c, outDirs)) {
      const hit = resolveEntryAgainstIndex(rootDir, remapped, indexedPaths);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Discover local packages by reading `package.json` under the workspace root.
 * Uses indexed paths that end with `package.json`, plus the workspace root.
 */
export function discoverLocalPackages(
  workspaceRoot: string,
  indexedPaths: readonly string[],
  analyzedPaths?: ReadonlySet<string>,
): LocalPackage[] {
  const pkgJsonPaths = new Set<string>();
  pkgJsonPaths.add("package.json");
  for (const p of indexedPaths) {
    if (p === "package.json" || p.endsWith("/package.json")) {
      pkgJsonPaths.add(p);
    }
  }

  const indexedSet =
    analyzedPaths ??
    new Set(
      indexedPaths.filter(
        (p) => p !== "package.json" && !p.endsWith("/package.json"),
      ),
    );

  const packages: LocalPackage[] = [];
  for (const rel of [...pkgJsonPaths].sort((a, b) => a.localeCompare(b))) {
    const abs = join(workspaceRoot, rel);
    if (!existsSync(abs)) continue;
    let raw: PackageJsonFields;
    try {
      raw = JSON.parse(readFileSync(abs, "utf8")) as PackageJsonFields;
    } catch {
      continue;
    }
    if (typeof raw.name !== "string" || raw.name.length === 0) continue;
    const rootDir =
      rel === "package.json" ? "" : rel.slice(0, -"/package.json".length);
    const outDirs = readOutDirMaps(workspaceRoot, rootDir);
    const entryPath = pickPackageEntry(rootDir, raw, indexedSet, ".", outDirs);
    packages.push({
      name: raw.name,
      rootDir,
      entryPath,
      ...(raw.exports !== undefined ? { exportsField: raw.exports } : {}),
      outDirs,
    });
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

/**
 * Resolve a bare / workspace package specifier to a local package entry file.
 * Supports `@scope/pkg`, `@scope/pkg/sub`, package name, and repo-relative
 * package roots (`packages/foo`).
 */
export function resolveLocalPackageSpecifier(
  specifier: string,
  packages: readonly LocalPackage[],
  indexedPaths: ReadonlySet<string>,
): string | null {
  if (isRelativeSpecifier(specifier)) return null;
  if (specifier.startsWith("/") || specifier.startsWith("node:")) return null;
  if (specifier.startsWith("file:")) return null;

  // Exact package root path (e.g. packages/admin-config)
  for (const pkg of packages) {
    if (pkg.rootDir && specifier === pkg.rootDir) {
      if (pkg.entryPath && indexedPaths.has(pkg.entryPath))
        return pkg.entryPath;
    }
  }

  for (const pkg of packages) {
    if (specifier === pkg.name) {
      if (pkg.entryPath && indexedPaths.has(pkg.entryPath))
        return pkg.entryPath;
      continue;
    }
    if (!specifier.startsWith(`${pkg.name}/`)) continue;
    const rest = specifier.slice(pkg.name.length + 1);
    const subpath = `./${rest}`;
    const viaExports = pickPackageEntry(
      pkg.rootDir,
      { exports: pkg.exportsField },
      indexedPaths,
      subpath,
      pkg.outDirs ?? [],
    );
    if (viaExports) return viaExports;
    const direct = resolveEntryAgainstIndex(pkg.rootDir, rest, indexedPaths);
    if (direct) return direct;
  }

  return null;
}
