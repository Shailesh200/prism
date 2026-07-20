import {
  type HealthScore,
  type IndexSnapshot,
  type IndexedFile,
} from "@prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { discoverLocalPackages } from "../dependency/packages.js";
import { buildFeatureGraph } from "../feature/build.js";

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

function isTestPath(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|e2e|spec)\//i.test(path) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(path) ||
    /\.test\.ts$/i.test(path)
  );
}

function isSourcePath(path: string): boolean {
  return /\.(ts|tsx|js|jsx|mjs|cjs|go|py)$/i.test(path);
}

function factor(
  id: HealthFactorId,
  label: string,
  score: number,
  note: string,
): Factor {
  return {
    id,
    label,
    score: clampScore(score),
    note,
  };
}

function scoreParseHealth(files: readonly IndexedFile[]): Factor {
  if (files.length === 0) {
    return factor("parse_health", "Parse health", 0, "No indexed files");
  }
  const analyzed = files.filter((f) => f.status === "analyzed").length;
  const ratio = analyzed / files.length;
  return factor(
    "parse_health",
    "Parse health",
    ratio * 100,
    `${analyzed}/${files.length} files analyzed`,
  );
}

function scoreTestPresence(files: readonly IndexedFile[]): Factor {
  const sources = files.filter(
    (f) => isSourcePath(f.path) && !isTestPath(f.path),
  );
  const tests = files.filter((f) => isTestPath(f.path));
  if (sources.length === 0 && tests.length === 0) {
    return factor(
      "test_presence",
      "Test presence",
      50,
      "No source/test files to evaluate",
    );
  }
  if (sources.length === 0) {
    return factor(
      "test_presence",
      "Test presence",
      80,
      `${tests.length} test file(s); no non-test sources`,
    );
  }
  const ratio = tests.length / sources.length;
  // 0.5 tests/source → ~100; saturates at 1.0
  const score = Math.min(100, (ratio / 0.5) * 100);
  return factor(
    "test_presence",
    "Test presence",
    score,
    `${tests.length} test file(s) / ${sources.length} source file(s)`,
  );
}

function scoreCoupling(cycleCount: number, fileCount: number): Factor {
  if (fileCount === 0) {
    return factor("coupling", "Coupling", 50, "No files to evaluate cycles");
  }
  if (cycleCount === 0) {
    return factor("coupling", "Coupling", 100, "No import/re-export cycles");
  }
  // Each cycle costs ~20 points, floor at 0
  const score = Math.max(0, 100 - cycleCount * 20);
  return factor(
    "coupling",
    "Coupling",
    score,
    `${cycleCount} cycle(s) detected`,
  );
}

function scoreModularity(
  packageCount: number,
  featureCount: number,
  fileCount: number,
): Factor {
  if (fileCount === 0) {
    return factor("modularity", "Modularity", 50, "No files to evaluate");
  }
  const structure = packageCount + featureCount;
  if (structure === 0) {
    return factor(
      "modularity",
      "Modularity",
      40,
      "No local packages or inferred features",
    );
  }
  // Reward some structure without requiring large monorepos
  const score = Math.min(100, 55 + structure * 10);
  return factor(
    "modularity",
    "Modularity",
    score,
    `${packageCount} package(s), ${featureCount} feature(s)`,
  );
}

function scoreDiagnostics(files: readonly IndexedFile[]): Factor {
  if (files.length === 0) {
    return factor("diagnostics", "Diagnostics", 50, "No files to evaluate");
  }
  let diagnosticCount = 0;
  for (const file of files) {
    diagnosticCount += file.diagnostics?.length ?? 0;
  }
  if (diagnosticCount === 0) {
    return factor("diagnostics", "Diagnostics", 100, "No analyzer diagnostics");
  }
  const density = diagnosticCount / files.length;
  // 0 dens → 100; 1+ dens → ~0
  const score = Math.max(0, 100 - density * 100);
  return factor(
    "diagnostics",
    "Diagnostics",
    score,
    `${diagnosticCount} diagnostic(s) across ${files.length} file(s)`,
  );
}

/**
 * Deterministic repository health score from an index snapshot (ADR-0012).
 */
export function computeHealthScore(snapshot: IndexSnapshot): HealthScore {
  const files = snapshot.files;
  const dep = buildDependencyGraph(snapshot);
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    files.map((f) => f.path),
  );
  const features = buildFeatureGraph(snapshot).features;

  const factors: Factor[] = [
    scoreParseHealth(files),
    scoreTestPresence(files),
    scoreCoupling(dep.cycles.length, files.length),
    scoreModularity(packages.length, features.length, files.length),
    scoreDiagnostics(files),
  ];

  let weighted = 0;
  for (const f of factors) {
    const weight = HEALTH_FACTOR_WEIGHTS[f.id as HealthFactorId];
    weighted += f.score * weight;
  }
  const score = Math.round(clampScore(weighted));

  return {
    score,
    grade: gradeFromScore(score),
    factors,
  };
}
