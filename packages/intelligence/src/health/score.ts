import {
  isTestPath,
  type HealthScore,
  type IndexSnapshot,
  type IndexedFile,
  type TestingReport,
} from "@repo-prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { discoverLocalPackages } from "../dependency/packages.js";
import {
  buildFeatureGraph,
  featuresAreInferenceOnly,
} from "../feature/build.js";

export type ComputeHealthScoreOptions = {
  /** Prefer TestingReport score for the test_presence factor (M-046 / ADR-0022). */
  testingReport?: TestingReport;
};

/** ADR-0012 factor weights (must sum to 1). */
export const HEALTH_FACTOR_WEIGHTS = {
  parse_health: 0.25,
  test_presence: 0.25,
  coupling: 0.25,
  modularity: 0.15,
  diagnostics: 0.1,
} as const;

export type HealthFactorId = keyof typeof HEALTH_FACTOR_WEIGHTS;

type Factor = HealthScore["factors"][number];
type Breakdown = NonNullable<Factor["breakdown"]>;

function clampScore(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function gradeFromScore(score: number): HealthScore["grade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function isSourcePath(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|go|py)$/i.test(path);
}

function factor(
  id: HealthFactorId,
  label: string,
  score: number,
  note: string,
  breakdown?: Breakdown,
): Factor {
  return {
    id,
    label,
    score: clampScore(score),
    note,
    ...(breakdown && breakdown.length > 0 ? { breakdown } : {}),
  };
}

function scoreParseHealth(
  files: readonly IndexedFile[],
  unresolvedImportCount = 0,
): Factor {
  if (files.length === 0) {
    // Nothing indexed is "not measured", not "everything failed" — stay
    // neutral like the other factors' empty cases instead of scoring 0.
    return factor("parse_health", "Parse health", 50, "No indexed files", [
      { label: "Indexed files", value: 0 },
      { label: "Analyzed", value: 0 },
      { label: "Failed / skipped", value: 0 },
      { label: "Unresolved imports", value: 0 },
    ]);
  }
  const analyzed = files.filter((f) => f.status === "analyzed").length;
  const failed = files.length - analyzed;
  const ratio = analyzed / files.length;
  const note =
    unresolvedImportCount > 0
      ? `${analyzed}/${files.length} files analyzed; ${unresolvedImportCount} unresolved import(s)`
      : `${analyzed}/${files.length} files analyzed`;
  return factor("parse_health", "Parse health", ratio * 100, note, [
    { label: "Indexed files", value: files.length },
    { label: "Analyzed (ok)", value: analyzed },
    { label: "Failed / skipped", value: failed },
    { label: "Parse ratio", value: Number(ratio.toFixed(3)) },
    { label: "Unresolved imports", value: unresolvedImportCount },
  ]);
}

function scoreTestPresence(
  files: readonly IndexedFile[],
  testingReport?: TestingReport,
): Factor {
  if (testingReport) {
    const suiteCount = testingReport.suites.reduce(
      (n, s) => n + s.fileCount,
      0,
    );
    return factor(
      "test_presence",
      "Test presence",
      testingReport.score,
      testingReport.summary,
      [
        { label: "Testing score", value: testingReport.score },
        { label: "Runners", value: testingReport.runners.join(", ") || "none" },
        { label: "Suite files", value: suiteCount },
        {
          label: "Coverage",
          value: testingReport.coverage?.present
            ? (testingReport.coverage.linePct ?? "present")
            : "absent",
        },
      ],
    );
  }

  const sources = files.filter(
    (f) => isSourcePath(f.path) && !isTestPath(f.path),
  );
  const tests = files.filter((f) => isTestPath(f.path));
  const ratio = sources.length === 0 ? null : tests.length / sources.length;

  if (sources.length === 0 && tests.length === 0) {
    return factor(
      "test_presence",
      "Test presence",
      50,
      "No source/test files to evaluate",
      [
        { label: "Test files", value: 0 },
        { label: "Source files", value: 0 },
        { label: "Tests per source", value: "n/a" },
      ],
    );
  }
  if (sources.length === 0) {
    return factor(
      "test_presence",
      "Test presence",
      80,
      `${tests.length} test file(s); no non-test sources`,
      [
        { label: "Test files", value: tests.length },
        { label: "Source files", value: 0 },
        { label: "Tests per source", value: "n/a" },
      ],
    );
  }
  // 0.5 tests/source → ~100; saturates at 1.0
  const score = Math.min(100, ((ratio ?? 0) / 0.5) * 100);
  return factor(
    "test_presence",
    "Test presence",
    score,
    `${tests.length} test file(s) / ${sources.length} source file(s)`,
    [
      { label: "Test files", value: tests.length },
      { label: "Source files", value: sources.length },
      {
        label: "Tests per source",
        value: Number((ratio ?? 0).toFixed(3)),
      },
    ],
  );
}

const COUPLING_LABEL = "TS/JS import coupling";

function scoreCoupling(
  cycleCount: number,
  fileCount: number,
  nodeCount: number,
  edgeCount: number,
): Factor {
  if (fileCount === 0) {
    return factor(
      "coupling",
      COUPLING_LABEL,
      50,
      "No files to evaluate cycles",
      [
        { label: "Graph nodes", value: nodeCount },
        { label: "Graph edges", value: edgeCount },
        { label: "Cycles", value: 0 },
      ],
    );
  }
  if (cycleCount === 0) {
    return factor(
      "coupling",
      COUPLING_LABEL,
      100,
      "No import/re-export cycles",
      [
        { label: "Graph nodes", value: nodeCount },
        { label: "Graph edges", value: edgeCount },
        { label: "Cycles", value: 0 },
      ],
    );
  }
  // Each cycle costs ~20 points, floor at 0
  const score = Math.max(0, 100 - cycleCount * 20);
  return factor(
    "coupling",
    COUPLING_LABEL,
    score,
    `${cycleCount} cycle(s) detected`,
    [
      { label: "Graph nodes", value: nodeCount },
      { label: "Graph edges", value: edgeCount },
      { label: "Cycles", value: cycleCount },
    ],
  );
}

function scoreModularity(
  packageCount: number,
  featureCount: number,
  fileCount: number,
  inferenceOnlyFeatures = false,
): Factor {
  if (fileCount === 0) {
    return factor("modularity", "Modularity", 50, "No files to evaluate", [
      { label: "Local packages", value: 0 },
      { label: "Features", value: 0 },
      { label: "Indexed files", value: 0 },
    ]);
  }
  const structure = packageCount + featureCount;
  if (structure === 0) {
    return factor(
      "modularity",
      "Modularity",
      40,
      "No local packages or inferred features",
      [
        { label: "Local packages", value: packageCount },
        { label: "Features", value: featureCount },
        { label: "Indexed files", value: fileCount },
      ],
    );
  }
  // Reward some structure without requiring large monorepos.
  // Inference-only communities still count as structure (M-061 P-E2) — do not
  // apply the empty-structure penalty just because provenance is inferred.
  const raw = Math.min(100, 55 + structure * 10);
  const score =
    inferenceOnlyFeatures && packageCount === 0 ? Math.max(50, raw) : raw;
  return factor(
    "modularity",
    "Modularity",
    score,
    inferenceOnlyFeatures && packageCount === 0
      ? `${featureCount} inferred feature community(ies)`
      : `${packageCount} package(s), ${featureCount} feature(s)`,
    [
      { label: "Local packages", value: packageCount },
      { label: "Features", value: featureCount },
      { label: "Indexed files", value: fileCount },
    ],
  );
}

function scoreDiagnostics(files: readonly IndexedFile[]): Factor {
  if (files.length === 0) {
    return factor("diagnostics", "Diagnostics", 50, "No files to evaluate", [
      { label: "Diagnostics", value: 0 },
      { label: "Indexed files", value: 0 },
      { label: "Density", value: "n/a" },
    ]);
  }
  let diagnosticCount = 0;
  for (const file of files) {
    diagnosticCount += file.diagnostics?.length ?? 0;
  }
  const density = diagnosticCount / files.length;
  if (diagnosticCount === 0) {
    return factor(
      "diagnostics",
      "Diagnostics",
      100,
      "No analyzer diagnostics",
      [
        { label: "Diagnostics", value: 0 },
        { label: "Indexed files", value: files.length },
        { label: "Density", value: 0 },
      ],
    );
  }
  // 0 dens → 100; 1+ dens → ~0
  const score = Math.max(0, 100 - density * 100);
  return factor(
    "diagnostics",
    "Diagnostics",
    score,
    `${diagnosticCount} diagnostic(s) across ${files.length} file(s)`,
    [
      { label: "Diagnostics", value: diagnosticCount },
      { label: "Indexed files", value: files.length },
      { label: "Density", value: Number(density.toFixed(3)) },
    ],
  );
}

/**
 * Deterministic repository health score from an index snapshot (ADR-0012).
 * When `options.testingReport` is provided, Test Presence uses that score
 * (M-046 / ADR-0022).
 */
export function computeHealthScore(
  snapshot: IndexSnapshot,
  options?: ComputeHealthScoreOptions,
): HealthScore {
  const files = snapshot.files;
  const dep = buildDependencyGraph(snapshot);
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    files.map((f) => f.path),
  );
  const features = buildFeatureGraph(snapshot).features;
  const inferenceOnly = featuresAreInferenceOnly(features);

  const factors: Factor[] = [
    scoreParseHealth(files, dep.unresolved.length),
    scoreTestPresence(files, options?.testingReport),
    scoreCoupling(
      dep.cycles.length,
      files.length,
      dep.graph.nodes.length,
      dep.graph.edges.length,
    ),
    scoreModularity(
      packages.length,
      features.length,
      files.length,
      inferenceOnly,
    ),
    scoreDiagnostics(files),
  ];

  let weighted = 0;
  for (const f of factors) {
    const weight = HEALTH_FACTOR_WEIGHTS[f.id as HealthFactorId];
    weighted += f.score * weight;
  }
  const score = Math.round(clampScore(weighted));

  const filesTotal = snapshot.stats.filesTotal;
  const analyzed = files.filter((f) => f.status === "analyzed").length;
  const graphCoveragePct =
    filesTotal <= 0
      ? 0
      : Math.max(0, Math.min(100, Math.round((analyzed / filesTotal) * 100)));

  return {
    score,
    grade: gradeFromScore(score),
    factors,
    graphCoveragePct,
  };
}
