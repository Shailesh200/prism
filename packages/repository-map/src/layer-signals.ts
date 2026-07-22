import type {
  GitFileSignal,
  GraphNodeDto,
  GraphSnapshotDto,
  IndexSnapshot,
  JsonValue,
  MapLayerId,
} from "@prism/shared";

export type LayerSignalScores = {
  readonly activity: number;
  readonly ownership: number;
  readonly debt: number;
  readonly risk: number;
  readonly performance: number;
  readonly coverage: number;
};

const EMPTY: LayerSignalScores = {
  activity: 0,
  ownership: 0,
  debt: 0,
  risk: 0,
  performance: 0,
  coverage: 0,
};

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function pathOf(node: GraphNodeDto): string | null {
  if (typeof node.attrs?.path === "string") return node.attrs.path;
  if (node.kind === "file") return node.label;
  if (node.id.startsWith("file:")) return node.id.slice("file:".length);
  return null;
}

function stableUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function looksFrontend(path: string): boolean {
  return /(^|\/)(apps\/|web\/|frontend\/|pages\/|app\/|components\/)/i.test(
    path,
  );
}

function isTestPath(path: string): boolean {
  return (
    /\.(test|spec)\./i.test(path) ||
    /(^|\/)__tests__\//i.test(path) ||
    /(^|\/)tests?\//i.test(path)
  );
}

/**
 * Local heuristics for Map layer heat (0–1). Honest stubs until M-020/M-022/etc.
 * Uses index + dependency graph only — no network.
 */
export function computeLayerSignals(
  snapshot: IndexSnapshot,
  dependencyGraph: GraphSnapshotDto,
  gitSignals?: ReadonlyMap<string, GitFileSignal>,
): ReadonlyMap<string, LayerSignalScores> {
  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const testPaths = new Set(
    snapshot.files.filter((f) => isTestPath(f.path)).map((f) => f.path),
  );

  const fanIn = new Map<string, number>();
  for (const edge of dependencyGraph.edges) {
    fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1);
  }
  const maxFanIn = Math.max(1, ...fanIn.values());

  const scores = new Map<string, LayerSignalScores>();

  for (const node of dependencyGraph.nodes) {
    const path = pathOf(node);
    if (!path) {
      scores.set(node.id, EMPTY);
      continue;
    }
    const file = byPath.get(path);
    const diag = file?.diagnostics.length ?? 0;
    const failed = file?.status === "failed" ? 1 : 0;
    const imports = file?.imports.length ?? 0;

    const debt = clamp01(failed * 0.55 + Math.min(1, diag / 4) * 0.45);
    const risk = clamp01((fanIn.get(node.id) ?? 0) / maxFanIn);
    // Higher = coverage gap (needs tests). Covered / test files stay cool.
    const base = path.replace(/\.[^.]+$/, "");
    const covered =
      isTestPath(path) ||
      [...testPaths].some(
        (t) => t.startsWith(`${base}.`) || t.startsWith(`${base}/`),
      );
    const coverage = covered
      ? stableUnit(path) * 0.2
      : 0.55 + stableUnit(path) * 0.4;

    const git = gitSignals?.get(path);
    // Activity: real commit recency when git is present; else local stub.
    const activity = git
      ? clamp01(git.recency)
      : clamp01(
          Math.min(1, imports / 12) * 0.55 + stableUnit(`act:${path}`) * 0.45,
        );
    // Ownership: distinct band per top git author; else folder-bucket stub.
    const owner =
      git && git.contributors.length > 0
        ? `git:${git.contributors[0]!.author}`
        : `own:${path.split("/").slice(0, 2).join("/") || path}`;
    const ownership = 0.15 + stableUnit(owner) * 0.7;
    const performance = looksFrontend(path)
      ? 0.45 + stableUnit(`perf:${path}`) * 0.4
      : stableUnit(`perf:${path}`) * 0.2;

    scores.set(node.id, {
      activity,
      ownership,
      debt,
      risk,
      performance,
      coverage,
    });
  }

  return scores;
}

function avgScores(items: readonly LayerSignalScores[]): LayerSignalScores {
  if (items.length === 0) return EMPTY;
  const sum = { ...EMPTY };
  for (const s of items) {
    sum.activity += s.activity;
    sum.ownership += s.ownership;
    sum.debt += s.debt;
    sum.risk += s.risk;
    sum.performance += s.performance;
    sum.coverage += s.coverage;
  }
  const n = items.length;
  return {
    activity: sum.activity / n,
    ownership: sum.ownership / n,
    debt: sum.debt / n,
    risk: sum.risk / n,
    performance: sum.performance / n,
    coverage: sum.coverage / n,
  };
}

function scoreForNode(
  node: GraphNodeDto,
  signals: ReadonlyMap<string, LayerSignalScores>,
  byPathSignal: ReadonlyMap<string, LayerSignalScores>,
): LayerSignalScores {
  const direct = signals.get(node.id);
  if (direct) return direct;
  const path = pathOf(node);
  if (path) {
    const byPath = byPathSignal.get(path);
    if (byPath) return byPath;
  }

  // Roll up member files onto feature / package nodes for overview heat.
  const members = node.attrs?.memberFiles;
  if (Array.isArray(members) && members.length > 0) {
    const rolled = members
      .filter((m): m is string => typeof m === "string")
      .map((m) => byPathSignal.get(m) ?? signals.get(`file:${m}`))
      .filter((s): s is LayerSignalScores => s !== undefined);
    return avgScores(rolled);
  }

  if (typeof node.attrs?.rootDir === "string") {
    const prefix = node.attrs.rootDir.replace(/\/$/, "");
    const rolled = [...byPathSignal.entries()]
      .filter(([p]) => p === prefix || p.startsWith(`${prefix}/`))
      .map(([, s]) => s);
    return avgScores(rolled);
  }

  return EMPTY;
}

/** Attach layer signal attrs onto map graph nodes (by id / path / members). */
export function annotateGraphWithLayerSignals(
  graph: GraphSnapshotDto,
  signals: ReadonlyMap<string, LayerSignalScores>,
): GraphSnapshotDto {
  const byPathSignal = new Map<string, LayerSignalScores>();
  for (const [id, score] of signals) {
    if (id.startsWith("file:")) {
      byPathSignal.set(id.slice("file:".length), score);
    }
  }

  const nodes = graph.nodes.map((n) => {
    const score = scoreForNode(n, signals, byPathSignal);
    const layerSignals: Record<string, JsonValue> = {
      activity: score.activity,
      ownership: score.ownership,
      debt: score.debt,
      risk: score.risk,
      performance: score.performance,
      coverage: score.coverage,
    };

    return {
      ...n,
      attrs: {
        ...n.attrs,
        layerSignals,
      },
    };
  });

  return { ...graph, nodes };
}

export function heatForActiveLayers(
  signals: LayerSignalScores,
  active: readonly MapLayerId[],
): number {
  const heats: number[] = [];
  for (const id of active) {
    if (id === "architecture" || id === "dependency") continue;
    const v = signals[id as keyof LayerSignalScores];
    if (typeof v === "number") heats.push(v);
  }
  if (heats.length === 0) return 0;
  return heats.reduce((a, b) => a + b, 0) / heats.length;
}
