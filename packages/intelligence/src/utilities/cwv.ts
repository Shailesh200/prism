import {
  type CwvAttribution,
  type CwvMetric,
  type CwvMetricId,
  type CwvRating,
  type CwvReport,
  type CwvRollupBucket,
  type JsonValue,
} from "@prism/shared";

export const LIGHTHOUSE_CALLOUT =
  "Opt-in local Lighthouse: serve the app on a dedicated local PORT; the diagnosis runs asynchronously; the report is shown when ready (ADR-0008).";

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

/**
 * Extract CWV metrics from a Lighthouse LHR-like JSON object (FE-02).
 */
export function cwvMetricsFromLighthouse(lhr: unknown): CwvMetric[] {
  const root = asRecord(lhr);
  const audits = asRecord(root?.audits);
  if (!audits) return [];

  const metrics: CwvMetric[] = [];
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
  return metrics;
}

function categoryScoresFromLighthouse(lhr: unknown): Record<string, number> {
  const cats = asRecord(asRecord(lhr)?.categories);
  if (!cats) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(cats)) {
    const score = asRecord(value)?.score;
    if (typeof score === "number") out[key] = score;
  }
  return out;
}

/**
 * Build attribution entries from optional marks on the LHR / ingest payload.
 * Component level only when explicitly present (ADR-0008 D2).
 */
export function attributionsFromPayload(payload: unknown): CwvAttribution[] {
  const root = asRecord(payload);
  const raw = root?.attributions;
  if (!Array.isArray(raw)) return [];
  const out: CwvAttribution[] = [];
  for (const item of raw) {
    const rec = asRecord(item);
    if (!rec) continue;
    const row: CwvAttribution = {
      ...(typeof rec.app === "string" ? { app: rec.app } : {}),
      ...(typeof rec.route === "string" ? { route: rec.route } : {}),
      ...(typeof rec.chunk === "string" ? { chunk: rec.chunk } : {}),
      ...(typeof rec.component === "string"
        ? { component: rec.component }
        : {}),
      ...(typeof rec.metricId === "string"
        ? { metricId: rec.metricId as CwvMetricId }
        : {}),
      ...(typeof rec.note === "string" ? { note: rec.note } : {}),
    };
    if (row.app || row.route || row.chunk || row.component) out.push(row);
  }
  return out;
}

/**
 * Roll up attributions to app → route → chunk → component (FE-03).
 * Component buckets omitted when no component attribution exists.
 */
export function buildCwvRollups(
  metrics: readonly CwvMetric[],
  attributions: readonly CwvAttribution[],
): CwvRollupBucket[] {
  const buckets = new Map<string, CwvRollupBucket>();

  const add = (
    level: CwvRollupBucket["level"],
    key: string,
    metricSubset: readonly CwvMetric[],
  ) => {
    const id = `${level}:${key}`;
    const existing = buckets.get(id);
    if (existing) {
      buckets.set(id, {
        ...existing,
        sampleCount: existing.sampleCount + 1,
      });
      return;
    }
    buckets.set(id, {
      key,
      level,
      metrics: [...metricSubset],
      sampleCount: 1,
    });
  };

  if (attributions.length === 0) {
    add("app", "workspace", metrics);
    return [...buckets.values()];
  }

  for (const attr of attributions) {
    const subset =
      attr.metricId !== undefined
        ? metrics.filter((m) => m.id === attr.metricId)
        : metrics;
    if (attr.app) add("app", attr.app, subset);
    if (attr.route) add("route", attr.route, subset);
    if (attr.chunk) add("chunk", attr.chunk, subset);
    if (attr.component) add("component", attr.component, subset);
  }

  return [...buckets.values()].sort((a, b) => {
    const order = { app: 0, route: 1, chunk: 2, component: 3 };
    const d = order[a.level] - order[b.level];
    return d !== 0 ? d : a.key.localeCompare(b.key);
  });
}

export type BuildCwvReportInput = {
  readonly url: string;
  readonly source: CwvReport["source"];
  readonly lighthouseOrPayload: unknown;
  readonly port?: number;
  readonly collectedAt?: string;
};

export function buildCwvReport(input: BuildCwvReportInput): CwvReport {
  const metrics = cwvMetricsFromLighthouse(input.lighthouseOrPayload);
  const attributions = attributionsFromPayload(input.lighthouseOrPayload);
  const rollups = buildCwvRollups(metrics, attributions);
  const categoryScores = categoryScoresFromLighthouse(
    input.lighthouseOrPayload,
  );
  const finalMetrics =
    metrics.length > 0
      ? metrics
      : ([
          {
            id: "LCP",
            value: 0,
            unit: "ms",
            rating: "unknown",
          },
        ] satisfies CwvMetric[]);

  return {
    url: input.url,
    collectedAt: input.collectedAt ?? new Date().toISOString(),
    source: input.source,
    ...(input.port === undefined ? {} : { port: input.port }),
    callout: LIGHTHOUSE_CALLOUT,
    metrics: finalMetrics,
    categoryScores,
    attributions,
    rollups,
  };
}

/** Deterministic lab fixture LHR fragment for CI (no Chrome required). */
export function labFixtureLighthouseJson(options: {
  readonly url: string;
}): JsonValue {
  return {
    requestedUrl: options.url,
    finalUrl: options.url,
    fetchTime: new Date().toISOString(),
    categories: {
      performance: { score: 0.92 },
      accessibility: { score: 0.96 },
    },
    audits: {
      "largest-contentful-paint": {
        numericValue: 1800,
        score: 0.95,
      },
      "cumulative-layout-shift": {
        numericValue: 0.02,
        score: 0.98,
      },
      "interaction-to-next-paint": {
        numericValue: 160,
        score: 0.93,
      },
      "first-contentful-paint": {
        numericValue: 900,
        score: 0.97,
      },
      "server-response-time": {
        numericValue: 120,
        score: 0.99,
      },
    },
    attributions: [
      {
        app: "web",
        route: "/",
        chunk: "main",
        component: "Hero",
        metricId: "LCP",
        note: "lab-fixture attribution",
      },
      {
        app: "web",
        route: "/checkout",
        chunk: "checkout",
        metricId: "INP",
        note: "route-level only (no component)",
      },
    ],
  };
}
