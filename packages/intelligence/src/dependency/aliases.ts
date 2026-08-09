/**
 * Best-effort tsconfig paths / package.json#imports alias resolution (M-049,
 * M-059 / P-E6). No full TypeScript program — pattern → target prefix remaps
 * with nearest-config, `extends`, and `baseUrl`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PathAliasRule = {
  /** Prefix pattern without trailing `*` (e.g. `@/` or `@lib`). */
  readonly prefix: string;
  /** Replacement prefixes (repo-relative), without trailing `*`. */
  readonly targets: readonly string[];
};

/** Compiler options contributed by one tsconfig (after extends merge). */
export type TsconfigAliasConfig = {
  /** Directory containing the tsconfig (posix, "" for workspace root). */
  readonly dir: string;
  /** Repo-relative baseUrl directory, when set. */
  readonly baseUrl?: string;
  readonly rules: readonly PathAliasRule[];
};

export type PathAliasMap = {
  /** Flat rules (longest prefix first) — union of all configs + package imports. */
  readonly rules: readonly PathAliasRule[];
  /** Per-tsconfig scopes for nearest-file resolution (M-059). */
  readonly configs: readonly TsconfigAliasConfig[];
};

function dirnamePosix(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  return path.slice(0, i);
}

function joinPosix(base: string, rel: string): string {
  const cleaned = rel.replace(/^\.\//, "");
  if (!base) return cleaned;
  return `${base}/${cleaned}`.replace(/\/{2,}/g, "/");
}

function readJsonc(root: string, rel: string): unknown | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  try {
    const raw = readFileSync(abs, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

type RawTsconfig = {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
  };
};

/** Bound: follow at most this many extends hops (cycles truncated). */
const MAX_EXTENDS_DEPTH = 8;

/**
 * Resolve a tsconfig `extends` specifier to a repo-relative path.
 * Supports relative paths and skips bare npm package extends (out of scope).
 */
function resolveExtendsPath(
  fromConfigPath: string,
  spec: string,
): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    // npm package extends (e.g. "@tsconfig/strict") — not resolved here
    return null;
  }
  const fromDir = dirnamePosix(fromConfigPath);
  let joined = joinPosix(fromDir, spec);
  if (!joined.endsWith(".json")) {
    // TypeScript allows extends without .json
    joined = `${joined}.json`;
  }
  return joined.replace(/\/{2,}/g, "/");
}

function mergeCompilerOptions(
  base: NonNullable<RawTsconfig["compilerOptions"]>,
  overlay: NonNullable<RawTsconfig["compilerOptions"]>,
): NonNullable<RawTsconfig["compilerOptions"]> {
  return {
    ...base,
    ...overlay,
    // paths: overlay replaces entirely when present (TS behavior)
    ...(overlay.paths !== undefined ? { paths: overlay.paths } : {}),
  };
}

/**
 * Load a tsconfig and its extends chain (nearest child wins on paths/baseUrl).
 */
function loadMergedCompilerOptions(
  workspaceRoot: string,
  configPath: string,
  seen: Set<string> = new Set(),
  depth = 0,
): NonNullable<RawTsconfig["compilerOptions"]> | null {
  if (depth > MAX_EXTENDS_DEPTH) return null;
  const norm = configPath.replace(/\\/g, "/");
  if (seen.has(norm)) return null;
  seen.add(norm);

  const json = readJsonc(workspaceRoot, norm) as RawTsconfig | null;
  if (!json) return null;

  let merged: NonNullable<RawTsconfig["compilerOptions"]> = {};
  const extendsList = json.extends
    ? Array.isArray(json.extends)
      ? json.extends
      : [json.extends]
    : [];
  for (const ext of extendsList) {
    const parentPath = resolveExtendsPath(norm, ext);
    if (!parentPath) continue;
    const parent = loadMergedCompilerOptions(
      workspaceRoot,
      parentPath,
      seen,
      depth + 1,
    );
    if (parent) merged = mergeCompilerOptions(merged, parent);
  }
  if (json.compilerOptions) {
    merged = mergeCompilerOptions(merged, json.compilerOptions);
  }
  return merged;
}

function normalizeBaseUrl(configDir: string, baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed === "" || trimmed === ".") return configDir;
  return joinPosix(configDir, trimmed.replace(/^\.\//, ""));
}

function rulesFromCompilerOptions(
  configDir: string,
  opts: NonNullable<RawTsconfig["compilerOptions"]>,
): { baseUrl?: string; rules: PathAliasRule[] } {
  const baseUrlRel =
    typeof opts.baseUrl === "string" && opts.baseUrl.length > 0
      ? normalizeBaseUrl(configDir, opts.baseUrl)
      : undefined;
  const resolveRoot = baseUrlRel ?? configDir;
  const rules: PathAliasRule[] = [];
  if (!opts.paths)
    return {
      ...(baseUrlRel !== undefined ? { baseUrl: baseUrlRel } : {}),
      rules,
    };

  for (const [pattern, targets] of Object.entries(opts.paths)) {
    const prefix = pattern.replace(/\*$/, "");
    const mapped = (targets ?? []).map((t) =>
      joinPosix(resolveRoot, t.replace(/\*$/, "").replace(/^\.\//, "")),
    );
    if (mapped.length > 0) rules.push({ prefix, targets: mapped });
  }
  return {
    ...(baseUrlRel !== undefined ? { baseUrl: baseUrlRel } : {}),
    rules,
  };
}

/**
 * Collect candidate tsconfig paths: indexed `tsconfig*.json` plus a bounded
 * set of unindexed roots (workspace `tsconfig.json` / `tsconfig.base.json`
 * and parent-dir tsconfigs of indexed files).
 */
function collectTsconfigPaths(
  workspaceRoot: string,
  filePaths: readonly string[],
): string[] {
  const found = new Set<string>();

  for (const path of filePaths) {
    const base = path.split("/").pop() ?? path;
    if (/^tsconfig.*\.json$/i.test(base)) found.add(path.replace(/\\/g, "/"));
  }

  // Unindexed root configs (bounded)
  for (const rootName of ["tsconfig.json", "tsconfig.base.json"]) {
    if (existsSync(join(workspaceRoot, rootName))) found.add(rootName);
  }

  // Walk parent dirs of indexed source files for nearest tsconfig.json
  const dirs = new Set<string>();
  for (const path of filePaths) {
    let dir = dirnamePosix(path.replace(/\\/g, "/"));
    while (true) {
      if (dirs.has(dir)) break;
      dirs.add(dir);
      if (!dir) break;
      dir = dirnamePosix(dir);
    }
  }
  for (const dir of dirs) {
    const candidate = dir ? `${dir}/tsconfig.json` : "tsconfig.json";
    if (found.has(candidate)) continue;
    if (existsSync(join(workspaceRoot, candidate))) found.add(candidate);
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

/**
 * Load `compilerOptions.paths` (+ baseUrl, extends) from tsconfigs near
 * `filePaths`. Also reads `package.json` `"imports"` when present.
 */
export function loadTsconfigPathAliases(
  workspaceRoot: string,
  filePaths: readonly string[],
): PathAliasMap {
  const rules: PathAliasRule[] = [];
  const configs: TsconfigAliasConfig[] = [];
  const seen = new Set<string>();

  const pushRule = (prefix: string, targets: string[]) => {
    const key = `${prefix}\0${targets.join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({ prefix, targets });
  };

  for (const configPath of collectTsconfigPaths(workspaceRoot, filePaths)) {
    const opts = loadMergedCompilerOptions(workspaceRoot, configPath);
    if (!opts) continue;
    const dir = dirnamePosix(configPath);
    const { baseUrl, rules: localRules } = rulesFromCompilerOptions(dir, opts);
    if (localRules.length === 0 && baseUrl === undefined) continue;
    configs.push({
      dir,
      ...(baseUrl !== undefined ? { baseUrl } : {}),
      rules: localRules,
    });
    for (const r of localRules) pushRule(r.prefix, [...r.targets]);
  }

  for (const path of filePaths) {
    if ((path.split("/").pop() ?? "") !== "package.json") continue;
    const json = readJsonc(workspaceRoot, path) as {
      imports?: Record<string, string | { default?: string }>;
    } | null;
    if (!json?.imports) continue;
    const dir = dirnamePosix(path);
    for (const [pattern, target] of Object.entries(json.imports)) {
      if (!pattern.startsWith("#")) continue;
      const prefix = pattern.replace(/\*$/, "");
      const raw =
        typeof target === "string"
          ? target
          : typeof target === "object" && target && "default" in target
            ? (target.default ?? "")
            : "";
      if (!raw || typeof raw !== "string") continue;
      pushRule(prefix, [
        joinPosix(dir, raw.replace(/\*$/, "").replace(/^\.\//, "")),
      ]);
    }
  }

  // Longer prefixes first for greedy match
  rules.sort((a, b) => b.prefix.length - a.prefix.length);
  // Longer dir first so nearest config wins in lookup
  configs.sort((a, b) => b.dir.length - a.dir.length);
  return { rules, configs };
}

function nearestConfig(
  fromFile: string,
  aliases: PathAliasMap,
): TsconfigAliasConfig | null {
  const dir = dirnamePosix(fromFile.replace(/\\/g, "/"));
  for (const cfg of aliases.configs) {
    if (!cfg.dir) return cfg; // workspace-root config is a fallback match
    if (dir === cfg.dir || dir.startsWith(`${cfg.dir}/`)) return cfg;
  }
  return aliases.configs[aliases.configs.length - 1] ?? null;
}

function tryIndexed(
  candidate: string,
  indexedPaths: ReadonlySet<string>,
): string | null {
  for (const ext of [
    "",
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    "/index.ts",
    "/index.tsx",
    "/index.js",
  ]) {
    const tryPath = `${candidate}${ext}`.replace(/\/{2,}/g, "/");
    if (indexedPaths.has(tryPath)) return tryPath;
  }
  return null;
}

/**
 * Resolve a non-relative specifier via path aliases into an indexed file, or null.
 * Prefers the nearest tsconfig to `fromFile` when configs are available (M-059).
 */
export function resolveAliasSpecifier(
  fromFile: string,
  specifier: string,
  indexedPaths: ReadonlySet<string>,
  aliases: PathAliasMap,
): string | null {
  if (specifier.startsWith("./") || specifier.startsWith("../")) return null;

  const local = nearestConfig(fromFile, aliases);
  const ruleSets: readonly (readonly PathAliasRule[])[] = local
    ? [local.rules, aliases.rules]
    : [aliases.rules];

  for (const rules of ruleSets) {
    for (const rule of rules) {
      if (!specifier.startsWith(rule.prefix)) continue;
      const rest = specifier.slice(rule.prefix.length);
      for (const targetPrefix of rule.targets) {
        const candidate = `${targetPrefix}${rest}`.replace(/\/{2,}/g, "/");
        const hit = tryIndexed(candidate, indexedPaths);
        if (hit) return hit;
      }
    }
  }

  // bare baseUrl-relative import (no paths entry): `@/` style only via rules;
  // also try specifier as path under nearest baseUrl
  if (local?.baseUrl && !specifier.startsWith("#")) {
    const underBase = joinPosix(local.baseUrl, specifier);
    const hit = tryIndexed(underBase, indexedPaths);
    if (hit) return hit;
  }

  return null;
}
