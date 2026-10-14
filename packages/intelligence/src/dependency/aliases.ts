/**
 * Best-effort tsconfig paths / package.json#imports alias resolution (M-049,
 * M-059 / P-E6). No full TypeScript program — pattern → target prefix remaps
 * with nearest-config, `extends`, and `baseUrl`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseJsonc } from "./soft-impact-utils.js";

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
  /** Config files that exist but failed to parse (path + parser message). */
  readonly errors?: readonly {
    readonly path: string;
    readonly message: string;
  }[];
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

/**
 * Config files that exist but could not be read or parsed. Reported on the
 * alias map so a broken tsconfig shows up as a reason, never as "no aliases".
 */
type ConfigErrorSink = { path: string; message: string }[];

function readJsonc(
  root: string,
  rel: string,
  errors: ConfigErrorSink,
): unknown | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  try {
    return parseJsonc(readFileSync(abs, "utf8"));
  } catch (cause) {
    errors.push({
      path: rel,
      message: cause instanceof Error ? cause.message : String(cause),
    });
    return null;
  }
}

type RawTsconfig = {
  extends?: string | string[];
  compilerOptions?: {
    baseUrl?: string;
    paths?: Record<string, string[]>;
    /**
     * Repo-relative baseUrl, resolved against the config that declared it.
     * TypeScript resolves `baseUrl` (and `paths` without one) relative to the
     * declaring file, not the file that extends it; these keep that origin
     * through the extends merge.
     */
    resolvedBaseUrl?: string;
    /** Directory of the config that declared `paths` (used when no baseUrl). */
    pathsDir?: string;
  };
};

/** Bound: follow at most this many extends hops (cycles truncated). */
const MAX_EXTENDS_DEPTH = 8;

/**
 * Resolve a tsconfig `extends` specifier to a repo-relative path.
 * Relative paths resolve against the config's directory. A package specifier
 * (`@acme/config/tsconfig.base.json`) resolves the way TypeScript does —
 * through `node_modules` in the config's directory or any ancestor — and,
 * when dependencies are not installed, through the workspace package with
 * that name. Returns null when neither exists.
 */
function resolveExtendsPath(
  workspaceRoot: string,
  fromConfigPath: string,
  spec: string,
  workspacePackages: ReadonlyMap<string, string>,
): string | null {
  if (!spec.startsWith(".") && !spec.startsWith("/")) {
    const withJson = spec.endsWith(".json") ? spec : `${spec}.json`;
    let dir = dirnamePosix(fromConfigPath);
    while (true) {
      for (const candidate of [withJson, `${spec}/tsconfig.json`]) {
        const rel = joinPosix(
          dir ? `${dir}/node_modules` : "node_modules",
          candidate,
        );
        if (existsSync(join(workspaceRoot, rel))) return rel;
      }
      if (!dir) break;
      dir = dirnamePosix(dir);
    }
    const parts = spec.split("/");
    const nameLen = spec.startsWith("@") ? 2 : 1;
    const pkgDir = workspacePackages.get(parts.slice(0, nameLen).join("/"));
    if (pkgDir === undefined) return null;
    const rest = parts.slice(nameLen).join("/");
    const rel = rest
      ? joinPosix(pkgDir, rest.endsWith(".json") ? rest : `${rest}.json`)
      : joinPosix(pkgDir, "tsconfig.json");
    return existsSync(join(workspaceRoot, rel)) ? rel : null;
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
  errors: ConfigErrorSink,
  workspacePackages: ReadonlyMap<string, string>,
  seen: Set<string> = new Set(),
  depth = 0,
): NonNullable<RawTsconfig["compilerOptions"]> | null {
  if (depth > MAX_EXTENDS_DEPTH) return null;
  const norm = configPath.replace(/\\/g, "/");
  if (seen.has(norm)) return null;
  seen.add(norm);

  const json = readJsonc(workspaceRoot, norm, errors) as RawTsconfig | null;
  if (!json) return null;

  let merged: NonNullable<RawTsconfig["compilerOptions"]> = {};
  const extendsList = json.extends
    ? Array.isArray(json.extends)
      ? json.extends
      : [json.extends]
    : [];
  for (const ext of extendsList) {
    const parentPath = resolveExtendsPath(
      workspaceRoot,
      norm,
      ext,
      workspacePackages,
    );
    if (!parentPath) continue;
    const parent = loadMergedCompilerOptions(
      workspaceRoot,
      parentPath,
      errors,
      workspacePackages,
      seen,
      depth + 1,
    );
    if (parent) merged = mergeCompilerOptions(merged, parent);
  }
  if (json.compilerOptions) {
    const own = { ...json.compilerOptions };
    const dir = dirnamePosix(norm);
    if (typeof own.baseUrl === "string" && own.baseUrl.length > 0) {
      own.resolvedBaseUrl = normalizeBaseUrl(dir, own.baseUrl);
    }
    if (own.paths !== undefined) own.pathsDir = dir;
    merged = mergeCompilerOptions(merged, own);
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
    opts.resolvedBaseUrl ??
    (typeof opts.baseUrl === "string" && opts.baseUrl.length > 0
      ? normalizeBaseUrl(configDir, opts.baseUrl)
      : undefined);
  const resolveRoot = baseUrlRel ?? opts.pathsDir ?? configDir;
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
  const errors: ConfigErrorSink = [];
  const seen = new Set<string>();

  // Workspace package name → directory, for `extends` of an uninstalled
  // workspace config package and for nothing else.
  const manifests = new Map<string, unknown>();
  const workspacePackages = new Map<string, string>();
  for (const path of filePaths) {
    if ((path.split("/").pop() ?? "") !== "package.json") continue;
    const json = readJsonc(workspaceRoot, path, errors);
    manifests.set(path, json);
    const name = (json as { name?: unknown } | null)?.name;
    if (typeof name === "string")
      workspacePackages.set(name, dirnamePosix(path));
  }

  const pushRule = (prefix: string, targets: string[]) => {
    const key = `${prefix}\0${targets.join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({ prefix, targets });
  };

  for (const configPath of collectTsconfigPaths(workspaceRoot, filePaths)) {
    const opts = loadMergedCompilerOptions(
      workspaceRoot,
      configPath,
      errors,
      workspacePackages,
    );
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

  for (const [path, manifest] of manifests) {
    const json = manifest as { imports?: Record<string, unknown> } | null;
    if (!json?.imports) continue;
    const dir = dirnamePosix(path);
    for (const [pattern, target] of Object.entries(json.imports)) {
      if (!pattern.startsWith("#")) continue;
      const prefix = pattern.replace(/\*$/, "");
      const raw = pickConditionalTarget(target);
      if (!raw) continue;
      pushRule(prefix, [
        joinPosix(dir, raw.replace(/\*$/, "").replace(/^\.\//, "")),
      ]);
    }
  }

  // Longer prefixes first for greedy match
  rules.sort((a, b) => b.prefix.length - a.prefix.length);
  // Longer dir first so nearest config wins in lookup
  configs.sort((a, b) => b.dir.length - a.dir.length);
  return { rules, configs, ...(errors.length > 0 ? { errors } : {}) };
}

/**
 * Pick a source target from a package `imports`/`exports` value. Conditions
 * are tried in plan §4.1 order — `types`, `import`, `require`, `default` —
 * recursing into nested condition objects; arrays take the first usable entry.
 */
export function pickConditionalTarget(target: unknown): string | null {
  if (typeof target === "string") return target.length > 0 ? target : null;
  if (Array.isArray(target)) {
    for (const entry of target) {
      const hit = pickConditionalTarget(entry);
      if (hit) return hit;
    }
    return null;
  }
  if (target && typeof target === "object") {
    const record = target as Record<string, unknown>;
    for (const condition of ["types", "import", "require", "default"]) {
      if (condition in record) {
        const hit = pickConditionalTarget(record[condition]);
        if (hit) return hit;
      }
    }
  }
  return null;
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
