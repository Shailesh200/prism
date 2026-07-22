import type {
  EngineeringHealthMetric,
  EngineeringHealthMetricId,
  EngineeringHealthReport,
  EngineeringHotspot,
  EngineeringHotspotKind,
  GitFileSignal,
  IndexSnapshot,
  IndexedFile,
} from "@prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import {
  discoverLocalPackages,
  packageForFile,
  type LocalPackage,
} from "../dependency/packages.js";

export type ComputeEngineeringHealthInput = {
  snapshot: IndexSnapshot;
  /** Per-file git signals when available (Core injects; optional). */
  gitFiles?: readonly GitFileSignal[];
  now?: Date;
};

const METRIC_ORDER: EngineeringHealthMetricId[] = [
  "entropy",
  "architecture_drift",
  "technical_debt",
  "code_churn",
  "conflict_risk",
  "knowledge_decay",
];

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function severityFromScore(score: number): EngineeringHealthMetric["severity"] {
  if (score >= 80) return "info";
  if (score >= 60) return "low";
  if (score >= 40) return "medium";
  return "high";
}

function metric(
  id: EngineeringHealthMetricId,
  label: string,
  score: number,
  evidence: string[],
  note: string,
  gitDependent = false,
): EngineeringHealthMetric {
  const s = clamp(score);
  return {
    id,
    label,
    score: s,
    severity: severityFromScore(s),
    evidence,
    note,
    gitDependent,
  };
}

function shannonEntropy(weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let h = 0;
  for (const w of weights) {
    if (w <= 0) continue;
    const p = w / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function pathFromFileNodeId(id: string): string | null {
  return id.startsWith("file:") ? id.slice("file:".length) : null;
}

function buildFanIn(snapshot: IndexSnapshot): Map<string, number> {
  const dep = buildDependencyGraph(snapshot);
  const fanIn = new Map<string, number>();
  for (const e of dep.graph.edges) {
    const to = pathFromFileNodeId(e.to);
    if (!to) continue;
    fanIn.set(to, (fanIn.get(to) ?? 0) + 1);
  }
  return fanIn;
}

function countCrossPackageEdges(
  snapshot: IndexSnapshot,
  packages: readonly LocalPackage[],
): { cross: number; total: number } {
  if (packages.length === 0) return { cross: 0, total: 0 };
  const dep = buildDependencyGraph(snapshot);
  let cross = 0;
  let total = 0;
  for (const e of dep.graph.edges) {
    const from = pathFromFileNodeId(e.from);
    const to = pathFromFileNodeId(e.to);
    if (!from || !to) continue;
    total += 1;
    const pf = packageForFile(from, packages);
    const pt = packageForFile(to, packages);
    if (pf && pt && pf.name !== pt.name) cross += 1;
  }
  return { cross, total };
}

function scoreEntropy(
  snapshot: IndexSnapshot,
  gitFiles: readonly GitFileSignal[] | undefined,
): EngineeringHealthMetric {
  if (gitFiles && gitFiles.length > 0) {
    const weights = gitFiles.map((f) => f.commits + f.additions + f.deletions);
    const h = shannonEntropy(weights);
    const maxH = Math.log2(Math.max(2, weights.filter((w) => w > 0).length));
    const normalized = maxH > 0 ? h / maxH : 0;
    // High entropy (even spread) is healthier than single-file firehose.
    const score = normalized * 100;
    return metric(
      "entropy",
      "Engineering entropy",
      score,
      [
        `shannon=${h.toFixed(2)}`,
        `files_with_signal=${weights.filter((w) => w > 0).length}`,
      ],
      "Change distribution across files (git). Higher = more even change load.",
      true,
    );
  }

  const fanIn = buildFanIn(snapshot);
  const degrees = [...fanIn.values()];
  if (degrees.length === 0) {
    return metric(
      "entropy",
      "Engineering entropy",
      50,
      [],
      "No import edges to evaluate structural entropy",
    );
  }
  const h = shannonEntropy(degrees);
  const maxH = Math.log2(Math.max(2, degrees.length));
  const score = maxH > 0 ? (h / maxH) * 100 : 50;
  return metric(
    "entropy",
    "Engineering entropy",
    score,
    [`shannon=${h.toFixed(2)}`, `nodes=${degrees.length}`],
    "Import fan-in dispersion (structural fallback; no git)",
  );
}

function scoreArchitectureDrift(
  snapshot: IndexSnapshot,
): EngineeringHealthMetric {
  const dep = buildDependencyGraph(snapshot);
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
  );
  const cycleCount = dep.cycles.length;
  const { cross, total } = countCrossPackageEdges(snapshot, packages);
  const crossShare = total > 0 ? cross / total : 0;
  const cyclePenalty = Math.min(60, cycleCount * 15);
  const crossPenalty = crossShare * 40;
  const score = Math.max(0, 100 - cyclePenalty - crossPenalty);
  return metric(
    "architecture_drift",
    "Architecture drift",
    score,
    [
      `cycles=${cycleCount}`,
      `cross_package_edges=${cross}/${total}`,
      `packages=${packages.length}`,
    ],
    cycleCount === 0 && cross === 0
      ? "No cycles or cross-package edges detected"
      : "Cycles and cross-package coupling pull this down",
  );
}

function scoreTechnicalDebt(
  files: readonly IndexedFile[],
): EngineeringHealthMetric {
  if (files.length === 0) {
    return metric(
      "technical_debt",
      "Technical debt",
      50,
      [],
      "No indexed files",
    );
  }
  let failed = 0;
  let diagnostics = 0;
  for (const f of files) {
    if (f.status === "failed" || f.status.startsWith("skipped_")) failed += 1;
    diagnostics += f.diagnostics?.length ?? 0;
  }
  const failShare = failed / files.length;
  const dens = diagnostics / files.length;
  const score = Math.max(0, 100 - failShare * 70 - dens * 80);
  return metric(
    "technical_debt",
    "Technical debt",
    score,
    [`failed_or_skipped=${failed}`, `diagnostics=${diagnostics}`],
    "Parse failures and analyzer diagnostics density",
  );
}

function scoreCodeChurn(
  gitFiles: readonly GitFileSignal[] | undefined,
): EngineeringHealthMetric {
  if (!gitFiles || gitFiles.length === 0) {
    return metric(
      "code_churn",
      "Code churn",
      50,
      [],
      "Git history unavailable — neutral score",
      true,
    );
  }
  const churn = gitFiles
    .map((f) => ({
      path: f.path,
      lines: f.additions + f.deletions,
    }))
    .filter((x) => x.lines > 0)
    .sort((a, b) => b.lines - a.lines);
  const total = churn.reduce((a, b) => a + b.lines, 0);
  if (total === 0) {
    return metric(
      "code_churn",
      "Code churn",
      90,
      ["total_lines=0"],
      "No line churn in scanned window",
      true,
    );
  }
  const top = churn.slice(0, Math.max(1, Math.ceil(churn.length * 0.1)));
  const topLines = top.reduce((a, b) => a + b.lines, 0);
  const concentration = topLines / total;
  // High concentration in top 10% → unhealthy
  const score = Math.max(0, 100 - concentration * 100);
  return metric(
    "code_churn",
    "Code churn",
    score,
    [
      `top10pct_share=${(concentration * 100).toFixed(0)}%`,
      `top_file=${top[0]?.path ?? "—"}`,
      `total_lines=${total}`,
    ],
    "Lower when a few files dominate additions/deletions",
    true,
  );
}

function scoreConflictRisk(
  gitFiles: readonly GitFileSignal[] | undefined,
): EngineeringHealthMetric {
  if (!gitFiles || gitFiles.length === 0) {
    return metric(
      "conflict_risk",
      "Merge conflict risk",
      50,
      [],
      "Git history unavailable — neutral score",
      true,
    );
  }
  const risky = gitFiles.filter(
    (f) => f.contributors.length >= 3 && f.commits >= 5,
  );
  const share = gitFiles.length > 0 ? risky.length / gitFiles.length : 0;
  const score = Math.max(0, 100 - share * 200);
  return metric(
    "conflict_risk",
    "Merge conflict risk",
    score,
    [`multi_author_hot_files=${risky.length}`, `scanned=${gitFiles.length}`],
    "Files with ≥3 contributors and ≥5 commits in window",
    true,
  );
}

function scoreKnowledgeDecay(
  snapshot: IndexSnapshot,
  gitFiles: readonly GitFileSignal[] | undefined,
): EngineeringHealthMetric {
  const fanIn = buildFanIn(snapshot);
  if (!gitFiles || gitFiles.length === 0) {
    const hubs = [...fanIn.entries()]
      .filter(([, d]) => d >= 3)
      .sort((a, b) => b[1] - a[1]);
    return metric(
      "knowledge_decay",
      "Knowledge decay",
      hubs.length === 0 ? 70 : 55,
      [`high_fan_in=${hubs.length}`],
      "No git — structural hubs only (cannot measure staleness)",
      true,
    );
  }
  const byPath = new Map(gitFiles.map((f) => [f.path, f]));
  let decaying = 0;
  let considered = 0;
  for (const [path, degree] of fanIn) {
    if (degree < 2) continue;
    const g = byPath.get(path);
    if (!g) continue;
    considered += 1;
    const busFactor = g.contributors.length <= 1;
    const stale = g.recency < 0.25;
    if (stale || busFactor) decaying += 1;
  }
  if (considered === 0) {
    return metric(
      "knowledge_decay",
      "Knowledge decay",
      70,
      [],
      "No high fan-in files with git overlap",
      true,
    );
  }
  const share = decaying / considered;
  const score = Math.max(0, 100 - share * 100);
  return metric(
    "knowledge_decay",
    "Knowledge decay",
    score,
    [`decaying_hubs=${decaying}/${considered}`],
    "High fan-in files that are stale or single-owner",
    true,
  );
}

function buildHotspots(
  snapshot: IndexSnapshot,
  gitFiles: readonly GitFileSignal[] | undefined,
): EngineeringHotspot[] {
  const fanIn = buildFanIn(snapshot);
  const byPath = new Map(gitFiles?.map((f) => [f.path, f]) ?? []);
  const debtByPath = new Map<string, number>();
  for (const f of snapshot.files) {
    const d =
      (f.diagnostics?.length ?? 0) +
      (f.status === "failed" || f.status.startsWith("skipped_") ? 5 : 0);
    if (d > 0) debtByPath.set(f.path, d);
  }

  const paths = new Set<string>([
    ...fanIn.keys(),
    ...debtByPath.keys(),
    ...(gitFiles?.map((f) => f.path) ?? []),
  ]);

  const out: EngineeringHotspot[] = [];
  for (const path of paths) {
    const kinds: EngineeringHotspotKind[] = [];
    const evidence: string[] = [];
    let risk = 0;
    const g = byPath.get(path);
    if (g) {
      const lines = g.additions + g.deletions;
      if (g.commits >= 4 || lines >= 80) {
        kinds.push("churn");
        evidence.push(`commits=${g.commits}`, `lines=${lines}`);
        risk += Math.min(40, g.commits * 4 + lines / 20);
      }
      if (g.contributors.length >= 3) {
        kinds.push("ownership");
        evidence.push(`contributors=${g.contributors.length}`);
        risk += 15;
      }
      if (g.recency < 0.2 && (fanIn.get(path) ?? 0) >= 2) {
        kinds.push("stale");
        evidence.push(`recency=${g.recency.toFixed(2)}`);
        risk += 20;
      }
    }
    const debt = debtByPath.get(path) ?? 0;
    if (debt > 0) {
      kinds.push("debt");
      evidence.push(`debt_weight=${debt}`);
      risk += Math.min(30, debt * 8);
    }
    const degree = fanIn.get(path) ?? 0;
    if (degree >= 4) {
      kinds.push("coupling");
      evidence.push(`fan_in=${degree}`);
      risk += Math.min(25, degree * 4);
    }
    if (kinds.length === 0) continue;
    out.push({
      path,
      score: clamp(risk),
      kinds,
      evidence,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 20);
}

/**
 * Compute engineering-health metrics (M-022 / ADR-0017). Pure; git optional.
 */
export function computeEngineeringHealth(
  input: ComputeEngineeringHealthInput,
): EngineeringHealthReport {
  const { snapshot } = input;
  const gitFiles = input.gitFiles;
  const gitAvailable = Boolean(gitFiles && gitFiles.length > 0);
  const generatedAt = (input.now ?? new Date()).toISOString();

  const byId = new Map<EngineeringHealthMetricId, EngineeringHealthMetric>([
    ["entropy", scoreEntropy(snapshot, gitFiles)],
    ["architecture_drift", scoreArchitectureDrift(snapshot)],
    ["technical_debt", scoreTechnicalDebt(snapshot.files)],
    ["code_churn", scoreCodeChurn(gitFiles)],
    ["conflict_risk", scoreConflictRisk(gitFiles)],
    ["knowledge_decay", scoreKnowledgeDecay(snapshot, gitFiles)],
  ]);

  const metrics = METRIC_ORDER.map((id) => byId.get(id)!);
  const hotspots = buildHotspots(snapshot, gitFiles);
  const weak = metrics.filter((m) => m.score < 60).length;

  return {
    rootPath: snapshot.rootPath,
    generatedAt,
    summary: gitAvailable
      ? `${metrics.length} metrics (${weak} below 60); ${hotspots.length} hotspot(s); git signals on`
      : `${metrics.length} metrics (${weak} below 60); ${hotspots.length} hotspot(s); git unavailable (neutral git metrics)`,
    gitAvailable,
    metrics,
    hotspots,
  };
}
