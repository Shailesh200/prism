import type { GitDayBucket, RepositoryMap } from "@prism/shared";

/** Feature-region dot palette (matches the dashboard accents). */
export const REGION_COLORS = [
  "#00C2C2",
  "#6C63FF",
  "#F59E0B",
  "#F43F5E",
  "#10B981",
  "#A78BFA",
] as const;

export type RegionStat = {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly files: number;
  readonly degree: number;
  /** Coupling-aware health; `null` when the region has no files and no edges. */
  readonly score: number | null;
};

export type ConnectedNode = {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly degree: number;
};

/** Human label for a stack domain id (e.g. devops_platform → "Devops"). */
export function domainDisplayName(id: string): string {
  if (id === "devops_platform") return "Devops";
  if (id === "data_ml_ai") return "Data / ML";
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export type CouplingTone = "emerald" | "amber" | "rose";

export function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Score → semantic color (green/teal/amber/rose). */
export function scoreColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#00C2C2";
  if (score >= 40) return "#F59E0B";
  return "#F43F5E";
}

/** Coupling density → badge label + tone (target < 0.50). */
export function couplingBadge(density: number): {
  label: string;
  tone: CouplingTone;
} {
  if (density < 0.5) return { label: "Low", tone: "emerald" };
  if (density < 1) return { label: "Medium", tone: "amber" };
  return { label: "High", tone: "rose" };
}

/** Edge count / node count (0 when there are no nodes). */
export function couplingDensity(graph: RepositoryMap["graph"]): number {
  return graph.nodes.length > 0 ? graph.edges.length / graph.nodes.length : 0;
}

/** Count files for a region node (memberFiles, fileCount/files attrs, or path prefix). */
function regionFileCount(
  n: RepositoryMap["graph"]["nodes"][number],
  graph: RepositoryMap["graph"],
): number {
  const attrs = (n.attrs ?? {}) as Record<string, unknown>;
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
    const path = child.id.replace(/^file:/, "");
    if (prefix === "") {
      count += 1;
      continue;
    }
    if (path === prefix || path.startsWith(`${prefix}/`)) count += 1;
  }
  return count;
}

/** Derive up to 8 feature/package/folder regions with degree + health index. */
export function deriveRegions(graph: RepositoryMap["graph"]): RegionStat[] {
  const groups = graph.nodes.filter(
    (n) => n.kind === "feature" || n.kind === "package" || n.kind === "folder",
  );
  const degreeById = new Map<string, number>();
  for (const e of graph.edges) {
    degreeById.set(e.from, (degreeById.get(e.from) ?? 0) + 1);
    degreeById.set(e.to, (degreeById.get(e.to) ?? 0) + 1);
  }
  const degrees = groups.map((n) => degreeById.get(n.id) ?? 0);
  const allDegreesZero = degrees.every((d) => d === 0);
  const maxDegree = Math.max(1, ...degreeById.values(), ...degrees);
  return groups.slice(0, 8).map((n, i) => {
    const degree = degreeById.get(n.id) ?? 0;
    const files = regionFileCount(n, graph);
    let score: number | null;
    if (degree === 0 && files === 0) {
      score = null;
    } else if (allDegreesZero) {
      // No edges at this zoom — mid score when the region has files.
      score = files > 0 ? 70 : null;
    } else {
      score = clampPct(100 - (degree / maxDegree) * 55);
    }
    return {
      id: n.id,
      label: n.label,
      color: REGION_COLORS[i % REGION_COLORS.length] as string,
      files,
      degree,
      score,
    };
  });
}

const CONNECTED_KINDS = new Set(["file", "feature", "package", "folder"]);

/**
 * Rank file/feature/package nodes by dependency degree across all graph edges.
 * Prefer this over region-only ranking (package-zoom edges are often sparse).
 */
export function deriveMostConnected(
  graph: RepositoryMap["graph"],
  limit = 5,
): ConnectedNode[] {
  const degreeById = new Map<string, number>();
  for (const e of graph.edges) {
    degreeById.set(e.from, (degreeById.get(e.from) ?? 0) + 1);
    degreeById.set(e.to, (degreeById.get(e.to) ?? 0) + 1);
  }
  return graph.nodes
    .filter(
      (n) => CONNECTED_KINDS.has(n.kind) && (degreeById.get(n.id) ?? 0) > 0,
    )
    .map((n) => ({
      id: n.id,
      label: n.label,
      degree: degreeById.get(n.id) ?? 0,
    }))
    .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((n, i) => ({
      ...n,
      color: REGION_COLORS[i % REGION_COLORS.length] as string,
    }));
}

const DAY_MS = 86_400_000;

export type ActivityRangeId = "1w" | "1m" | "3m" | "6m" | "1y" | "custom";

export type ActivityRangePreset = {
  readonly id: Exclude<ActivityRangeId, "custom">;
  readonly label: string;
  /** Window length in calendar days (inclusive of today). */
  readonly days: number;
};

/** Selectable commit-activity windows (plus a custom date range in the UI). */
export const ACTIVITY_RANGES: readonly ActivityRangePreset[] = [
  { id: "1w", label: "1W", days: 7 },
  { id: "1m", label: "1M", days: 30 },
  { id: "3m", label: "3M", days: 90 },
  { id: "6m", label: "6M", days: 180 },
  { id: "1y", label: "1Y", days: 365 },
];

/** Default preset when the dashboard first renders. */
export const DEFAULT_ACTIVITY_RANGE: ActivityRangeId = "1w";

/** Floor an epoch-ms to UTC midnight. */
export function floorToUtcDay(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

/** Parse a `YYYY-MM-DD` day key to UTC-midnight epoch-ms (NaN when invalid). */
export function parseDayMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

/** Inclusive [start, end] UTC-day bounds for an N-day preset ending "now". */
export function presetBounds(
  days: number,
  nowMs: number = Date.now(),
): { startMs: number; endMs: number } {
  const endMs = floorToUtcDay(nowMs);
  const startMs = endMs - (days - 1) * DAY_MS;
  return { startMs, endMs };
}

export type ActivityBuckets = {
  readonly buckets: number[];
  /** UTC-midnight epoch-ms at the start of each bucket (for tooltips/labels). */
  readonly starts: number[];
  readonly total: number;
  readonly granularity: "day" | "week";
};

/**
 * Bucket a daily commit histogram into the inclusive [startMs, endMs] window.
 * Short windows (≤ 8 weeks) stay daily for detail; longer ones roll up weekly
 * so the sparkline never gets noisy. Returns zero-filled buckets + the total.
 */
export function bucketActivity(
  days: readonly GitDayBucket[],
  startMs: number,
  endMs: number,
): ActivityBuckets {
  const start = floorToUtcDay(startMs);
  const end = floorToUtcDay(endMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { buckets: [], starts: [], total: 0, granularity: "day" };
  }
  const spanDays = Math.round((end - start) / DAY_MS) + 1;
  const granularity: "day" | "week" = spanDays <= 56 ? "day" : "week";
  const unitDays = granularity === "day" ? 1 : 7;
  const unitMs = unitDays * DAY_MS;
  const count = Math.max(1, Math.ceil(spanDays / unitDays));
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

export type ActivityGeometry = {
  readonly line: string;
  readonly area: string;
  readonly total: number;
};

export type ReportFactor = { readonly label: string; readonly score: number };
export type ReportConnected = {
  readonly label: string;
  readonly degree: number;
};
export type ReportCommit = {
  readonly sha: string;
  readonly author: string;
  readonly message: string;
  readonly date: string;
};

/** Structured, contract-free input for the client-side Markdown report. */
export type OverviewReportInput = {
  readonly repoLabel: string;
  readonly branch: string;
  readonly generatedAtIso: string;
  readonly lastSyncIso?: string | null;
  readonly health: {
    readonly score: number;
    readonly grade?: string;
    readonly factors: readonly ReportFactor[];
  } | null;
  readonly couplingDensity: number;
  readonly nodes: number;
  readonly edges: number;
  readonly files: number;
  readonly regions: number;
  readonly primaryDomain: string | null;
  readonly detectedDomains: readonly string[];
  readonly mostConnected: readonly ReportConnected[];
  readonly recentActivity: readonly ReportCommit[];
};

/** Build a human-readable Markdown summary of the Overview dashboard. */
export function buildReportMarkdown(input: OverviewReportInput): string {
  const lines: string[] = [];
  lines.push(`# Prism Report — ${input.repoLabel}`);
  lines.push("");
  lines.push(`- **Repository:** ${input.repoLabel}`);
  lines.push(`- **Branch:** ${input.branch}`);
  lines.push(`- **Generated:** ${input.generatedAtIso}`);
  if (input.lastSyncIso) {
    lines.push(`- **Last sync:** ${input.lastSyncIso}`);
  }
  lines.push("");

  lines.push("## Health");
  if (input.health) {
    lines.push(
      `- **Score:** ${input.health.score}/100${
        input.health.grade ? ` (Grade ${input.health.grade})` : ""
      }`,
    );
    if (input.health.factors.length > 0) {
      lines.push("");
      lines.push("| Factor | Score |");
      lines.push("| --- | --- |");
      for (const f of input.health.factors) {
        lines.push(`| ${f.label} | ${Math.round(f.score)} |`);
      }
    }
  } else {
    lines.push("- Health score not yet computed.");
  }
  lines.push("");

  lines.push("## Graph");
  lines.push(
    `- **Coupling density:** ${input.couplingDensity.toFixed(2)} (edges ÷ nodes)`,
  );
  lines.push(`- **Nodes:** ${input.nodes}`);
  lines.push(`- **Edges:** ${input.edges}`);
  lines.push(`- **Files:** ${input.files}`);
  lines.push(`- **Regions:** ${input.regions}`);
  lines.push("");

  lines.push("## Domains");
  lines.push(`- **Primary domain:** ${input.primaryDomain ?? "—"}`);
  lines.push(
    `- **Detected domains:** ${
      input.detectedDomains.length > 0
        ? input.detectedDomains.join(", ")
        : "none detected"
    }`,
  );
  lines.push("");

  lines.push("## Most connected files");
  if (input.mostConnected.length > 0) {
    for (const n of input.mostConnected) {
      lines.push(`- ${n.label} — ${n.degree} links`);
    }
  } else {
    lines.push("- No dependency edges in the current map.");
  }
  lines.push("");

  lines.push("## Recent activity");
  if (input.recentActivity.length > 0) {
    for (const c of input.recentActivity) {
      const msg = c.message || c.sha.slice(0, 7);
      lines.push(`- \`${c.sha.slice(0, 7)}\` ${msg} — ${c.author} (${c.date})`);
    }
  } else {
    lines.push("- No recent commits.");
  }
  lines.push("");

  return lines.join("\n");
}

/** `prism-report-<repo-slug>-<yyyy-mm-dd>.md` (slug is filesystem-safe). */
export function reportFilename(
  repoLabel: string,
  nowMs: number = Date.now(),
): string {
  const slug =
    repoLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "repo";
  const day = new Date(nowMs).toISOString().slice(0, 10);
  return `prism-report-${slug}-${day}.md`;
}

/** SVG polyline/area geometry for the weekly commit-activity sparkline. */
export function activityGeometry(
  weeks: readonly number[],
  w = 600,
  h = 180,
  pad = 8,
): ActivityGeometry {
  const max = Math.max(1, ...weeks);
  const stepX = weeks.length > 1 ? (w - pad * 2) / (weeks.length - 1) : 0;
  const points = weeks.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const lastX = pad + (weeks.length - 1) * stepX;
  const area = `${pad},${h - pad} ${line} ${lastX},${h - pad}`;
  const total = weeks.reduce((a, b) => a + b, 0);
  return { line, area, total };
}
