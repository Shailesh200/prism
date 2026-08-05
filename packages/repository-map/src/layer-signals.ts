import {
  combineProvenance,
  hasValue,
  heuristic,
  isTestPath,
  measured,
  unavailable,
  type GitFileSignal,
  type GraphNodeDto,
  type GraphSnapshotDto,
  type IndexSnapshot,
  type JsonValue,
  type MapLayerId,
  type ProvenancedValue,
} from "@prism/shared";

/**
 * Map layer heat, each signal carrying where it came from (ADR-0029).
 *
 * Before M-051 every field was a plain number, and three of them were derived
 * from a hash of the file path — stable across runs, which reads as measurement
 * rather than noise. Signals with no real source are now `unavailable` with a
 * null value; there is no field left to put a fabricated number in.
 */
export type LayerSignalScores = {
  readonly activity: ProvenancedValue;
  readonly ownership: ProvenancedValue;
  readonly debt: ProvenancedValue;
  readonly risk: ProvenancedValue;
  readonly performance: ProvenancedValue;
  readonly coverage: ProvenancedValue;
};

export const LAYER_SIGNAL_KEYS = [
  "activity",
  "ownership",
  "debt",
  "risk",
  "performance",
  "coverage",
] as const satisfies readonly (keyof LayerSignalScores)[];

const EMPTY: LayerSignalScores = {
  activity: unavailable(),
  ownership: unavailable(),
  debt: unavailable(),
  risk: unavailable(),
  performance: unavailable(),
  coverage: unavailable(),
};

/**
 * The set of extension-stripped paths that some test file sits next to or
 * under — `src/cart` when `src/cart.test.ts` or `src/cart/index.test.ts` exists.
 *
 * The coverage question is "does any test path start with `${base}.` or
 * `${base}/`", which used to be answered by scanning every test path for every
 * node. Answering it forwards instead — from each test path, which bases could
 * possibly match it — turns 50k × T string comparisons into one Set lookup per
 * node, and was worth 61 of the 71 seconds a 50k-file map took (M-035).
 *
 * A test path contributes exactly the prefixes that end immediately before a
 * `.` or `/`, which is what makes this equivalent rather than approximate.
 */
function testedBaseIndex(snapshot: IndexSnapshot): ReadonlySet<string> {
  const bases = new Set<string>();
  for (const file of snapshot.files) {
    if (!isTestPath(file.path)) continue;
    const path = file.path;
    for (let i = 0; i < path.length; i++) {
      const char = path[i];
      if (char === "." || char === "/") bases.add(path.slice(0, i));
    }
  }
  return bases;
}

function clamp01(n: number): number {
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Repo-relative path for a graph node. The `file:` id prefix is preferred over
 * the label because labels are frequently basenames — reading `a.ts` as a path
 * missed the indexed file and silently dropped its measured signals.
 */
function pathOf(node: GraphNodeDto): string | null {
  if (typeof node.attrs?.path === "string") return node.attrs.path;
  if (node.id.startsWith("file:")) return node.id.slice("file:".length);
  if (node.kind === "file") return node.label;
  return null;
}

/**
 * Layer heat from the index, dependency graph and local git. No network.
 *
 * `performance` is always unavailable: nothing in the repository measures
 * runtime performance per file. Real performance data arrives through the CWV
 * and bundle-weight ingest paths, which are separate reports.
 */
export function computeLayerSignals(
  snapshot: IndexSnapshot,
  dependencyGraph: GraphSnapshotDto,
  gitSignals?: ReadonlyMap<string, GitFileSignal>,
): ReadonlyMap<string, LayerSignalScores> {
  const byPath = new Map(snapshot.files.map((f) => [f.path, f]));
  const testedBases = testedBaseIndex(snapshot);

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
    const git = gitSignals?.get(path);

    // Diagnostics and parse status are real measurements of this file.
    const debt = file
      ? measured(clamp01(failed * 0.55 + Math.min(1, diag / 4) * 0.45))
      : unavailable();

    // Fan-in is real; treating it as "risk" is an inference rule.
    const risk = heuristic(clamp01((fanIn.get(node.id) ?? 0) / maxFanIn));

    // Coverage gap: whether a matching test file exists is observable. How
    // thoroughly that test covers the file is not, so this is an inference.
    const base = path.replace(/\.[^.]+$/, "");
    const covered = isTestPath(path) || testedBases.has(base);
    const coverage = heuristic(covered ? 0 : 1);

    // Commit recency is measured. Without git there is no activity signal —
    // import count was previously used as a proxy, which measured shape rather
    // than activity.
    const activity = git ? measured(clamp01(git.recency)) : unavailable();

    // Ownership concentration: the share of commits held by the top author is
    // a real measurement. Without git there is nothing to measure.
    const ownership =
      git && git.contributors.length > 0
        ? measured(ownershipConcentration(git))
        : unavailable();

    scores.set(node.id, {
      activity,
      ownership,
      debt,
      risk,
      performance: unavailable(),
      coverage,
    });
  }

  return scores;
}

/**
 * Share of commits attributable to the leading contributor (0–1). High means
 * concentrated knowledge — a bus-factor signal rather than an identity hash.
 */
function ownershipConcentration(git: GitFileSignal): number {
  const total = git.contributors.reduce((sum, c) => sum + c.commits, 0);
  if (total <= 0) return 0;
  const top = Math.max(...git.contributors.map((c) => c.commits));
  return clamp01(top / total);
}

/**
 * Average a signal across members, ignoring members that have no data. A
 * rollup over nothing is unavailable rather than zero.
 */
function avgSignal(
  items: readonly LayerSignalScores[],
  key: keyof LayerSignalScores,
): ProvenancedValue {
  const present = items.map((s) => s[key]).filter(hasValue);
  if (present.length === 0) return unavailable();
  const total = present.reduce((sum, s) => sum + s.value, 0);
  return {
    value: total / present.length,
    provenance: combineProvenance(present.map((s) => s.provenance)),
  };
}

function avgScores(items: readonly LayerSignalScores[]): LayerSignalScores {
  if (items.length === 0) return EMPTY;
  return {
    activity: avgSignal(items, "activity"),
    ownership: avgSignal(items, "ownership"),
    debt: avgSignal(items, "debt"),
    risk: avgSignal(items, "risk"),
    performance: avgSignal(items, "performance"),
    coverage: avgSignal(items, "coverage"),
  };
}

/**
 * Signals keyed by path, sorted by path, so a directory rollup can take a slice
 * instead of a scan. Every path under `prefix` sorts contiguously, so a binary
 * search for the first one bounds the work by the size of that directory rather
 * than the size of the repository.
 */
type SortedSignals = readonly (readonly [string, LayerSignalScores])[];

function signalsUnder(
  sorted: SortedSignals,
  prefix: string,
): LayerSignalScores[] {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid]![0] < prefix) lo = mid + 1;
    else hi = mid;
  }

  const under = `${prefix}/`;
  const rolled: LayerSignalScores[] = [];
  for (let i = lo; i < sorted.length; i++) {
    const [path, score] = sorted[i]!;
    if (!path.startsWith(prefix)) break;
    if (path === prefix || path.startsWith(under)) rolled.push(score);
  }
  return rolled;
}

function scoreForNode(
  node: GraphNodeDto,
  signals: ReadonlyMap<string, LayerSignalScores>,
  byPathSignal: ReadonlyMap<string, LayerSignalScores>,
  sortedByPath: SortedSignals,
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
    return avgScores(signalsUnder(sortedByPath, prefix));
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

  const sortedByPath: SortedSignals = [...byPathSignal.entries()].sort(
    (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
  );

  const nodes = graph.nodes.map((n) => {
    const score = scoreForNode(n, signals, byPathSignal, sortedByPath);
    // Values stay on `layerSignals` so existing consumers keep reading numbers;
    // `layerProvenance` tells a consumer which of them are real. A signal with
    // no data is absent here rather than zero (ADR-0029).
    const layerSignals: Record<string, JsonValue> = {};
    const layerProvenance: Record<string, JsonValue> = {};
    for (const key of LAYER_SIGNAL_KEYS) {
      const signal = score[key];
      layerProvenance[key] = signal.provenance;
      if (hasValue(signal)) layerSignals[key] = signal.value;
    }

    return {
      ...n,
      attrs: {
        ...n.attrs,
        layerSignals,
        layerProvenance,
      },
    };
  });

  return { ...graph, nodes };
}

/**
 * Mean heat across the active layers, or `null` when none of them have data.
 * Returning zero would render "no information" identically to "measured zero".
 */
export function heatForActiveLayers(
  signals: LayerSignalScores,
  active: readonly MapLayerId[],
): number | null {
  const heats: number[] = [];
  for (const id of active) {
    if (id === "architecture" || id === "dependency") continue;
    const signal = signals[id as keyof LayerSignalScores];
    if (signal && hasValue(signal)) heats.push(signal.value);
  }
  if (heats.length === 0) return null;
  return heats.reduce((a, b) => a + b, 0) / heats.length;
}

/** True when no active layer has data for this node. */
export function isHeatUnavailable(
  signals: LayerSignalScores,
  active: readonly MapLayerId[],
): boolean {
  return heatForActiveLayers(signals, active) === null;
}
