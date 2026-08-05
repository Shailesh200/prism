/**
 * Client-side Lighthouse / PageSpeed JSON → CWV metrics (no Node deps).
 * Mirrors `@repo-prism/intelligence` CWV helpers for webview import.
 */

import type {
  CwvInsight,
  CwvInsightSeverity,
  CwvMetric,
  CwvMetricId,
  CwvRating,
  CwvReport,
  JsonValue,
} from "@repo-prism/shared";
import { CwvRouteLabProgressDetailSchema } from "@repo-prism/shared";
import type { LighthouseLabProgressEvent } from "./client.js";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function ratingFromScore(score: number | null | undefined): CwvRating {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "unknown";
  }
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "needs-improvement";
  return "poor";
}

function pickNumeric(
  audits: Record<string, unknown>,
  id: string,
): number | null {
  const audit = asRecord(audits[id]);
  if (!audit) return null;
  const numeric = audit.numericValue;
  return typeof numeric === "number" ? numeric : null;
}

function pickScore(audits: Record<string, unknown>, id: string): number | null {
  const audit = asRecord(audits[id]);
  if (!audit) return null;
  const score = audit.score;
  return typeof score === "number" ? score : null;
}

function metric(
  id: CwvMetricId,
  value: number | null,
  unit: string,
  score: number | null,
): CwvMetric | null {
  if (value === null) return null;
  return {
    id,
    value,
    unit,
    rating: ratingFromScore(score),
  };
}

function stripHtmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isTruncatedLabel(value: string): boolean {
  return /[…\u2026]$|\.\.\.$/.test(value.trim());
}

/** Prefer full Lighthouse node text — `nodeLabel` is often ellipsis-truncated. */
function nodeLabel(node: Record<string, unknown> | null): string | null {
  if (!node) return null;
  const candidates: string[] = [];
  if (typeof node.nodeLabel === "string" && node.nodeLabel.trim()) {
    candidates.push(node.nodeLabel.trim());
  }
  if (typeof node.snippet === "string" && node.snippet.trim()) {
    const plain = stripHtmlText(node.snippet);
    if (plain) candidates.push(plain);
  }
  if (typeof node.selector === "string" && node.selector.trim()) {
    candidates.push(node.selector.trim());
  }
  if (candidates.length === 0) return null;
  const full = [...candidates]
    .filter((c) => !isTruncatedLabel(c))
    .sort((a, b) => b.length - a.length)[0];
  const best =
    full ?? [...candidates].sort((a, b) => b.length - a.length)[0] ?? null;
  return best ? best.slice(0, 2000) : null;
}

function collectNodes(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || out.length >= 4) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  if (rec.type === "node" || rec.node) {
    const n = rec.type === "node" ? rec : asRecord(rec.node);
    const label = nodeLabel(n);
    if (label && !out.includes(label)) out.push(label);
  }
  for (const child of Object.values(rec)) {
    if (typeof child === "object" && child !== null) {
      collectNodes(child, out, depth + 1);
    }
  }
}

function severityFromScore(score: number | null): CwvInsightSeverity {
  if (score === null) return "info";
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "improve";
  return "pain";
}

function metricIdForAudit(auditId: string): CwvMetricId | undefined {
  if (/largest-contentful-paint|lcp/i.test(auditId)) return "LCP";
  if (/layout-shift|cls/i.test(auditId)) return "CLS";
  if (/interaction-to-next-paint|inp|total-blocking-time/i.test(auditId)) {
    return "INP";
  }
  if (/first-contentful-paint|fcp/i.test(auditId)) return "FCP";
  if (/server-response-time|ttfb/i.test(auditId)) return "TTFB";
  if (
    /render-blocking|unused-javascript|unused-css|bootup-time|mainthread/i.test(
      auditId,
    )
  ) {
    return "LCP";
  }
  return undefined;
}

function insightsFromAudits(
  audits: Record<string, unknown>,
  metrics: readonly CwvMetric[],
): CwvInsight[] {
  const out: CwvInsight[] = [];
  const seen = new Set<string>();
  const push = (insight: CwvInsight): void => {
    if (seen.has(insight.id)) return;
    seen.add(insight.id);
    out.push(insight);
  };

  for (const m of metrics) {
    if (m.rating === "poor") {
      push({
        id: `metric-${m.id}-poor`,
        metricId: m.id,
        severity: "pain",
        title: `${m.id} is poor`,
        detail: `Lab value exceeds the “poor” threshold for ${m.id}.`,
      });
    } else if (m.rating === "needs-improvement") {
      push({
        id: `metric-${m.id}-improve`,
        metricId: m.id,
        severity: "improve",
        title: `${m.id} needs work`,
        detail: `Lab value is in the “needs improvement” band for ${m.id}.`,
      });
    } else if (m.rating === "good") {
      push({
        id: `metric-${m.id}-good`,
        metricId: m.id,
        severity: "good",
        title: `${m.id} is good`,
        detail: `Lab value meets the “good” threshold for ${m.id}.`,
      });
    }
  }

  const lcpEl = asRecord(audits["largest-contentful-paint-element"]);
  if (lcpEl) {
    const labels: string[] = [];
    collectNodes(lcpEl.details, labels);
    push({
      id: "audit-largest-contentful-paint-element",
      metricId: "LCP",
      severity: severityFromScore(
        typeof lcpEl.score === "number" ? lcpEl.score : null,
      ),
      title:
        typeof lcpEl.title === "string"
          ? lcpEl.title
          : "Largest Contentful Paint element",
      detail:
        labels.length > 0 ? `LCP element: ${labels.join(" · ")}` : undefined,
      auditId: "largest-contentful-paint-element",
    });
  }

  for (const [auditId, raw] of Object.entries(audits)) {
    const audit = asRecord(raw);
    if (!audit) continue;
    const details = asRecord(audit.details);
    if (details?.type !== "opportunity") continue;
    if (typeof audit.score !== "number" || audit.score >= 1) continue;
    const savingsMs =
      typeof details.overallSavingsMs === "number"
        ? details.overallSavingsMs
        : null;
    const title =
      typeof audit.title === "string"
        ? audit.title
        : auditId.replace(/-/g, " ");
    push({
      id: `opp-${auditId}`,
      metricId: metricIdForAudit(auditId),
      severity: audit.score < 0.5 ? "pain" : "improve",
      title,
      detail:
        savingsMs !== null && savingsMs > 0
          ? savingsMs >= 1000
            ? `~${(savingsMs / 1000).toFixed(1)}s potential savings`
            : `~${Math.round(savingsMs)}ms potential savings`
          : undefined,
      auditId,
    });
  }

  const order: Record<CwvInsightSeverity, number> = {
    pain: 0,
    improve: 1,
    good: 2,
    info: 3,
  };
  return out
    .sort((a, b) => {
      const d = order[a.severity] - order[b.severity];
      return d !== 0 ? d : a.title.localeCompare(b.title);
    })
    .slice(0, 40);
}

function routeKeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return "/";
  }
}

/** Extract CWV (+ optional TBT) from a Lighthouse LHR or PageSpeed Insights JSON. */
export function metricsFromLighthouseJson(lhr: unknown): {
  metrics: CwvMetric[];
  tbtMs: number | null;
  categoryScores: Record<string, number>;
  url: string;
  insights: CwvInsight[];
} {
  // PageSpeed wraps LHR under lighthouseResult
  const root =
    asRecord(asRecord(lhr)?.lighthouseResult) ?? asRecord(lhr) ?? null;
  const audits = asRecord(root?.audits);
  const metrics: CwvMetric[] = [];
  let tbtMs: number | null = null;
  const categoryScores: Record<string, number> = {};

  if (audits) {
    const lcp = metric(
      "LCP",
      pickNumeric(audits, "largest-contentful-paint"),
      "ms",
      pickScore(audits, "largest-contentful-paint"),
    );
    const cls = metric(
      "CLS",
      pickNumeric(audits, "cumulative-layout-shift"),
      "score",
      pickScore(audits, "cumulative-layout-shift"),
    );
    const inp = metric(
      "INP",
      pickNumeric(audits, "interaction-to-next-paint") ??
        pickNumeric(audits, "experimental-interaction-to-next-paint"),
      "ms",
      pickScore(audits, "interaction-to-next-paint") ??
        pickScore(audits, "experimental-interaction-to-next-paint"),
    );
    const fcp = metric(
      "FCP",
      pickNumeric(audits, "first-contentful-paint"),
      "ms",
      pickScore(audits, "first-contentful-paint"),
    );
    const ttfb = metric(
      "TTFB",
      pickNumeric(audits, "server-response-time"),
      "ms",
      pickScore(audits, "server-response-time"),
    );
    for (const m of [lcp, cls, inp, fcp, ttfb]) {
      if (m) metrics.push(m);
    }
    tbtMs = pickNumeric(audits, "total-blocking-time");
  }

  const cats = asRecord(root?.categories);
  if (cats) {
    for (const [key, value] of Object.entries(cats)) {
      const score = asRecord(value)?.score;
      if (typeof score === "number") categoryScores[key] = score;
    }
  }

  const url =
    (typeof root?.finalUrl === "string" && root.finalUrl) ||
    (typeof root?.requestedUrl === "string" && root.requestedUrl) ||
    (typeof asRecord(lhr)?.id === "string" && (asRecord(lhr)!.id as string)) ||
    "imported";

  const insights = audits ? insightsFromAudits(audits, metrics) : [];

  return { metrics, tbtMs, categoryScores, url, insights };
}

export function cwvReportFromLighthouseJson(
  lhr: unknown,
  source: CwvReport["source"] = "ingest",
): CwvReport {
  const { metrics, categoryScores, url, tbtMs, insights } =
    metricsFromLighthouseJson(lhr);
  const route = routeKeyFromUrl(url);
  const finalMetrics =
    metrics.length > 0
      ? metrics
      : [
          {
            id: "LCP" as const,
            value: 0,
            unit: "ms",
            rating: "unknown" as const,
          },
        ];
  return {
    url,
    collectedAt: new Date().toISOString(),
    source,
    callout:
      "Imported Lighthouse / PageSpeed JSON — Core Web Vitals from the report audits.",
    metrics: finalMetrics,
    categoryScores,
    attributions: [],
    rollups: [
      {
        key: route,
        level: "route",
        metrics: finalMetrics,
        sampleCount: 1,
      },
    ],
    ...(tbtMs === null ? {} : { tbtMs }),
    insights,
  };
}

/** Heuristic Next.js / pages routes from DNA signals or path markers. */
export function heuristicFrontendRoutes(
  dnaSignals: readonly string[] | undefined,
  fileHints: readonly string[] | undefined,
): string[] {
  const routes = new Set<string>();
  for (const s of dnaSignals ?? []) {
    if (/^frontend-/i.test(s)) {
      /* framework signal only */
    }
  }
  for (const path of fileHints ?? []) {
    const app = /(?:^|\/)app(?:(\/.*?))?\/page\.(tsx?|jsx?)$/i.exec(path);
    if (app) {
      const seg = (app[1] ?? "")
        .replace(/\/\([^)]+\)/g, "")
        .replace(/\/@[A-Za-z0-9_-]+/g, "");
      routes.add(seg === "" ? "/" : seg.startsWith("/") ? seg : `/${seg}`);
      continue;
    }
    const pages = /(?:^|\/)pages(\/.*?)\.(tsx?|jsx?)$/i.exec(path);
    if (pages) {
      let seg = pages[1]!.replace(/\/index$/i, "");
      if (seg.startsWith("/_")) continue;
      if (seg === "") seg = "/";
      routes.add(seg);
    }
  }
  if (routes.size === 0) routes.add("/");
  return [...routes].sort((a, b) => a.localeCompare(b));
}

export function formatCwvValue(m: CwvMetric): string {
  if (m.id === "CLS") return m.value.toFixed(3);
  if (m.unit === "ms") {
    if (m.value >= 1000) return `${(m.value / 1000).toFixed(2)}s`;
    return `${Math.round(m.value)}ms`;
  }
  return String(m.value);
}

export function ratingLabel(rating: CwvRating | undefined): string {
  if (rating === "good") return "Good";
  if (rating === "needs-improvement") return "Needs work";
  if (rating === "poor") return "Poor";
  return "No data";
}

/** Threshold → color class (defined in domain-extra.css). */
export function ratingClass(rating: CwvRating | undefined): string {
  if (rating === "good") return "dm-rating--good";
  if (rating === "needs-improvement") return "dm-rating--warn";
  if (rating === "poor") return "dm-rating--poor";
  return "dm-rating--na";
}

/** Map a Lighthouse 0–1 category/audit score to a CWV rating band. */
export function scoreRating(score: number | null | undefined): CwvRating {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return "unknown";
  }
  if (score >= 0.9) return "good";
  if (score >= 0.5) return "needs-improvement";
  return "poor";
}

/** Lighthouse category display metadata (order + friendly labels + tips). */
export const LIGHTHOUSE_CATEGORIES: {
  id: string;
  label: string;
  desc: string;
}[] = [
  {
    id: "performance",
    label: "Performance",
    desc: "Lab performance score from Lighthouse audits (weighted CWV + timings).",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    desc: "Automated accessibility checks (contrast, labels, roles). Not a full a11y audit.",
  },
  {
    id: "best-practices",
    label: "Best Practices",
    desc: "Security, correctness, and modern-web best-practice audits.",
  },
  {
    id: "seo",
    label: "SEO",
    desc: "Basic search-engine optimization checks (meta, crawlability, mobile).",
  },
];

/** Normalize host/job progress into the AppShell lab progress event shape. */
export function lighthouseProgressFromJobEvent(event: {
  readonly message: string;
  readonly detail?: JsonValue;
}): LighthouseLabProgressEvent {
  const parsed = CwvRouteLabProgressDetailSchema.safeParse(event.detail);
  if (!parsed.success) {
    return { message: event.message };
  }
  return {
    message: event.message,
    measuringRoute: parsed.data.measuringRoute,
    measuredRoutes: parsed.data.measuredRoutes,
    ...(parsed.data.report ? { report: parsed.data.report } : {}),
  };
}
