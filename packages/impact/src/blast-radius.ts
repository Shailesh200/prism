import {
  classifyFileRole,
  classifyToolingRoot,
  fileRoleRiskFloor,
  ok,
  riskToBand,
  type BlastRadiusReport,
  type BreakingChangeHint,
  type ForwardDependencyItem,
  type PrismError,
  type Result,
  type ScenarioChecklistSection,
} from "@repo-prism/shared";
import {
  FILE_PREFIX,
  affectedItems,
  computeAffected,
  isTestPath,
  mergeSoftAffected,
  scoreBlastRisk,
  stripFilePrefix,
  summarizeLanes,
  WIDELY_USED_THRESHOLD,
  type BlastRadiusOrigin,
  type ImpactContext,
} from "./internal.js";

/** Severity ordering for deterministic hint sorting (danger first). */
const SEVERITY_RANK: Record<BreakingChangeHint["severity"], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

/** Cap on forward-dependency rows returned on a blast report (M-056 / P-A5). */
export const FORWARD_DEPENDENCIES_LIMIT = 80;

/**
 * Dependency classes blast radius cannot observe (M-056 / P-A7).
 * Static — always attached so agents and humans know the blind spots.
 */
export const BLAST_COVERAGE_LIMITATIONS: readonly string[] = [
  "Dependency-injection container bindings",
  "String-keyed registries and service locators",
  "Event bus / pub-sub subscribers",
  "Template and i18n string references",
  "Runtime-loaded configuration paths",
  "Generated-code consumers outside the index",
];

/**
 * Deterministic breaking-change hints for a blast-radius result, derived from
 * the origin path, immediate fan-in, test coverage, and truncation. Sorted by
 * severity (danger, warning, info) then message.
 */
function blastBreakingChanges(args: {
  originPath: string;
  directDependents: number;
  affectedCount: number;
  testsAffected: number;
  truncated: boolean;
  softCount: number;
  originRole: ReturnType<typeof classifyFileRole>;
}): BreakingChangeHint[] {
  const hints: BreakingChangeHint[] = [];
  const criticality = classifyToolingRoot(args.originPath);

  if (criticality === "critical") {
    const isTestRunner =
      /vitest\.config\.|jest\.config\.|playwright\.config\.|\.mocharc|cypress\.config/i.test(
        args.originPath,
      );
    hints.push({
      kind: isTestRunner ? "test-runner-config" : "config-change",
      severity: "danger",
      message: isTestRunner
        ? `Editing a test-runner config (${args.originPath}) can reshape which tests run and how.`
        : `Editing a build/config file (${args.originPath}) can affect the whole workspace build.`,
    });
  } else if (criticality === "elevated") {
    hints.push({
      kind: "tooling-config",
      severity: "warning",
      message: `Editing tooling config (${args.originPath}) can affect lint, format, env, or task graphs.`,
    });
  }
  if (args.originRole === "entry" || args.originRole === "barrel") {
    hints.push({
      kind: "entry-or-barrel",
      severity: "info",
      message: `This looks like a${args.originRole === "entry" ? "n entry" : " barrel"} file — edits often ripple through importers.`,
    });
  }
  if (args.directDependents >= WIDELY_USED_THRESHOLD) {
    hints.push({
      kind: "widely-used",
      severity: "warning",
      message: `${args.directDependents} files depend directly on this; breaking its contract impacts many callers.`,
    });
  }
  if (
    args.testsAffected === 0 &&
    args.affectedCount > 0 &&
    criticality === "none"
  ) {
    hints.push({
      kind: "untested",
      severity: "warning",
      message: "No tests appear to cover the affected files.",
    });
  }
  if (args.truncated) {
    hints.push({
      kind: "partial",
      severity: "info",
      message: "Impact traversal hit the depth limit; results are partial.",
    });
  }
  if (args.softCount > 0 && criticality !== "none") {
    hints.push({
      kind: "tooling-config",
      severity: "info",
      message: `${args.softCount} soft tooling impact(s) beyond import dependents.`,
    });
  }

  return hints.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.message.localeCompare(b.message),
  );
}

function collectForwardDependencies(
  originPath: string,
  context: ImpactContext,
): {
  items: ForwardDependencyItem[];
  truncated: boolean;
  totalCount: number;
} {
  const items: ForwardDependencyItem[] = [];
  const seen = new Set<string>();
  const prefix = `${FILE_PREFIX}${originPath}`;

  for (const edge of context.dependencyGraph.edges) {
    if (edge.from !== prefix) continue;
    if (!edge.to.startsWith(FILE_PREFIX)) continue;
    const toPath = stripFilePrefix(edge.to);
    if (toPath === originPath || seen.has(toPath)) continue;
    seen.add(toPath);
    const kind =
      edge.kind === "re-export" || /reexport|export/i.test(edge.kind)
        ? ("reexport" as const)
        : ("import" as const);
    items.push({
      path: toPath,
      reason:
        kind === "reexport" ? `re-exports ${toPath}` : `imports ${toPath}`,
      kind,
      confidence: "high",
    });
  }

  for (const edge of context.softEdges ?? []) {
    if (edge.from !== originPath || edge.to === originPath) continue;
    if (seen.has(edge.to)) continue;
    if (edge.lane === "import" || edge.lane === "alias") {
      seen.add(edge.to);
      items.push({
        path: edge.to,
        reason: edge.reason,
        kind: "soft",
        confidence: edge.confidence,
        ...(edge.evidence.length > 0 ? { evidence: [...edge.evidence] } : {}),
      });
    }
  }

  const sorted = items.sort((a, b) => a.path.localeCompare(b.path));
  const totalCount = sorted.length;
  const sliced = sorted.slice(0, FORWARD_DEPENDENCIES_LIMIT);
  return {
    items: sliced,
    truncated: totalCount > sliced.length,
    totalCount,
  };
}

function buildScenarioChecklist(args: {
  testsLikelyAffected: readonly string[];
  affectedFiles: readonly {
    path: string;
    reason: string;
    lane?: string;
    confidence?: "high" | "medium" | "low";
    category?: string;
  }[];
}): ScenarioChecklistSection[] {
  const tests = args.testsLikelyAffected.slice(0, 40).map((path) => {
    const hit = args.affectedFiles.find((f) => f.path === path);
    return {
      path,
      reason: hit?.reason ?? "test in blast radius",
      ...(hit?.confidence !== undefined ? { confidence: hit.confidence } : {}),
    };
  });

  const configsCi = args.affectedFiles
    .filter(
      (f) =>
        f.lane === "ci" ||
        f.lane === "config" ||
        f.lane === "script" ||
        f.category === "config",
    )
    .slice(0, 40)
    .map((f) => ({
      path: f.path,
      reason: f.reason,
      ...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
    }));

  const packages = args.affectedFiles
    .filter((f) => f.lane === "package" || f.lane === "workspace")
    .slice(0, 40)
    .map((f) => ({
      path: f.path,
      reason: f.reason,
      ...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
    }));

  const sections: ScenarioChecklistSection[] = [];
  if (tests.length > 0) {
    sections.push({ id: "tests", label: "Tests to run", items: tests });
  }
  if (configsCi.length > 0) {
    sections.push({
      id: "configs_ci",
      label: "Configs / CI touching this",
      items: configsCi,
    });
  }
  if (packages.length > 0) {
    sections.push({
      id: "packages",
      label: "Package / workspace links",
      items: packages,
    });
  }
  return sections;
}

export {
  DEFAULT_BLAST_MAX_DEPTH,
  classifyToolingRoot,
  isRepoCriticalPath,
  type BlastRadiusOrigin,
  type ImpactContext,
  type ImpactContext as BlastRadiusOptions,
  type ImpactReference,
  type ImpactSymbol,
  type SoftImpactEdge,
} from "./internal.js";

/**
 * Compute the blast radius (reverse-dependency impact) of a change target.
 *
 * Traverses the file dependency graph backwards from the origin — every file
 * that (transitively) imports the origin is "affected". Soft config/CI/script
 * edges (M-049) merge in with confidence + evidence.
 *
 * Risk score (0–100, deterministic) uses hard ∪ soft reach with α≈0.5 soft
 * weight, tooling criticality floors (critical≥70, elevated≥45), and Q-023
 * bands: Low &lt;20, Mid 20–60, High 60+.
 */
export function computeBlastRadius(
  origin: BlastRadiusOrigin,
  options: ImpactContext,
): Result<BlastRadiusReport, PrismError> {
  const result = computeAffected(origin, options);
  if (!result.ok) return result;
  const {
    originPath,
    affected: hardMap,
    truncated,
    resolutionNote,
  } = result.value;

  const { softOnly, softDepth1 } = mergeSoftAffected(
    originPath,
    hardMap,
    options.softEdges,
  );

  const hardItems = affectedItems(hardMap);
  const softItems = affectedItems(softOnly);
  const affectedFiles = [...hardItems, ...softItems].sort(
    (a, b) => a.depth - b.depth || a.path.localeCompare(b.path),
  );

  const testsLikelyAffected = [
    ...new Set(affectedFiles.map((f) => f.path).filter((p) => isTestPath(p))),
  ].sort((a, b) => a.localeCompare(b));

  const hardCount = hardItems.length;
  const softCount = softItems.length;
  const hardDepth1 = hardItems.filter((f) => f.depth === 1).length;
  const criticality =
    origin.kind === "file" ? classifyToolingRoot(originPath) : "none";
  const originRole = classifyFileRole(originPath);
  const intent = options.intent ?? "edit";

  let risk = scoreBlastRisk({
    hardCount,
    softCount,
    hardDepth1,
    softDepth1,
    testsInRadius: testsLikelyAffected.length,
    analyzedFileCount: options.analyzedPaths.length,
    criticality,
  });

  if (criticality === "none") {
    const floor = fileRoleRiskFloor(originRole);
    if (floor > 0) risk = Math.max(risk, floor);
  }
  if (intent === "delete" && hardDepth1 > 0) {
    risk = Math.min(100, risk + 5);
  }

  const softTruncated = options.softTruncated === true;
  const reportTruncated = truncated || softTruncated;
  const lanes = summarizeLanes(affectedFiles);
  const exposeLaneMeta =
    softCount > 0 || softTruncated || criticality !== "none";

  const forward = collectForwardDependencies(originPath, options);
  const scenarioChecklist = buildScenarioChecklist({
    testsLikelyAffected,
    affectedFiles: affectedFiles.map((f) => ({
      path: f.path,
      reason: f.reason,
      ...(f.lane !== undefined ? { lane: f.lane } : {}),
      ...(f.confidence !== undefined ? { confidence: f.confidence } : {}),
      ...(f.category !== undefined ? { category: f.category } : {}),
    })),
  });

  const report: BlastRadiusReport = {
    origin: { kind: origin.kind, id: origin.id, path: originPath },
    risk,
    band: riskToBand(risk),
    affectedFiles,
    testsLikelyAffected,
    breakingChanges: blastBreakingChanges({
      originPath,
      directDependents: hardDepth1,
      affectedCount: affectedFiles.length,
      testsAffected: testsLikelyAffected.length,
      truncated: reportTruncated,
      softCount,
      originRole,
    }),
    originRole,
    intent,
    coverageLimitations: [...BLAST_COVERAGE_LIMITATIONS],
    ...(forward.items.length > 0 ? { forwardDependencies: forward.items } : {}),
    ...(forward.totalCount > 0
      ? {
          forwardDependenciesTotalCount: forward.totalCount,
          ...(forward.truncated ? { forwardDependenciesTruncated: true } : {}),
        }
      : {}),
    ...(scenarioChecklist.length > 0 ? { scenarioChecklist } : {}),
    ...(reportTruncated ? { truncated: true } : {}),
    ...(exposeLaneMeta
      ? {
          lanes,
          hardAffectedCount: hardCount,
          softAffectedCount: softCount,
        }
      : {}),
    ...(options.coverageNote && exposeLaneMeta
      ? { coverageNote: options.coverageNote }
      : softTruncated
        ? { coverageNote: "Soft impact matches were truncated." }
        : {}),
    ...(resolutionNote ? { resolutionNote } : {}),
  };
  return ok(report);
}
