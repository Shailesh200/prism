/**
 * Overview dashboard presentation.
 *
 * The derivations behind these numbers (coupling, regions, ranking, activity
 * bucketing) live in `@repo-prism/shared/overview-model` so Core, MCP and the CLI
 * read the same values the dashboard shows. What stays here is presentation:
 * the palette, the SVG geometry and the Markdown report.
 */

import {
  type OverviewConnectedNode,
  type OverviewRegion,
  type RepositoryMap,
  couplingBand,
  deriveMostConnected as deriveMostConnectedCore,
  deriveRegions as deriveRegionsCore,
} from "@repo-prism/shared";

export {
  bucketActivity,
  couplingDensity,
  couplingDensityPct,
  floorToUtcDay,
  parseDayMs,
  presetBounds,
  type OverviewActivity as ActivityBuckets,
} from "@repo-prism/shared";

type MapGraph = RepositoryMap["graph"];

/** Feature-region dot palette (matches the dashboard accents). */
export const REGION_COLORS = [
  "#00C2C2",
  "#6C63FF",
  "#F59E0B",
  "#F43F5E",
  "#10B981",
  "#A78BFA",
] as const;

/** A Core region plus the palette colour its dot is drawn in. */
export type RegionStat = OverviewRegion & { readonly color: string };

/** A Core ranked node plus the palette colour its dot is drawn in. */
export type ConnectedNode = OverviewConnectedNode & { readonly color: string };

function withColor<T>(items: readonly T[]): (T & { color: string })[] {
  return items.map((item, i) => ({
    ...item,
    color: REGION_COLORS[i % REGION_COLORS.length] as string,
  }));
}

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

const COUPLING_BADGES = {
  low: { label: "Low", tone: "emerald" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "rose" },
} as const satisfies Record<string, { label: string; tone: CouplingTone }>;

/** Coupling density → badge label + tone, using Core's bands (target < 0.50). */
export function couplingBadge(density: number): {
  label: string;
  tone: CouplingTone;
} {
  return COUPLING_BADGES[couplingBand(density)];
}

/** Core regions, painted with the dashboard palette (+ truncation meta). */
export function deriveRegions(graph: MapGraph): {
  regions: RegionStat[];
  truncated: boolean;
  totalCount: number;
} {
  const result = deriveRegionsCore(graph);
  return {
    regions: withColor(result.regions),
    truncated: result.truncated,
    totalCount: result.totalCount,
  };
}

/** Core's degree ranking, painted with the dashboard palette. */
export function deriveMostConnected(
  graph: MapGraph,
  limit = 5,
): ConnectedNode[] {
  return withColor(deriveMostConnectedCore(graph, limit));
}

/** Label for a ranked node; non-file kinds include their map kind. */
export function connectedNodeLabel(
  node: Pick<OverviewConnectedNode, "label" | "kind">,
): string {
  if (node.kind === "file") return node.label;
  const kind = node.kind
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return `${node.label} (${kind})`;
}

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

export type ActivityGeometry = {
  readonly line: string;
  readonly area: string;
  readonly total: number;
  /** `[x, y]` per value — hover markers must use these, never re-derived math. */
  readonly points: readonly (readonly [number, number])[];
};

/**
 * Explicit y-axis domain for {@link activityGeometry}. Defaults to
 * `0..max(1, series max)` — right for counts, wrong for bounded scores (a
 * flat 50/100 would render at the top like 100/100), so score series pass
 * `{ min: 0, max: 100 }`.
 */
export type ActivityDomain = {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
};

export type ReportFactor = { readonly label: string; readonly score: number };
export type ReportConnected = {
  readonly label: string;
  readonly kind: string;
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
    lines.push(`- **Last indexed:** ${input.lastSyncIso}`);
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

  lines.push("## Most connected");
  if (input.mostConnected.length > 0) {
    for (const n of input.mostConnected) {
      lines.push(`- ${connectedNodeLabel(n)} — ${n.degree} links`);
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
  domain?: ActivityDomain,
): ActivityGeometry {
  const min = domain?.min ?? 0;
  const max = domain?.max ?? Math.max(1, ...weeks);
  const span = Math.max(1, max - min);
  const stepX = weeks.length > 1 ? (w - pad * 2) / (weeks.length - 1) : 0;
  const points = weeks.map((v, i) => {
    const x = pad + i * stepX;
    const frac = Math.max(0, Math.min(1, (v - min) / span));
    const y = h - pad - frac * (h - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const lastX = pad + (weeks.length - 1) * stepX;
  const area = `${pad},${h - pad} ${line} ${lastX},${h - pad}`;
  const total = weeks.reduce((a, b) => a + b, 0);
  return { line, area, total, points };
}
