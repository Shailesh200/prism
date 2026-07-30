/**
 * Coarse file-role classifier for blast headlines / scoring floors (M-049).
 * Deterministic path heuristics — not a full AST role model.
 */

export type FileRole =
  | "entry"
  | "config"
  | "test"
  | "route"
  | "schema"
  | "generated"
  | "barrel"
  | "fixture"
  | "source";

const ROLE_LABEL: Record<FileRole, string> = {
  entry: "entry",
  config: "config",
  test: "test",
  route: "route",
  schema: "schema",
  generated: "generated",
  barrel: "barrel",
  fixture: "fixture",
  source: "source",
};

/** Human label for UI / explainArea copy. */
export function fileRoleLabel(role: FileRole): string {
  return ROLE_LABEL[role];
}

/**
 * Classify a repo-relative path into a coarse file role.
 * Priority: generated → fixture → test → config → schema → route → barrel → entry → source.
 */
export function classifyFileRole(path: string): FileRole {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  const lower = normalized.toLowerCase();

  if (
    /(^|\/)(generated|gen|\.generated)(\/|$)/i.test(normalized) ||
    /\.gen\.[a-z]+$/i.test(base) ||
    /\.generated\.[a-z]+$/i.test(base)
  ) {
    return "generated";
  }

  if (
    /(^|\/)(__)?fixtures?(\/|$)/i.test(normalized) ||
    /\.fixture\.[a-z]+$/i.test(base) ||
    base === "fixtures.ts" ||
    base === "fixtures.js"
  ) {
    return "fixture";
  }

  if (
    /(^|\/)__tests__\//.test(normalized) ||
    /\.(test|spec)\.[a-z]+$/i.test(base) ||
    /(^|\/)(e2e|tests?)(\/|$)/i.test(normalized)
  ) {
    return "test";
  }

  // Tooling / config roots (basename + known config dialects)
  if (
    base === "package.json" ||
    /^tsconfig.*\.json$/i.test(base) ||
    /\.config\.[cm]?[jt]sx?$/i.test(base) ||
    /^\.eslintrc/i.test(base) ||
    /^\.prettierrc/i.test(base) ||
    /^\.mocharc/i.test(base) ||
    /^\.oxlintrc/i.test(base) ||
    base === "Dockerfile" ||
    /^Dockerfile\./i.test(base) ||
    base === "Jenkinsfile" ||
    base === "turbo.json" ||
    base === "nx.json" ||
    base === "project.json" ||
    base === ".gitlab-ci.yml" ||
    /^azure-pipelines\.ya?ml$/i.test(base) ||
    lower.includes("/.github/workflows/") ||
    base === ".env" ||
    /^\.env\./i.test(base) ||
    /\.env\.example$/i.test(base)
  ) {
    return "config";
  }

  if (
    /\.(graphql|gql|proto|avsc|avro)$/i.test(base) ||
    /(^|\/)(schemas?|prisma)(\/|$)/i.test(normalized) ||
    /^schema\./i.test(base) ||
    base === "schema.prisma"
  ) {
    return "schema";
  }

  if (
    /(^|\/)(routes?|pages?|app)(\/|$)/i.test(normalized) &&
    /\.[cm]?[jt]sx?$/i.test(base) &&
    !/^index\./i.test(base)
  ) {
    return "route";
  }
  // Next.js App Router page/layout/route handlers
  if (
    /^(page|layout|route|loading|error|template)\.[cm]?[jt]sx?$/i.test(base)
  ) {
    return "route";
  }

  if (/^index\.[cm]?[jt]sx?$/i.test(base)) {
    return "barrel";
  }

  if (
    /^(main|app|server|index)\.[cm]?[jt]sx?$/i.test(base) ||
    /(^|\/)(src\/)?(main|app|server)\.[cm]?[jt]sx?$/i.test(normalized) ||
    base === "cli.js" ||
    base === "cli.ts"
  ) {
    // Prefer entry over barrel when basename is main/app/server (not bare index)
    if (!/^index\./i.test(base)) return "entry";
  }

  return "source";
}

/**
 * Soft risk floor hint from file role (used with tooling criticality).
 * `entry` / `route` / `schema` get a light elevated floor when tooling is none.
 */
export function fileRoleRiskFloor(role: FileRole): number {
  switch (role) {
    case "entry":
      return 35;
    case "route":
    case "schema":
      return 30;
    case "barrel":
      return 25;
    case "config":
      // Tooling criticality already floors configs; keep mild fallback.
      return 40;
    default:
      return 0;
  }
}
