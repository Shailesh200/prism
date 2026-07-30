/**
 * Best-effort tsconfig paths / package.json#imports alias resolution (M-049).
 * No full TypeScript program — pattern → target prefix remaps only.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type PathAliasRule = {
  /** Prefix pattern without trailing `*` (e.g. `@/` or `@lib`). */
  readonly prefix: string;
  /** Replacement prefixes (repo-relative), without trailing `*`. */
  readonly targets: readonly string[];
};

export type PathAliasMap = {
  readonly rules: readonly PathAliasRule[];
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

/**
 * Load `compilerOptions.paths` from tsconfig files found in `filePaths`.
 * Also reads `package.json` `"imports"` when present.
 */
export function loadTsconfigPathAliases(
  workspaceRoot: string,
  filePaths: readonly string[],
): PathAliasMap {
  const rules: PathAliasRule[] = [];
  const seen = new Set<string>();

  const pushRule = (prefix: string, targets: string[]) => {
    const key = `${prefix}\0${targets.join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);
    rules.push({ prefix, targets });
  };

  for (const path of filePaths) {
    const base = path.split("/").pop() ?? path;
    if (!/^tsconfig.*\.json$/i.test(base)) continue;
    const json = readJsonc(workspaceRoot, path) as {
      compilerOptions?: { paths?: Record<string, string[]> };
    } | null;
    if (!json?.compilerOptions?.paths) continue;
    const dir = dirnamePosix(path);
    for (const [pattern, targets] of Object.entries(
      json.compilerOptions.paths,
    )) {
      const prefix = pattern.replace(/\*$/, "");
      const mapped = (targets ?? []).map((t) =>
        joinPosix(dir, t.replace(/\*$/, "").replace(/^\.\//, "")),
      );
      if (mapped.length > 0) pushRule(prefix, mapped);
    }
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
  return { rules };
}

/**
 * Resolve a non-relative specifier via path aliases into an indexed file, or null.
 */
export function resolveAliasSpecifier(
  _fromFile: string,
  specifier: string,
  indexedPaths: ReadonlySet<string>,
  aliases: PathAliasMap,
): string | null {
  if (specifier.startsWith("./") || specifier.startsWith("../")) return null;
  for (const rule of aliases.rules) {
    if (!specifier.startsWith(rule.prefix)) continue;
    const rest = specifier.slice(rule.prefix.length);
    for (const targetPrefix of rule.targets) {
      const candidate = `${targetPrefix}${rest}`.replace(/\/{2,}/g, "/");
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
    }
  }
  return null;
}
