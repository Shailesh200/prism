/**
 * Tooling criticality catalog for blast radius / safe-delete (M-049 / ADR-0027).
 * Shared so impact engine and surfaces use one list.
 */

export type ToolingCriticality = "none" | "elevated" | "critical";

/**
 * Classify a repo-relative path as tooling-critical for impact scoring.
 * `critical` → High risk floor; `elevated` → Mid floor; never "safe to delete"
 * solely because the import graph is empty when not `none`.
 */
export function classifyToolingRoot(path: string): ToolingCriticality {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;

  // Manifest / workspace
  if (base === "package.json") return "critical";
  if (
    base === "pnpm-workspace.yaml" ||
    base === "pnpm-workspace.yml" ||
    base === "lerna.json"
  ) {
    return "critical";
  }
  if (base === "Cargo.toml" || base === "go.mod" || base === "pyproject.toml") {
    return "critical";
  }

  // Bundler roots
  if (/^vite\.config\./i.test(base)) return "critical";
  if (/^webpack\.config\./i.test(base)) return "critical";
  if (/^next\.config\./i.test(base)) return "critical";
  if (/^rolldown\.config\./i.test(base)) return "critical";

  // TS project
  if (/^tsconfig.*\.json$/i.test(base)) return "critical";

  // Test runner configs (hero fix for vitest.config.*)
  if (/^vitest\.config\./i.test(base)) return "critical";
  if (/^jest\.config\./i.test(base)) return "critical";
  if (/^playwright\.config\./i.test(base)) return "critical";
  if (/^\.mocharc/i.test(base)) return "critical";
  if (/^cypress\.config\./i.test(base)) return "critical";

  // Lint / format
  if (/^eslint\.config\./i.test(base)) return "elevated";
  if (/^\.eslintrc/i.test(base)) return "elevated";
  if (/^prettier\.config\./i.test(base)) return "elevated";
  if (base === ".prettierrc" || /^\.prettierrc\./i.test(base))
    return "elevated";
  if (/^\.oxlintrc/i.test(base)) return "elevated";

  // CI / Docker
  if (base === "Dockerfile" || /^Dockerfile\./i.test(base)) return "critical";
  if (
    normalized === ".github/workflows" ||
    normalized.startsWith(".github/workflows/") ||
    normalized.includes("/.github/workflows/")
  ) {
    return "critical";
  }
  if (
    base === ".gitlab-ci.yml" ||
    base === "azure-pipelines.yml" ||
    base === "Jenkinsfile"
  ) {
    return "critical";
  }

  // Env
  if (
    base === ".env" ||
    /^\.env\./i.test(base) ||
    /\.env\.example$/i.test(base)
  ) {
    return "elevated";
  }

  // Task graph
  if (base === "turbo.json" || base === "nx.json") return "elevated";
  if (base === "project.json") return "elevated";

  return "none";
}

/** Backward-compatible: any non-none tooling root. */
export function isRepoCriticalPath(path: string): boolean {
  return classifyToolingRoot(path) !== "none";
}
