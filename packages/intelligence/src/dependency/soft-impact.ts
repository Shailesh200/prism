/**
 * Soft impact edges for blast radius (M-049 / ADR-0027).
 * Config → matched files / scripts / CI references with confidence + evidence.
 */

import {
  adviseLockfilesForPackageJson,
  linkWorkspaceDeps,
  parseBundlerConfig,
  parseCiWorkflow,
  parseDockerfile,
  parseEnvFile,
  parseEslintConfig,
  parseJenkinsfile,
  parsePackageJson,
  parsePrettierConfig,
  parseSourceEnvReverse,
  parseSourceUsageRefs,
  parseTaskGraph,
  parseTestRunnerConfig,
  parseTsconfig,
} from "./soft-impact-parsers.js";
import {
  basenameOf,
  isBundlerConfig,
  isCiWorkflow,
  isCypressConfig,
  isDockerFile,
  isEnvFile,
  isEslintConfig,
  isJenkinsfile,
  isJestConfig,
  isMochaConfig,
  isPlaywrightConfig,
  isPrettierConfig,
  isTaskGraph,
  isTsconfig,
  isVitestConfig,
  normalizePosix,
  readText,
  type BuildSoftImpactIndexInput,
  type SoftImpactEdge,
  type SoftImpactIndex,
} from "./soft-impact-utils.js";

export {
  SOFT_MATCH_CAP,
  SOFT_SUBSTRING_CAP,
  SOFT_ENV_KEY_CAP,
  matchGlob,
  type SoftImpactEdge,
  type SoftImpactIndex,
  type BuildSoftImpactIndexInput,
} from "./soft-impact-utils.js";

export { parseDockerCopySources } from "./soft-impact-parsers.js";

/**
 * Build soft impact edges from known configs under the workspace.
 * Best-effort, deterministic, local-only.
 */
export function buildSoftImpactIndex(
  input: BuildSoftImpactIndexInput,
): SoftImpactIndex {
  const root = input.workspaceRoot;
  const allPaths = [...new Set(input.filePaths.map(normalizePosix))].sort();
  const edges: SoftImpactEdge[] = [];
  const seen = new Set<string>();
  const state = { truncated: false, notes: [] as string[] };
  const packageNameByRoot = new Map<string, string>();
  const packageJsonPaths: string[] = [];
  const envFiles: string[] = [];
  /** Source file contents for env-key / usage-ref scanning (lazy-filled). */
  const sourceContents = new Map<string, string>();

  const hasEnv = allPaths.some((p) => isEnvFile(basenameOf(p)));
  const sourcePaths = allPaths.filter((p) => /\.[cm]?[jt]sx?$/i.test(p));

  const ensureSource = (path: string): string | null => {
    const cached = sourceContents.get(path);
    if (cached !== undefined) return cached;
    const text = readText(root, path);
    if (text) sourceContents.set(path, text);
    return text;
  };

  // Prefill sources when env scanning is needed
  if (hasEnv) {
    for (const path of sourcePaths) ensureSource(path);
  }

  for (const path of allPaths) {
    const base = basenameOf(path);

    if (
      isVitestConfig(base) ||
      isJestConfig(base) ||
      isPlaywrightConfig(base) ||
      isMochaConfig(base) ||
      isCypressConfig(base)
    ) {
      const source = readText(root, path);
      if (source) {
        parseTestRunnerConfig(path, source, allPaths, edges, seen, state);
      }
      continue;
    }

    if (isTsconfig(base)) {
      const source = readText(root, path);
      if (source) parseTsconfig(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (base === "package.json") {
      packageJsonPaths.push(path);
      const source = readText(root, path);
      if (source) {
        parsePackageJson(
          path,
          source,
          allPaths,
          edges,
          seen,
          packageNameByRoot,
          root,
          state,
        );
      }
      adviseLockfilesForPackageJson(path, allPaths, edges, seen, state);
      continue;
    }

    if (isPrettierConfig(base)) {
      const source = readText(root, path);
      if (source) {
        parsePrettierConfig(path, source, allPaths, edges, seen, state);
      }
      continue;
    }

    if (isEslintConfig(path, base)) {
      const source = readText(root, path);
      if (source) parseEslintConfig(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (isBundlerConfig(base)) {
      const source = readText(root, path);
      if (source) {
        parseBundlerConfig(path, source, allPaths, edges, seen, state);
      }
      continue;
    }

    if (isDockerFile(base)) {
      const source = readText(root, path);
      if (source) parseDockerfile(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (isJenkinsfile(base)) {
      const source = readText(root, path);
      if (source) parseJenkinsfile(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (isCiWorkflow(path, base)) {
      const source = readText(root, path);
      if (source) parseCiWorkflow(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (isTaskGraph(base)) {
      const source = readText(root, path);
      if (source) parseTaskGraph(path, source, allPaths, edges, seen, state);
      continue;
    }

    if (isEnvFile(base)) {
      envFiles.push(path);
      const source = readText(root, path);
      if (source) {
        parseEnvFile(path, source, sourceContents, edges, seen, state);
      }
    }
  }

  // Reverse env: source files that read process.env → nearby .env files
  if (envFiles.length > 0) {
    for (const [sourcePath, text] of sourceContents) {
      parseSourceEnvReverse(sourcePath, text, envFiles, edges, seen);
    }
  }

  // Cheap usage enrichment: import() + path string refs (skip configs already parsed)
  let usageFiles = 0;
  const USAGE_FILE_CAP = 200;
  for (const path of sourcePaths) {
    if (usageFiles >= USAGE_FILE_CAP) {
      state.truncated = true;
      state.notes.push(`usage-ref file scan capped at ${USAGE_FILE_CAP}`);
      break;
    }
    const base = basenameOf(path);
    if (
      isVitestConfig(base) ||
      isJestConfig(base) ||
      isPlaywrightConfig(base) ||
      isMochaConfig(base) ||
      isCypressConfig(base) ||
      isBundlerConfig(base) ||
      isEslintConfig(path, base) ||
      isPrettierConfig(base)
    ) {
      continue;
    }
    const text = ensureSource(path);
    if (!text) continue;
    if (
      !text.includes("import(") &&
      !text.includes("./") &&
      !text.includes("../")
    ) {
      continue;
    }
    usageFiles++;
    parseSourceUsageRefs(path, text, allPaths, edges, seen, state);
  }

  linkWorkspaceDeps(packageJsonPaths, root, edges, seen);

  edges.sort((a, b) =>
    `${a.from}\0${a.to}\0${a.lane}`.localeCompare(
      `${b.from}\0${b.to}\0${b.lane}`,
    ),
  );

  return {
    edges,
    truncated: state.truncated,
    ...(state.notes.length > 0
      ? { coverageNote: state.notes.sort().join("; ") }
      : {}),
  };
}

/** Soft edges where `origin` is the config/manifest (`from`). */
export function softEdgesFromOrigin(
  index: SoftImpactIndex,
  originPath: string,
): SoftImpactEdge[] {
  return index.edges.filter((e) => e.from === originPath);
}

/** Soft edges where `origin` is a matched consumer (`to`) — reverse soft. */
export function softEdgesToOrigin(
  index: SoftImpactIndex,
  originPath: string,
): SoftImpactEdge[] {
  return index.edges.filter((e) => e.to === originPath);
}
