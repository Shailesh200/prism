/**
 * Client-side Lighthouse / PageSpeed JSON → CWV metrics (no Node deps).
 * Mirrors `@prism/intelligence` `cwvMetricsFromLighthouse` for webview import.
 */

import type {
  CwvMetric,
  CwvMetricId,
  CwvRating,
  CwvReport,
} from "@prism/shared";

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

/** Extract CWV (+ optional TBT) from a Lighthouse LHR or PageSpeed Insights JSON. */
export function metricsFromLighthouseJson(lhr: unknown): {
  metrics: CwvMetric[];
  tbtMs: number | null;
  categoryScores: Record<string, number>;
  url: string;
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

  return { metrics, tbtMs, categoryScores, url };
}

export function cwvReportFromLighthouseJson(
  lhr: unknown,
  source: CwvReport["source"] = "ingest",
): CwvReport {
  const { metrics, categoryScores, url } = metricsFromLighthouseJson(lhr);
  return {
    url,
    collectedAt: new Date().toISOString(),
    source,
    callout:
      "Imported Lighthouse / PageSpeed JSON — Core Web Vitals from the report audits.",
    metrics:
      metrics.length > 0
        ? metrics
        : [
            {
              id: "LCP",
              value: 0,
              unit: "ms",
              rating: "unknown" as const,
            },
          ],
    categoryScores,
    attributions: [],
    rollups: [],
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
    const app = /(?:^|\/)app(\/.*?)\/page\.(tsx?|jsx?)$/i.exec(path);
    if (app) {
      const seg = app[1]!.replace(/\/\([^)]+\)/g, "");
      routes.add(seg === "" ? "/" : seg);
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
