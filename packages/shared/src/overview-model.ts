/**
 * Overview dashboard derivations (M-052).
 *
 * These used to live in `@repo-prism/app-shell/overview-model.ts`, which meant the
 * headline numbers on Prism's landing screen — coupling, regions, the most
 * connected files, commit activity — existed only inside a React component and
 * were unreachable from MCP, the CLI, or any script.
 *
 * They live in `@repo-prism/shared` rather than `@repo-prism/core` because the webview
 * cannot import Core (Node-only, better-sqlite3), and one implementation both
 * sides import beats two that agree by luck. Same reasoning as `risk-bands.ts`.
 *
 * Only the *derivations* moved. Colours, SVG geometry and the Markdown report
 * are presentation and stay in the surface.
 */

import type {
  GitDayBucket,
  OverviewActivity,
  OverviewConnectedNode,
  OverviewCoupling,
  OverviewCouplingBand,
  OverviewRegion,
  RepositoryMap,
} from "./schemas.js";

type MapGraph = RepositoryMap["graph"];
type MapNode = MapGraph["nodes"][number];

const DAY_MS = 86_400_000;

/** Region kinds the Overview groups by, in the order the map produces them. */
const REGION_KINDS = new Set(["feature", "package", "folder"]);

/** Node kinds eligible for the "most connected" ranking. */
const CONNECTED_KINDS = new Set(["file", "feature", "package", "folder"]);

/** Regions shown on the dashboard. More than this stops being readable. */
const MAX_REGIONS = 8;

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function degreeByNodeId(graph: MapGraph): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const edge of graph.edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

/** Edges ÷ nodes. Zero when the graph has no nodes, not NaN. */
export function couplingDensity(graph: MapGraph): number {
  return graph.nodes.length > 0 ? graph.edges.length / graph.nodes.length : 0;
}

/** Coupling density → band. Target is below 0.5. */
export function couplingBand(density: number): OverviewCouplingBand {
  if (density < 0.5) return "low";
  if (density < 1) return "medium";
  return "high";
}

/**
 * Coupling density as a 0–100 meter percentage on one shared scale: density
 * 1.0 (one edge per node) fills the meter. Every surface (Overview, DNA, …)
 * uses this so the same density reads identically everywhere.
 */
export function couplingDensityPct(density: number): number {
  return clampPct(density * 100);
}

export function couplingFor(graph: MapGraph): OverviewCoupling {
  const density = couplingDensity(graph);
  return { density, band: couplingBand(density) };
}

/**
 * Files belonging to a region node. The map records this four different ways
 * depending on zoom, so all four are checked before falling back to counting
 * file nodes under the region's root directory.
 */
function regionFileCount(node: MapNode, graph: MapGraph): number {
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (Array.isArray(attrs.memberFiles)) return attrs.memberFiles.length;
  if (typeof attrs.fileCount === "number" && Number.isFinite(attrs.fileCount)) {
    return Math.max(0, Math.round(attrs.fileCount));
  }
  if (typeof attrs.files === "number" && Number.isFinite(attrs.files)) {
    return Math.max(0, Math.round(attrs.files));
  }

  const rootDir = typeof attrs.rootDir === "string" ? attrs.rootDir : undefined;
  if (rootDir === undefined) return 0;
  const prefix =
    rootDir === "" || rootDir === "." ? "" : rootDir.replace(/\/$/, "");

  let count = 0;
  for (const child of graph.nodes) {
    if (child.kind !== "file") continue;
    if (prefix === "") {
      count += 1;
      continue;
    }
    const path = child.id.replace(/^file:/, "");
    if (path === prefix || path.startsWith(`${prefix}/`)) count += 1;
  }
  return count;
}

/** Result of {@link deriveRegions}, including display-cap honesty (M-056). */
export type DeriveRegionsResult = {
  readonly regions: OverviewRegion[];
  readonly truncated: boolean;
  readonly totalCount: number;
};

/**
 * Up to eight regions with a coupling-aware health index.
 *
 * `score` is deliberately nullable: a region with no files and no edges has no
 * evidence behind it, and showing 0 there would read as "very unhealthy"
 * rather than "nothing measured" (ADR-0029).
 *
 * When more than eight region nodes exist, `truncated` is true and `totalCount`
 * is the full group count (M-056 / P-A5).
 */
export function deriveRegions(graph: MapGraph): DeriveRegionsResult {
  const groups = graph.nodes.filter((n) => REGION_KINDS.has(n.kind));
  const degrees = degreeByNodeId(graph);
  const groupDegrees = groups.map((n) => degrees.get(n.id) ?? 0);
  const allDegreesZero = groupDegrees.every((d) => d === 0);
  const maxDegree = Math.max(1, ...degrees.values(), ...groupDegrees);

  const regions = groups.slice(0, MAX_REGIONS).map((node) => {
    const degree = degrees.get(node.id) ?? 0;
    const files = regionFileCount(node, graph);

    let score: number | null;
    if (degree === 0 && files === 0) {
      score = null;
    } else if (allDegreesZero) {
      // This zoom level has no edges at all, so coupling says nothing here.
      score = files > 0 ? 70 : null;
    } else {
      score = clampPct(100 - (degree / maxDegree) * 55);
    }

    return { id: node.id, label: node.label, files, degree, score };
  });

  return {
    regions,
    truncated: groups.length > regions.length,
    totalCount: groups.length,
  };
}

/**
 * Nodes ranked by dependency degree across every edge in the graph — not just
 * region edges, which are sparse at package zoom.
 */
export function deriveMostConnected(
  graph: MapGraph,
  limit = 5,
): OverviewConnectedNode[] {
  const degrees = degreeByNodeId(graph);
  return graph.nodes
    .filter((n) => CONNECTED_KINDS.has(n.kind) && (degrees.get(n.id) ?? 0) > 0)
    .map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      degree: degrees.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

/** Floor an epoch-ms to UTC midnight. */
export function floorToUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Floor an epoch-ms to local midnight. DST-safe (does not use 864e5 steps). */
export function floorToLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Shift a local-midnight timestamp by whole calendar days. */
export function addLocalDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Local calendar `YYYY-MM-DD` for an epoch-ms (for date inputs and git day keys). */
export function formatDayKey(ms: number): string {
  const d = new Date(ms);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Parse a `YYYY-MM-DD` key to local-midnight epoch-ms; NaN when unparseable.
 * Git day buckets use the author-date ISO prefix (`%aI`.slice(0, 10)), which
 * is the author's calendar day — matching local midnight, not UTC.
 */
export function parseDayMs(date: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim().slice(0, 10));
  if (!match) return Number.NaN;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return Number.NaN;
  }
  return parsed.getTime();
}

/** Inclusive local-day bounds for an N-day window ending today. */
export function presetBounds(
  days: number,
  nowMs: number = Date.now(),
): { startMs: number; endMs: number } {
  const endMs = floorToLocalDay(nowMs);
  return {
    startMs: addLocalDays(endMs, -(Math.max(1, days) - 1)),
    endMs,
  };
}

/** Above this span the sparkline rolls up weekly so it stays readable. */
const DAILY_SPAN_LIMIT_DAYS = 56;
const MAX_WINDOW_DAYS = 4000;

function enumerateLocalDays(startMs: number, endMs: number): number[] {
  const start = floorToLocalDay(startMs);
  const end = floorToLocalDay(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return [];
  }
  const out: number[] = [];
  let cursor = start;
  while (cursor <= end && out.length < MAX_WINDOW_DAYS) {
    out.push(cursor);
    cursor = addLocalDays(cursor, 1);
  }
  return out;
}

/**
 * Bucket a daily commit histogram into the inclusive `[startMs, endMs]`
 * window, zero-filled so gaps read as quiet days rather than missing data.
 * Windows are local calendar days so "1W inclusive of today" matches the
 * git author-date keys and the labels on the chart.
 */
export function bucketActivity(
  days: readonly GitDayBucket[],
  startMs: number,
  endMs: number,
): OverviewActivity {
  const dayStarts = enumerateLocalDays(startMs, endMs);
  if (dayStarts.length === 0) {
    return { buckets: [], starts: [], total: 0, granularity: "day" };
  }

  const spanDays = dayStarts.length;
  const granularity = spanDays <= DAILY_SPAN_LIMIT_DAYS ? "day" : "week";
  const indexByKey = new Map(
    dayStarts.map((ms, index) => [formatDayKey(ms), index] as const),
  );

  if (granularity === "day") {
    const buckets = Array.from({ length: spanDays }, () => 0);
    let total = 0;
    for (const day of days) {
      const idx = indexByKey.get(day.date.slice(0, 10));
      if (idx === undefined) continue;
      buckets[idx] = (buckets[idx] ?? 0) + day.commits;
      total += day.commits;
    }
    return { buckets, starts: dayStarts, total, granularity };
  }

  // Weekly windows rarely divide into whole weeks. A tail bucket covering
  // fewer days than its siblings undercounts commits and renders as a fake
  // drop at the right edge, so fold those days into the previous bucket
  // (which then spans up to two weeks).
  let count = Math.max(1, Math.ceil(spanDays / 7));
  if (count > 1 && spanDays % 7 !== 0) {
    count -= 1;
  }

  const starts = Array.from({ length: count }, (_, i) => dayStarts[i * 7]!);
  const buckets = Array.from({ length: count }, () => 0);
  let total = 0;
  for (const day of days) {
    const dayIndex = indexByKey.get(day.date.slice(0, 10));
    if (dayIndex === undefined) continue;
    const idx = Math.min(count - 1, Math.floor(dayIndex / 7));
    buckets[idx] = (buckets[idx] ?? 0) + day.commits;
    total += day.commits;
  }

  return { buckets, starts, total, granularity };
}
