/**
 * Overview dashboard derivations (M-052).
 *
 * These used to live in `@prism/app-shell/overview-model.ts`, which meant the
 * headline numbers on Prism's landing screen — coupling, regions, the most
 * connected files, commit activity — existed only inside a React component and
 * were unreachable from MCP, the CLI, or any script.
 *
 * They live in `@prism/shared` rather than `@prism/core` because the webview
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

/**
 * Up to eight regions with a coupling-aware health index.
 *
 * `score` is deliberately nullable: a region with no files and no edges has no
 * evidence behind it, and showing 0 there would read as "very unhealthy"
 * rather than "nothing measured" (ADR-0029).
 */
export function deriveRegions(graph: MapGraph): OverviewRegion[] {
  const groups = graph.nodes.filter((n) => REGION_KINDS.has(n.kind));
  const degrees = degreeByNodeId(graph);
  const groupDegrees = groups.map((n) => degrees.get(n.id) ?? 0);
  const allDegreesZero = groupDegrees.every((d) => d === 0);
  const maxDegree = Math.max(1, ...degrees.values(), ...groupDegrees);

  return groups.slice(0, MAX_REGIONS).map((node) => {
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
      degree: degrees.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

/** Floor an epoch-ms to UTC midnight. */
export function floorToUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Parse a `YYYY-MM-DD` key to UTC-midnight epoch-ms; NaN when unparseable. */
export function parseDayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/** Inclusive UTC-day bounds for an N-day window ending today. */
export function presetBounds(
  days: number,
  nowMs: number = Date.now(),
): { startMs: number; endMs: number } {
  const endMs = floorToUtcDay(nowMs);
  return { startMs: endMs - (days - 1) * DAY_MS, endMs };
}

/** Above this span the sparkline rolls up weekly so it stays readable. */
const DAILY_SPAN_LIMIT_DAYS = 56;

/**
 * Bucket a daily commit histogram into the inclusive `[startMs, endMs]`
 * window, zero-filled so gaps read as quiet days rather than missing data.
 */
export function bucketActivity(
  days: readonly GitDayBucket[],
  startMs: number,
  endMs: number,
): OverviewActivity {
  const start = floorToUtcDay(startMs);
  const end = floorToUtcDay(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { buckets: [], starts: [], total: 0, granularity: "day" };
  }

  const spanDays = Math.round((end - start) / DAY_MS) + 1;
  const granularity = spanDays <= DAILY_SPAN_LIMIT_DAYS ? "day" : "week";
  const unitMs = (granularity === "day" ? 1 : 7) * DAY_MS;
  const count = Math.max(1, Math.ceil(spanDays / (unitMs / DAY_MS)));

  const buckets = Array.from({ length: count }, () => 0);
  const starts = Array.from({ length: count }, (_, i) => start + i * unitMs);
  let total = 0;

  for (const day of days) {
    const ms = parseDayMs(day.date);
    if (Number.isNaN(ms) || ms < start || ms > end) continue;
    const idx = Math.min(count - 1, Math.floor((ms - start) / unitMs));
    buckets[idx] = (buckets[idx] ?? 0) + day.commits;
    total += day.commits;
  }

  return { buckets, starts, total, granularity };
}
