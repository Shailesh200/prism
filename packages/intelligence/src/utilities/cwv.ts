import {
  type CwvAttribution,
  type CwvInsight,
  type CwvInsightSeverity,
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

/** Total Blocking Time (ms) from LHR — lab proxy for responsiveness. */
export function tbtMsFromLighthouse(lhr: unknown): number | undefined {
  const audits = asRecord(asRecord(lhr)?.audits);
  if (!audits) return undefined;
  const value = pickNumeric(audits, "total-blocking-time");
  return value === null ? undefined : value;
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

/** Pathname of the measured lab URL (e.g. `/` or `/checkout`). */
export function routeKeyFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname || "/";
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  } catch {
    return "/";
  }
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

/**
 * Prefer full text from Lighthouse nodes. `nodeLabel` is often truncated with
 * an ellipsis; `snippet` usually has the complete cookie/banner copy.
 */
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
  // Keep enough for cookie banners / long LCP copy; UI wraps the text.
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

/**
 * Derive actionable insights from LHR audits (elements + opportunities).
 * Never invents React component names — uses selectors / snippets only.
 */
export function insightsFromLighthouse(
  lhr: unknown,
  metrics: readonly CwvMetric[],
): CwvInsight[] {
  const audits = asRecord(asRecord(lhr)?.audits);
  if (!audits) return [];
  const out: CwvInsight[] = [];
  const seen = new Set<string>();

  const push = (insight: CwvInsight): void => {
    if (seen.has(insight.id)) return;
    seen.add(insight.id);
    out.push(insight);
  };

  // Metric ratings → high-level bands.
  for (const m of metrics) {
    if (m.rating === "poor") {
      push({
        id: `metric-${m.id}-poor`,
        metricId: m.id,
        severity: "pain",
        title: `${m.id} is poor`,
        detail: `Lab value exceeds the “poor” threshold for ${m.id}.`,
        auditId: m.id.toLowerCase(),
      });
    } else if (m.rating === "needs-improvement") {
      push({
        id: `metric-${m.id}-improve`,
        metricId: m.id,
        severity: "improve",
        title: `${m.id} needs work`,
        detail: `Lab value is in the “needs improvement” band for ${m.id}.`,
        auditId: m.id.toLowerCase(),
      });
    } else if (m.rating === "good") {
      push({
        id: `metric-${m.id}-good`,
        metricId: m.id,
        severity: "good",
        title: `${m.id} is good`,
        detail: `Lab value meets the “good” threshold for ${m.id}.`,
        auditId: m.id.toLowerCase(),
      });
    }
  }

  // LCP element
  const lcpEl = asRecord(audits["largest-contentful-paint-element"]);
  if (lcpEl) {
    const labels: string[] = [];
    collectNodes(lcpEl.details, labels);
    const lcpMetric = metrics.find((m) => m.id === "LCP");
    push({
      id: "audit-largest-contentful-paint-element",
      metricId: "LCP",
      severity: severityFromScore(
        typeof lcpEl.score === "number"
          ? lcpEl.score
          : lcpMetric
            ? lcpMetric.rating === "good"
              ? 1
              : lcpMetric.rating === "needs-improvement"
                ? 0.6
                : 0.2
            : null,
      ),
      title:
        typeof lcpEl.title === "string"
          ? lcpEl.title
          : "Largest Contentful Paint element",
      detail:
        labels.length > 0
          ? `LCP element: ${labels.join(" · ")}`
          : typeof lcpEl.description === "string"
            ? lcpEl.description.slice(0, 2000)
            : undefined,
      auditId: "largest-contentful-paint-element",
    });
  }

  // Layout shift nodes
  for (const auditId of ["layout-shifts", "layout-shift-elements"]) {
    const audit = asRecord(audits[auditId]);
    if (!audit) continue;
    const labels: string[] = [];
    collectNodes(audit.details, labels);
    if (labels.length === 0 && typeof audit.score !== "number") continue;
    push({
      id: `audit-${auditId}`,
      metricId: "CLS",
      severity: severityFromScore(
        typeof audit.score === "number" ? audit.score : null,
      ),
      title:
        typeof audit.title === "string" ? audit.title : "Layout shift elements",
      detail:
        labels.length > 0
          ? `Shifting nodes: ${labels.slice(0, 3).join(" · ")}`
          : undefined,
      auditId,
    });
  }

  // Opportunities (score < 1)
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
    const savingsBytes =
      typeof details.overallSavingsBytes === "number"
        ? details.overallSavingsBytes
        : null;
    const title =
      typeof audit.title === "string"
        ? audit.title
        : auditId.replace(/-/g, " ");
    const parts: string[] = [];
    if (savingsMs !== null && savingsMs > 0) {
      parts.push(
        savingsMs >= 1000
          ? `~${(savingsMs / 1000).toFixed(1)}s potential savings`
          : `~${Math.round(savingsMs)}ms potential savings`,
      );
    }
    if (savingsBytes !== null && savingsBytes > 0) {
      parts.push(`~${Math.round(savingsBytes / 1024)} KiB`);
    }
    const items = Array.isArray(details.items) ? details.items : [];
    const firstUrl = asRecord(items[0])?.url;
    if (typeof firstUrl === "string") {
      try {
        parts.push(new URL(firstUrl).pathname);
      } catch {
        parts.push(firstUrl.slice(0, 80));
      }
    }
    push({
      id: `opp-${auditId}`,
      metricId: metricIdForAudit(auditId),
      severity: audit.score < 0.5 ? "pain" : "improve",
      title,
      detail: parts.length > 0 ? parts.join(" · ") : undefined,
      auditId,
    });
  }

  // Cap for UI density
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

/**
 * Element-level attributions from LHR (selectors / snippets — not React names).
 */
export function attributionsFromLighthouseAudits(
  lhr: unknown,
  route: string,
): CwvAttribution[] {
  const audits = asRecord(asRecord(lhr)?.audits);
  if (!audits) return [];
  const out: CwvAttribution[] = [];

  const lcpEl = asRecord(audits["largest-contentful-paint-element"]);
  if (lcpEl) {
    const labels: string[] = [];
    collectNodes(lcpEl.details, labels);
    if (labels[0]) {
      out.push({
        route,
        metricId: "LCP",
        note: `LCP element: ${labels[0]}`,
      });
    }
  }

  for (const auditId of ["layout-shifts", "layout-shift-elements"]) {
    const audit = asRecord(audits[auditId]);
    if (!audit) continue;
    const labels: string[] = [];
    collectNodes(audit.details, labels);
    for (const label of labels.slice(0, 3)) {
      out.push({
        route,
        metricId: "CLS",
        note: `Layout shift: ${label}`,
      });
    }
  }

  return out;
}

/**
 * Roll up attributions to app → route → chunk → component (FE-03).
 * Component buckets omitted when no component attribution exists.
 * Always includes a route bucket for the measured URL when provided.
 */
export function buildCwvRollups(
  metrics: readonly CwvMetric[],
  attributions: readonly CwvAttribution[],
  measuredRoute?: string,
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

  if (measuredRoute) {
    add("route", measuredRoute, metrics);
    add("app", "workspace", metrics);
  }

  if (attributions.length === 0) {
    if (!measuredRoute) add("app", "workspace", metrics);
    return [...buckets.values()].sort((a, b) => {
      const order = { app: 0, route: 1, chunk: 2, component: 3 };
      const d = order[a.level] - order[b.level];
      return d !== 0 ? d : a.key.localeCompare(b.key);
    });
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
  const measuredRoute = routeKeyFromUrl(input.url);
  const payloadAttrs = attributionsFromPayload(input.lighthouseOrPayload);
  const auditAttrs = attributionsFromLighthouseAudits(
    input.lighthouseOrPayload,
    measuredRoute,
  );
  const attributions = [...payloadAttrs, ...auditAttrs];
  const rollups = buildCwvRollups(metrics, attributions, measuredRoute);
  const categoryScores = categoryScoresFromLighthouse(
    input.lighthouseOrPayload,
  );
  const tbtMs = tbtMsFromLighthouse(input.lighthouseOrPayload);
  const insights = insightsFromLighthouse(input.lighthouseOrPayload, metrics);
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
    ...(tbtMs === undefined ? {} : { tbtMs }),
    insights,
  };
}

function medianNumber(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function lcpNumeric(report: unknown): number | null {
  const root = asRecord(report);
  const audits = asRecord(root?.audits);
  if (!audits) return null;
  return pickNumeric(audits, "largest-contentful-paint");
}

/**
 * Merge multiple Lighthouse JSON reports by taking the **median** of numeric
 * audit values and category scores (PSI-style stability). Detail audits
 * (LCP element, opportunities) come from the run whose LCP is closest to the
 * median LCP so insights stay coherent with the scored metrics.
 */
export function medianMergeLighthouseReports(
  reports: readonly unknown[],
): unknown {
  if (reports.length === 0) {
    throw new Error(
      "medianMergeLighthouseReports requires at least one report",
    );
  }
  if (reports.length === 1) return reports[0];

  const lcps = reports.map((r) => lcpNumeric(r));
  const numericLcps = lcps.filter((v): v is number => typeof v === "number");
  const medianLcp = numericLcps.length > 0 ? medianNumber(numericLcps) : null;

  let detailIdx = 0;
  if (medianLcp !== null) {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < reports.length; i++) {
      const v = lcps[i];
      if (typeof v !== "number") continue;
      const d = Math.abs(v - medianLcp);
      if (d < best) {
        best = d;
        detailIdx = i;
      }
    }
  }

  const base = JSON.parse(JSON.stringify(reports[detailIdx])) as Record<
    string,
    unknown
  >;
  const baseAudits = asRecord(base.audits) ?? {};
  base.audits = baseAudits;

  const auditIds = new Set<string>();
  for (const report of reports) {
    const audits = asRecord(asRecord(report)?.audits);
    if (!audits) continue;
    for (const id of Object.keys(audits)) auditIds.add(id);
  }

  for (const id of auditIds) {
    const numericValues: number[] = [];
    const scoreValues: number[] = [];
    for (const report of reports) {
      const audit = asRecord(asRecord(asRecord(report)?.audits)?.[id]);
      if (!audit) continue;
      if (typeof audit.numericValue === "number") {
        numericValues.push(audit.numericValue);
      }
      if (typeof audit.score === "number") {
        scoreValues.push(audit.score);
      }
    }
    const target = asRecord(baseAudits[id]) ?? { id };
    if (numericValues.length > 0) {
      const med = medianNumber(numericValues);
      target.numericValue = med;
      if (
        typeof target.numericUnit === "string" &&
        target.numericUnit === "millisecond"
      ) {
        target.displayValue =
          med >= 1000
            ? `${(med / 1000).toFixed(1)}\u00a0s`
            : `${Math.round(med)}\u00a0ms`;
      }
    }
    if (scoreValues.length > 0) {
      target.score = medianNumber(scoreValues);
    }
    baseAudits[id] = target;
  }

  const baseCats = asRecord(base.categories) ?? {};
  base.categories = baseCats;
  const catIds = new Set<string>();
  for (const report of reports) {
    const cats = asRecord(asRecord(report)?.categories);
    if (!cats) continue;
    for (const id of Object.keys(cats)) catIds.add(id);
  }
  for (const id of catIds) {
    const scores: number[] = [];
    for (const report of reports) {
      const cat = asRecord(asRecord(asRecord(report)?.categories)?.[id]);
      if (cat && typeof cat.score === "number") scores.push(cat.score);
    }
    if (scores.length === 0) continue;
    const target = asRecord(baseCats[id]) ?? { id };
    target.score = medianNumber(scores);
    baseCats[id] = target;
  }

  return base;
}

/** Join a lab origin (e.g. http://127.0.0.1:4173/) with a path (`/login`). */
export function labUrlForRoute(baseUrl: string, routePath: string): string {
  const u = new URL(baseUrl);
  const path = routePath.startsWith("/") ? routePath : `/${routePath}`;
  u.pathname = path === "" ? "/" : path;
  u.search = "";
  u.hash = "";
  return u.href;
}

/**
 * Merge a primary CWV report with additional per-route lab reports into one
 * ingestable report (route rollups + attributions).
 */
export function mergeRouteCwvReports(
  primary: CwvReport,
  extras: readonly { readonly route: string; readonly report: CwvReport }[],
): CwvReport {
  const routeRollups = new Map<string, CwvRollupBucket>();
  for (const r of primary.rollups) {
    if (r.level === "route") routeRollups.set(r.key, r);
  }
  for (const { route, report } of extras) {
    const existing = report.rollups.find(
      (r) => r.level === "route" && r.key === route,
    );
    routeRollups.set(route, {
      key: route,
      level: "route",
      metrics: existing?.metrics ?? report.metrics,
      sampleCount: existing?.sampleCount ?? 1,
    });
  }

  const attributions = [
    ...primary.attributions,
    ...extras.flatMap(({ route, report }) =>
      report.attributions.map((a) => ({
        ...a,
        route: a.route ?? route,
      })),
    ),
  ];

  const insights = [
    ...primary.insights,
    ...extras.flatMap(({ report }) => report.insights),
  ];

  return {
    ...primary,
    rollups: [
      ...primary.rollups.filter((r) => r.level !== "route"),
      ...[...routeRollups.values()].sort((a, b) => a.key.localeCompare(b.key)),
    ],
    attributions,
    insights,
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
      "total-blocking-time": {
        numericValue: 40,
        score: 1,
      },
      "largest-contentful-paint-element": {
        title: "Largest Contentful Paint element",
        score: 0,
        details: {
          type: "list",
          items: [
            {
              type: "node",
              selector: "h1.hero",
              nodeLabel: "Hero headline",
              snippet: '<h1 class="hero">',
            },
          ],
        },
      },
      "unused-javascript": {
        title: "Reduce unused JavaScript",
        score: 0.4,
        details: {
          type: "opportunity",
          overallSavingsMs: 300,
          items: [{ url: "http://127.0.0.1/app.js" }],
        },
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
