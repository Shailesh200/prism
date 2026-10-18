/**
 * Entry points and orphan eligibility (plan §4.4).
 *
 * An entry point is a file something outside the import graph loads:
 * a package.json `main`/`module`/`bin`/`exports` target, a framework route
 * (Next `app/` and `pages/`), a file referenced by a literal URL path string
 * (`"/sw.js"` → `public/sw.js`), or a test file. A source file with no
 * importers and no entry role is an orphan. Config files, lockfiles,
 * vendored/generated code, declaration files and `pkg:` ids are never
 * "source" and are never reported as orphans.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyToolingRoot, isTestPath } from "@repo-prism/shared";
import {
  remapToSource,
  resolveEntryAgainstIndex,
  readOutDirMaps,
} from "./packages.js";

export type EntryRole =
  | "package-main"
  | "package-bin"
  | "package-export"
  | "route"
  | "literal-path"
  | "test";

export type EntryPointsInput = {
  readonly workspaceRoot: string;
  /** Every inventoried path (package.json files included). */
  readonly inventoryPaths: readonly string[];
  /** Analyzed TS/JS source paths. */
  readonly analyzedPaths: readonly string[];
  /** Reads a repo-relative file; defaults to the filesystem. */
  readonly readText?: (relPath: string) => string | null;
};

export type EntryPoints = {
  readonly roles: ReadonlyMap<string, EntryRole>;
  /** package.json files that could not be parsed (reported, not hidden). */
  readonly manifestErrors: readonly { path: string; message: string }[];
};

const SOURCE_EXT = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const NEXT_APP_FILE =
  /(?:^|\/)app\/(?:.*\/)?(?:page|layout|route|loading|error|global-error|not-found|template|default|opengraph-image|twitter-image|icon|apple-icon|sitemap|robots|manifest)\.(?:ts|tsx|js|jsx|mjs)$/i;
const NEXT_PAGES_FILE = /(?:^|\/)pages\/.+\.(?:ts|tsx|js|jsx|mjs)$/i;
const NEXT_ROOT_FILE =
  /(?:^|\/)(?:src\/)?(?:middleware|instrumentation)\.(?:ts|js|mjs)$/i;
const PUBLIC_DIR = /(?:^|\/)(?:public|static)\/(.+)$/;
const VENDORED =
  /(?:^|\/)(?:node_modules|vendor|vendors|third[_-]party|generated|__generated__|\.next|dist|build|out|coverage)\//i;

/** Whether `path` is a source file that may be reported as an orphan. */
export function isOrphanEligibleSource(path: string): boolean {
  if (path.startsWith("pkg:")) return false;
  if (!SOURCE_EXT.test(path)) return false;
  if (/\.d\.[cm]?ts$/i.test(path)) return false;
  if (/\.min\.js$/i.test(path)) return false;
  if (VENDORED.test(path)) return false;
  if (/(?:^|\/)[^/]*\.config\.[^/]+$/i.test(path)) return false;
  if (classifyToolingRoot(path) !== "none") return false;
  return true;
}

function leafStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) leafStrings(v, out);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) leafStrings(v, out);
}

type Manifest = {
  main?: unknown;
  module?: unknown;
  bin?: unknown;
  exports?: unknown;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
};

/** Compute the entry role of every analyzed file that has one. */
export function computeEntryPoints(input: EntryPointsInput): EntryPoints {
  const read =
    input.readText ??
    ((rel: string) => {
      const abs = join(input.workspaceRoot, rel);
      return existsSync(abs) ? readFileSync(abs, "utf8") : null;
    });
  const analyzed = new Set(input.analyzedPaths);
  const roles = new Map<string, EntryRole>();
  const manifestErrors: { path: string; message: string }[] = [];
  const set = (path: string | null, role: EntryRole) => {
    if (path && analyzed.has(path) && !roles.has(path)) roles.set(path, role);
  };

  const manifests = new Set<string>(["package.json"]);
  for (const p of input.inventoryPaths)
    if (p.endsWith("/package.json") && !VENDORED.test(p)) manifests.add(p);

  const nextRoots: string[] = [];
  for (const rel of [...manifests].sort()) {
    const text = read(rel);
    if (text === null) continue;
    let pkg: Manifest;
    try {
      pkg = JSON.parse(text) as Manifest;
    } catch (error) {
      manifestErrors.push({
        path: rel,
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const rootDir =
      rel === "package.json" ? "" : rel.slice(0, -"/package.json".length);
    const outDirs = readOutDirMaps(input.workspaceRoot, rootDir);
    const resolve = (target: string): string | null =>
      resolveEntryAgainstIndex(rootDir, target, analyzed) ??
      remapToSource(target, outDirs)
        .map((r) => resolveEntryAgainstIndex(rootDir, r, analyzed))
        .find((r): r is string => r !== null) ??
      null;
    for (const field of [pkg.main, pkg.module])
      if (typeof field === "string") set(resolve(field), "package-main");
    const bins: string[] = [];
    leafStrings(pkg.bin, bins);
    for (const b of bins) set(resolve(b), "package-bin");
    const exportTargets: string[] = [];
    leafStrings(pkg.exports, exportTargets);
    for (const t of exportTargets)
      if (!t.includes("*")) set(resolve(t), "package-export");
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("next" in deps) nextRoots.push(rootDir);
  }

  for (const path of input.analyzedPaths) {
    if (isTestPath(path)) set(path, "test");
    const inNext = nextRoots.some((r) => r === "" || path.startsWith(`${r}/`));
    if (
      inNext &&
      (NEXT_APP_FILE.test(path) ||
        NEXT_PAGES_FILE.test(path) ||
        NEXT_ROOT_FILE.test(path))
    )
      set(path, "route");
  }

  // Literal URL paths: `public/sw.js` is loaded as "/sw.js" from a string.
  const urlToFile = new Map<string, string>();
  for (const path of input.analyzedPaths) {
    const m = PUBLIC_DIR.exec(path);
    if (m?.[1] && !roles.has(path)) urlToFile.set(`/${m[1]}`, path);
  }
  if (urlToFile.size > 0) {
    for (const path of input.inventoryPaths) {
      if (urlToFile.size === 0) break;
      if (!SOURCE_EXT.test(path) && !/\.(?:html|json|webmanifest)$/i.test(path))
        continue;
      if (VENDORED.test(path)) continue;
      const text = read(path);
      if (text === null) continue;
      for (const [url, file] of urlToFile) {
        if (file === path) continue;
        if (
          text.includes(`"${url}"`) ||
          text.includes(`'${url}'`) ||
          text.includes(`\`${url}\``)
        ) {
          set(file, "literal-path");
          urlToFile.delete(url);
        }
      }
    }
  }

  return { roles, manifestErrors };
}
