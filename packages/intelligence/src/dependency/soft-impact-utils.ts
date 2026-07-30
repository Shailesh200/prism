/**
 * Shared helpers for soft-impact parsers (M-049).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ImpactConfidence, ImpactLane } from "@prism/shared";

/** Cap soft matches per config to avoid huge-glob blowups. */
export const SOFT_MATCH_CAP = 500;

/** Cap low-confidence substring fallbacks (CI/Docker). */
export const SOFT_SUBSTRING_CAP = 40;

/** Cap env-key consumer matches per key. */
export const SOFT_ENV_KEY_CAP = 25;

export type SoftImpactEdge = {
  readonly from: string;
  readonly to: string;
  readonly lane: ImpactLane;
  readonly reason: string;
  readonly confidence: ImpactConfidence;
  readonly evidence: readonly string[];
  readonly category?: "config" | "test" | "import" | "runtime";
};

export type SoftImpactIndex = {
  readonly edges: readonly SoftImpactEdge[];
  readonly truncated: boolean;
  readonly coverageNote?: string;
};

export type SoftParseState = {
  truncated: boolean;
  notes: string[];
};

export type BuildSoftImpactIndexInput = {
  readonly workspaceRoot: string;
  readonly filePaths: readonly string[];
};

export function normalizePosix(p: string): string {
  return p.replace(/\\/g, "/");
}

export function dirnamePosix(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  return path.slice(0, i);
}

export function joinPosix(base: string, rel: string): string {
  const cleaned = rel.replace(/^\.\//, "");
  if (!base) return cleaned;
  return `${base}/${cleaned}`.replace(/\/{2,}/g, "/");
}

export function basenameOf(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Minimal glob matcher: supports `**`, `*`, and `?` against posix paths.
 */
export function matchGlob(pattern: string, path: string): boolean {
  const pat = normalizePosix(pattern);
  const target = normalizePosix(path);
  let re = "";
  for (let i = 0; i < pat.length; i++) {
    const c = pat[i]!;
    if (c === "*" && pat[i + 1] === "*") {
      re += ".*";
      i++;
      if (pat[i + 1] === "/") {
        i++;
        re += "?";
      }
    } else if (c === "*") {
      re += "[^/]*";
    } else if (c === "?") {
      re += "[^/]";
    } else if ("+.^$()[]{}|\\".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`, "i").test(target);
}

export function readText(root: string, rel: string): string | null {
  const abs = join(root, rel);
  if (!existsSync(abs)) return null;
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** Extract string-array / single-string property values via lightweight regex. */
export function extractStringArrayProp(source: string, prop: string): string[] {
  const values: string[] = [];
  const re = new RegExp(
    `${prop}\\s*:\\s*\\[([^\\]]*)\\]|${prop}\\s*=\\s*\\[([^\\]]*)\\]|"${prop}"\\s*:\\s*\\[([^\\]]*)\\]`,
    "g",
  );
  for (const m of source.matchAll(re)) {
    const body = m[1] ?? m[2] ?? m[3] ?? "";
    for (const sm of body.matchAll(/['"`]([^'"`]+)['"`]/g)) {
      if (sm[1]) values.push(sm[1]);
    }
  }
  const single = new RegExp(
    `${prop}\\s*:\\s*['"\`]([^'"\`]+)['"\`]|"${prop}"\\s*:\\s*"([^"]+)"`,
    "g",
  );
  for (const m of source.matchAll(single)) {
    const v = m[1] ?? m[2];
    if (v) values.push(v);
  }
  return values;
}

export function matchUnderDir(
  dir: string,
  patterns: readonly string[],
  allPaths: readonly string[],
  cap: number,
): { matches: string[]; truncated: boolean } {
  const matches: string[] = [];
  let truncated = false;
  const prefixes = dir ? [`${dir}/`] : [""];

  for (const path of allPaths) {
    if (matches.length >= cap) {
      truncated = true;
      break;
    }
    const under = prefixes.some(
      (p) => !p || path === dir || path.startsWith(p),
    );
    if (!under) continue;

    const relToDir = dir
      ? path === dir
        ? ""
        : path.startsWith(`${dir}/`)
          ? path.slice(dir.length + 1)
          : null
      : path;
    if (relToDir === null) continue;

    for (const pattern of patterns) {
      const pat = pattern.replace(/^\.\//, "");
      if (
        matchGlob(pat, relToDir) ||
        matchGlob(pat, path) ||
        (dir ? matchGlob(joinPosix(dir, pat), path) : false)
      ) {
        matches.push(path);
        break;
      }
    }
  }
  return { matches: [...new Set(matches)].sort(), truncated };
}

/** Match patterns anywhere in the inventory (repo-scoped). */
export function matchAnywhere(
  patterns: readonly string[],
  allPaths: readonly string[],
  cap: number,
): { matches: string[]; truncated: boolean } {
  return matchUnderDir("", patterns, allPaths, cap);
}

export function pushEdge(
  edges: SoftImpactEdge[],
  edge: SoftImpactEdge,
  seen: Set<string>,
): void {
  const key = `${edge.from}\0${edge.to}\0${edge.lane}\0${edge.reason}`;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push(edge);
}

export function isVitestConfig(base: string): boolean {
  return /^vitest\.config\./i.test(base);
}

export function isJestConfig(base: string): boolean {
  return /^jest\.config\./i.test(base);
}

export function isPlaywrightConfig(base: string): boolean {
  return /^playwright\.config\./i.test(base);
}

export function isMochaConfig(base: string): boolean {
  return /^\.mocharc/i.test(base) || /^mocha\.opts$/i.test(base);
}

export function isCypressConfig(base: string): boolean {
  return (
    /^cypress\.config\./i.test(base) ||
    base === "cypress.json" ||
    base === "cypress.config.json"
  );
}

export function isTsconfig(base: string): boolean {
  return /^tsconfig.*\.json$/i.test(base);
}

export function isEslintConfig(_path: string, base: string): boolean {
  return (
    /^eslint\.config\./i.test(base) ||
    /^\.eslintrc(\.|$)/i.test(base) ||
    base === ".eslintrc"
  );
}

export function isPrettierConfig(base: string): boolean {
  return (
    /^\.prettierrc(\.|$)/i.test(base) ||
    /^prettier\.config\./i.test(base) ||
    base === ".prettierrc" ||
    base === ".prettierignore"
  );
}

export function isBundlerConfig(base: string): boolean {
  return (
    /^vite\.config\./i.test(base) ||
    /^webpack\.config\./i.test(base) ||
    /^next\.config\./i.test(base)
  );
}

export function isDockerFile(base: string): boolean {
  return base === "Dockerfile" || /^Dockerfile\./i.test(base);
}

export function isJenkinsfile(base: string): boolean {
  return base === "Jenkinsfile" || /^Jenkinsfile\./i.test(base);
}

export function isLockfile(base: string): boolean {
  return (
    base === "package-lock.json" ||
    base === "yarn.lock" ||
    base === "pnpm-lock.yaml" ||
    base === "bun.lock" ||
    base === "bun.lockb" ||
    base === "npm-shrinkwrap.json" ||
    base === "Cargo.lock" ||
    base === "poetry.lock" ||
    base === "Pipfile.lock" ||
    base === "composer.lock" ||
    base === "Gemfile.lock"
  );
}

export function isEnvFile(base: string): boolean {
  return (
    base === ".env" ||
    /^\.env\./i.test(base) ||
    /\.env\.example$/i.test(base) ||
    base.endsWith(".env")
  );
}

export function isCiWorkflow(path: string, base: string): boolean {
  return (
    path.includes(".github/workflows/") ||
    base === ".gitlab-ci.yml" ||
    base === "azure-pipelines.yml" ||
    base === "azure-pipelines.yaml" ||
    isJenkinsfile(base)
  );
}

export function isAzurePipelines(base: string): boolean {
  return (
    base === "azure-pipelines.yml" ||
    base === "azure-pipelines.yaml" ||
    /^azure-pipelines\./i.test(base)
  );
}

export function isTaskGraph(base: string): boolean {
  return base === "turbo.json" || base === "nx.json" || base === "project.json";
}

export function isNxProjectJson(path: string, base: string): boolean {
  return base === "project.json";
}

/** Resolve a relative or package-root path against inventory. */
export function resolveInventoryPath(
  dir: string,
  raw: string,
  allPaths: readonly string[],
): string | null {
  const cleaned = raw.replace(/^\.\//, "").replace(/\/$/, "");
  if (!cleaned || cleaned.includes("*") || cleaned.startsWith("http")) {
    return null;
  }
  // Skip docker ARG/ENV-looking tokens and absolute container paths
  if (cleaned.startsWith("/") && !allPaths.includes(cleaned.slice(1))) {
    // try without leading slash as repo-relative
    const noSlash = cleaned.replace(/^\//, "");
    if (allPaths.includes(noSlash)) return noSlash;
  }
  const candidates = [
    joinPosix(dir, cleaned),
    cleaned,
    joinPosix(dir, cleaned.replace(/\.(js|mjs|cjs)$/i, ".ts")),
    cleaned.replace(/\.(js|mjs|cjs)$/i, ".ts"),
  ];
  for (const cand of candidates) {
    if (allPaths.includes(cand)) return cand;
    // Directory → package.json under it
    const pkg = joinPosix(cand, "package.json");
    if (allPaths.includes(pkg)) return pkg;
  }
  return null;
}

/**
 * Extract path-like tokens from a shell/script command string.
 * Relative paths, src/..., ./foo, and simple globs.
 */
export function extractPathLikeTokens(cmd: string): string[] {
  const tokens: string[] = [];
  const re =
    /(?:^|[\s"'`=])((?:\.\.?\/|src\/|apps\/|packages\/|lib\/|dist\/|build\/|test\/|tests\/|scripts\/|config\/|\.github\/)[^\s"'`;|&<>]+)/g;
  for (const m of cmd.matchAll(re)) {
    const t = m[1]?.replace(/[,)]$/, "");
    if (t && t.length >= 3) tokens.push(t);
  }
  // Bare globs like **/*.ts in quotes
  for (const m of cmd.matchAll(/['"`]([^'"`]*\*[^'"`]*)['"`]/g)) {
    if (m[1] && m[1].includes("/") && m[1].length >= 3) tokens.push(m[1]);
  }
  return [...new Set(tokens)];
}

/** Collect string leaf values from nested JSON-ish exports/bin maps. */
export function collectStringLeaves(
  value: unknown,
  out: string[] = [],
): string[] {
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStringLeaves(v, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStringLeaves(v, out);
    }
  }
  return out;
}

/**
 * Strip light JSONC comments without eating glob `/**` inside strings.
 * String-aware scan; best-effort for config files.
 */
export function stripJsonc(source: string): string {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const c = source[i]!;
    const next = source[i + 1];

    // Double-quoted string
    if (c === '"') {
      out += c;
      i++;
      while (i < source.length) {
        const ch = source[i]!;
        out += ch;
        if (ch === "\\" && i + 1 < source.length) {
          out += source[i + 1]!;
          i += 2;
          continue;
        }
        i++;
        if (ch === '"') break;
      }
      continue;
    }

    // Line comment
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // Block comment
    if (c === "/" && next === "*") {
      i += 2;
      while (
        i + 1 < source.length &&
        !(source[i] === "*" && source[i + 1] === "/")
      ) {
        i++;
      }
      i = Math.min(i + 2, source.length);
      continue;
    }

    out += c;
    i++;
  }
  return out;
}
