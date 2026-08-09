/**
 * Browser / import CWV parse path (Node-free `@repo-prism/intelligence/cwv`).
 * Pins behaviour shared with app-shell characterisation tests.
 */

import { describe, expect, it } from "vitest";
import {
  buildCwvReport,
  CWV_THRESHOLDS,
  CWV_UNRELIABLE_CEILINGS,
  cwvFieldReportFromPagespeedJson,
  cwvMetricsFromLighthouse,
  cwvReportFromLighthouseJson,
  fieldMetricsFromPagespeedJson,
  formFactorFromLighthouse,
  metric,
  metricsFromLighthouseJson,
  ratingFromMetricValue,
  ratingFromScore,
  scoreRating,
  unreliableMetricWarnings,
} from "./cwv.js";
import { heuristicFrontendRoutes } from "./frontend-route-paths.js";

const SAMPLE_LHR = {
  finalUrl: "http://127.0.0.1:4173/login",
  categories: {
    performance: { score: 0.7 },
    accessibility: { score: 0.92 },
  },
  audits: {
    "largest-contentful-paint": { numericValue: 4100, score: 0.2 },
    "cumulative-layout-shift": { numericValue: 0.18, score: 0.6 },
    "first-contentful-paint": { numericValue: 2600, score: 0.55 },
    "server-response-time": { numericValue: 4, score: 1 },
    "total-blocking-time": { numericValue: 120, score: 0.95 },
    "interaction-to-next-paint": { numericValue: 280, score: 0.8 },
    "largest-contentful-paint-element": {
      title: "Largest Contentful Paint element",
      score: 0,
      details: {
        type: "list",
        items: [
          {
            type: "node",
            selector: "p.msg",
            nodeLabel: "Boot message",
          },
        ],
      },
    },
    "unused-javascript": {
      title: "Reduce unused JavaScript",
      score: 0,
      details: {
        type: "opportunity",
        overallSavingsMs: 800,
        items: [{ url: "http://127.0.0.1:4173/app.js" }],
      },
    },
  },
};

describe("scoreRating / ratingFromScore", () => {
  it("maps Lighthouse 0–1 scores to CWV bands", () => {
    expect(scoreRating(null)).toBe("unknown");
    expect(ratingFromScore(undefined)).toBe("unknown");
    expect(scoreRating(Number.NaN)).toBe("unknown");
    expect(scoreRating(0.9)).toBe("good");
    expect(scoreRating(0.89)).toBe("needs-improvement");
    expect(scoreRating(0.5)).toBe("needs-improvement");
    expect(scoreRating(0.49)).toBe("poor");
  });
});

describe("CWV_THRESHOLDS", () => {
  it("pins the canonical web.dev good/poor bands", () => {
    expect(CWV_THRESHOLDS.LCP).toEqual({ good: 2500, poor: 4000 });
    expect(CWV_THRESHOLDS.INP).toEqual({ good: 200, poor: 500 });
    expect(CWV_THRESHOLDS.CLS).toEqual({ good: 0.1, poor: 0.25 });
    expect(CWV_THRESHOLDS.FCP).toEqual({ good: 1800, poor: 3000 });
    expect(CWV_THRESHOLDS.TTFB).toEqual({ good: 800, poor: 1800 });
  });
});

describe("ratingFromMetricValue", () => {
  it("rates values against the canonical CWV bands (web.dev)", () => {
    // LCP: good ≤ 2500, poor > 4000
    expect(ratingFromMetricValue("LCP", 2500)).toBe("good");
    expect(ratingFromMetricValue("LCP", 2501)).toBe("needs-improvement");
    expect(ratingFromMetricValue("LCP", 4000)).toBe("needs-improvement");
    expect(ratingFromMetricValue("LCP", 4001)).toBe("poor");
    // CLS: good ≤ 0.1, poor > 0.25
    expect(ratingFromMetricValue("CLS", 0.1)).toBe("good");
    expect(ratingFromMetricValue("CLS", 0.2)).toBe("needs-improvement");
    expect(ratingFromMetricValue("CLS", 0.26)).toBe("poor");
    // INP: good ≤ 200, poor > 500
    expect(ratingFromMetricValue("INP", 200)).toBe("good");
    expect(ratingFromMetricValue("INP", 350)).toBe("needs-improvement");
    expect(ratingFromMetricValue("INP", 501)).toBe("poor");
    // FCP: good ≤ 1800, poor > 3000
    expect(ratingFromMetricValue("FCP", 1800)).toBe("good");
    expect(ratingFromMetricValue("FCP", 2400)).toBe("needs-improvement");
    expect(ratingFromMetricValue("FCP", 3001)).toBe("poor");
    // TTFB: good ≤ 800, poor > 1800
    expect(ratingFromMetricValue("TTFB", 800)).toBe("good");
    expect(ratingFromMetricValue("TTFB", 1200)).toBe("needs-improvement");
    expect(ratingFromMetricValue("TTFB", 1801)).toBe("poor");
    expect(ratingFromMetricValue("LCP", null)).toBe("unknown");
    expect(ratingFromMetricValue("LCP", Number.NaN)).toBe("unknown");
  });

  it("metric() rates the value, not the Lighthouse audit score", () => {
    // Audit score and CWV band disagree (score curves vary by LH version):
    // the advertised CWV thresholds must win.
    expect(metric("LCP", 2400, "ms", 0.4)?.rating).toBe("good");
    expect(metric("FCP", 3200, "ms", 0.95)?.rating).toBe("poor");
    expect(metric("TTFB", 900, "ms", 1)?.rating).toBe("needs-improvement");
    expect(metric("CLS", 0.05, "score", 0.2)?.rating).toBe("good");
    expect(metric("INP", 600, "ms", 0.7)?.rating).toBe("poor");
  });

  it("metric() still rates when the audit score is missing", () => {
    // Imported reports can carry numericValue with score: null — the tile
    // must not show a real value with a "No data" rating.
    expect(metric("LCP", 1800, "ms", null)).toEqual({
      id: "LCP",
      value: 1800,
      unit: "ms",
      rating: "good",
    });
  });
});

const SAMPLE_PSI = {
  id: "https://example.com/",
  lighthouseResult: SAMPLE_LHR,
  loadingExperience: {
    metrics: {
      LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2300, category: "FAST" },
      CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12, category: "AVERAGE" },
      INTERACTION_TO_NEXT_PAINT: { percentile: 450, category: "AVERAGE" },
      FIRST_CONTENTFUL_PAINT_MS: { percentile: 3100, category: "SLOW" },
      EXPERIMENTAL_TIME_TO_FIRST_BYTE: { percentile: 700, category: "FAST" },
      FIRST_INPUT_DELAY_MS: { percentile: 30, category: "FAST" },
    },
  },
};

describe("fieldMetricsFromPagespeedJson", () => {
  it("reads page-level CrUX p75 metrics with threshold ratings", () => {
    const { metrics, scope } = fieldMetricsFromPagespeedJson(SAMPLE_PSI);
    expect(scope).toBe("page");
    const byId = new Map(metrics.map((m) => [m.id, m]));
    expect(byId.get("LCP")).toEqual({
      id: "LCP",
      value: 2300,
      unit: "ms",
      rating: "good",
    });
    // CLS percentile is reported in hundredths by CrUX (12 = 0.12).
    expect(byId.get("CLS")).toEqual({
      id: "CLS",
      value: 0.12,
      unit: "score",
      rating: "needs-improvement",
    });
    expect(byId.get("INP")?.rating).toBe("needs-improvement");
    expect(byId.get("FCP")?.rating).toBe("poor");
    expect(byId.get("TTFB")?.rating).toBe("good");
    // FID is not INP — never mapped.
    expect(metrics.some((m) => m.value === 30)).toBe(false);
  });

  it("falls back to origin-level CrUX when the page has no data", () => {
    const { metrics, scope } = fieldMetricsFromPagespeedJson({
      id: "https://example.com/deep",
      loadingExperience: { metrics: {} },
      originLoadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4200, category: "SLOW" },
        },
      },
    });
    expect(scope).toBe("origin");
    expect(metrics).toEqual([
      { id: "LCP", value: 4200, unit: "ms", rating: "poor" },
    ]);
  });

  it("returns empty (never lab-substituted) when CrUX has no data", () => {
    const { metrics, scope } = fieldMetricsFromPagespeedJson({
      id: "https://new-site.example/",
      lighthouseResult: SAMPLE_LHR,
    });
    expect(metrics).toEqual([]);
    expect(scope).toBeNull();
  });
});

describe("cwvFieldReportFromPagespeedJson", () => {
  it("separates field metrics from the embedded lab run", () => {
    const report = cwvFieldReportFromPagespeedJson(SAMPLE_PSI);
    expect(report.source).toBe("pagespeed");
    expect(report.url).toBe("https://example.com/");
    // Metrics are CrUX field values — not the lab audits (lab LCP is 4100).
    expect(report.metrics.find((m) => m.id === "LCP")?.value).toBe(2300);
    // Category scores + insights still come from the embedded lab run.
    expect(report.categoryScores).toEqual({
      performance: 0.7,
      accessibility: 0.92,
    });
    expect(report.insights.some((i) => i.auditId === "unused-javascript")).toBe(
      true,
    );
    expect(report.tbtMs).toBe(120);
    expect(
      report.rollups.some((r) => r.level === "route" && r.key === "/"),
    ).toBe(true);
  });

  it("keeps metrics empty (no placeholder) when CrUX is absent", () => {
    const report = cwvFieldReportFromPagespeedJson({
      id: "https://new-site.example/",
      lighthouseResult: SAMPLE_LHR,
    });
    expect(report.metrics).toEqual([]);
    expect(report.rollups).toEqual([]);
    // Lab-derived parts remain available for the Lighthouse section.
    expect(report.categoryScores.performance).toBe(0.7);
    expect(report.insights.length).toBeGreaterThan(0);
  });
});

describe("metricsFromLighthouseJson", () => {
  it("shares metric extraction with cwvMetricsFromLighthouse", () => {
    const fromJson = metricsFromLighthouseJson(SAMPLE_LHR);
    const fromLab = cwvMetricsFromLighthouse(SAMPLE_LHR);
    expect(fromJson.metrics).toEqual(fromLab);
  });

  it("extracts metrics, TBT, categories, url, and insights from a raw LHR", () => {
    const out = metricsFromLighthouseJson(SAMPLE_LHR);
    expect(out.url).toBe("http://127.0.0.1:4173/login");
    expect(out.tbtMs).toBe(120);
    expect(out.categoryScores).toEqual({
      performance: 0.7,
      accessibility: 0.92,
    });
    expect(out.metrics.map((m) => m.id).sort()).toEqual([
      "CLS",
      "FCP",
      "INP",
      "LCP",
      "TTFB",
    ]);
    expect(out.metrics.find((m) => m.id === "LCP")).toEqual({
      id: "LCP",
      value: 4100,
      unit: "ms",
      rating: "poor",
    });
    expect(out.insights.some((i) => i.auditId === "unused-javascript")).toBe(
      true,
    );
  });

  it("unwraps PageSpeed lighthouseResult wrapper", () => {
    const out = metricsFromLighthouseJson({
      id: "https://example.com/",
      lighthouseResult: SAMPLE_LHR,
    });
    expect(out.url).toBe("http://127.0.0.1:4173/login");
    expect(out.tbtMs).toBe(120);
  });
});

describe("cwvReportFromLighthouseJson", () => {
  it("builds a report with route rollup from the finalUrl path", () => {
    const report = cwvReportFromLighthouseJson(SAMPLE_LHR, "ingest");
    expect(report.source).toBe("ingest");
    expect(report.url).toBe("http://127.0.0.1:4173/login");
    expect(report.tbtMs).toBe(120);
    expect(report.rollups).toEqual([
      {
        key: "/login",
        level: "route",
        metrics: report.metrics,
        sampleCount: 1,
      },
    ]);
    expect(report.attributions).toEqual([]);
    expect(report.callout).toContain("Imported Lighthouse");
  });

  it("shares metrics with buildCwvReport lab path", () => {
    const imported = cwvReportFromLighthouseJson(SAMPLE_LHR, "ingest");
    const lab = buildCwvReport({
      url: SAMPLE_LHR.finalUrl,
      source: "lighthouse",
      lighthouseOrPayload: SAMPLE_LHR,
    });
    expect(imported.metrics).toEqual(lab.metrics);
    expect(imported.tbtMs).toBe(lab.tbtMs);
    expect(imported.categoryScores).toEqual(lab.categoryScores);
  });

  it("synthesises an unknown LCP when audits yield no metrics", () => {
    const report = cwvReportFromLighthouseJson(
      { finalUrl: "https://example.com/", audits: {}, categories: {} },
      "ingest",
    );
    expect(report.metrics).toEqual([
      { id: "LCP", value: 0, unit: "ms", rating: "unknown" },
    ]);
  });
});

describe("unreliable-run guard", () => {
  it("flags physically implausible lab values as unreliable", () => {
    const warnings = unreliableMetricWarnings([
      { id: "LCP", value: 165_000, unit: "ms", rating: "poor" },
      { id: "CLS", value: 0.05, unit: "score", rating: "good" },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("LCP");
    expect(warnings[0]).toContain("165.0s");
    expect(warnings[0]).toMatch(/unreliable/i);
  });

  it("stays silent for plausible values at the ceiling boundary", () => {
    expect(
      unreliableMetricWarnings([
        {
          id: "LCP",
          value: CWV_UNRELIABLE_CEILINGS.LCP,
          unit: "ms",
          rating: "poor",
        },
        { id: "INP", value: 9_999, unit: "ms", rating: "poor" },
        { id: "CLS", value: 4.9, unit: "score", rating: "poor" },
      ]),
    ).toEqual([]);
  });

  it("buildCwvReport attaches warnings for absurd runs, empty for sane ones", () => {
    const absurd = buildCwvReport({
      url: "http://127.0.0.1:5173/",
      source: "lighthouse",
      lighthouseOrPayload: {
        finalUrl: "http://127.0.0.1:5173/",
        audits: {
          "largest-contentful-paint": { numericValue: 165_000, score: 0 },
        },
        categories: {},
      },
    });
    expect(absurd.warnings.length).toBeGreaterThan(0);
    expect(absurd.warnings[0]).toContain("LCP");

    const sane = buildCwvReport({
      url: SAMPLE_LHR.finalUrl,
      source: "lighthouse",
      lighthouseOrPayload: SAMPLE_LHR,
    });
    expect(sane.warnings).toEqual([]);
  });
});

describe("formFactor", () => {
  it("reads the form factor from LHR configSettings", () => {
    expect(
      formFactorFromLighthouse({ configSettings: { formFactor: "desktop" } }),
    ).toBe("desktop");
    expect(
      formFactorFromLighthouse({ configSettings: { formFactor: "mobile" } }),
    ).toBe("mobile");
    expect(formFactorFromLighthouse({ configSettings: {} })).toBeUndefined();
    expect(formFactorFromLighthouse({})).toBeUndefined();
  });

  it("job option wins for live runs; LHR config is the fallback", () => {
    const desktopLhr = {
      ...SAMPLE_LHR,
      configSettings: { formFactor: "desktop" },
    };
    const fromLhr = buildCwvReport({
      url: SAMPLE_LHR.finalUrl,
      source: "ingest",
      lighthouseOrPayload: desktopLhr,
    });
    expect(fromLhr.formFactor).toBe("desktop");

    const explicit = buildCwvReport({
      url: SAMPLE_LHR.finalUrl,
      source: "lighthouse",
      lighthouseOrPayload: SAMPLE_LHR,
      formFactor: "desktop",
    });
    expect(explicit.formFactor).toBe("desktop");

    const unset = buildCwvReport({
      url: SAMPLE_LHR.finalUrl,
      source: "lighthouse",
      lighthouseOrPayload: SAMPLE_LHR,
    });
    expect(unset.formFactor).toBeUndefined();
  });
});

describe("heuristicFrontendRoutes", () => {
  it("derives Next app/pages routes and defaults to /", () => {
    expect(heuristicFrontendRoutes(undefined, undefined)).toEqual(["/"]);
    expect(
      heuristicFrontendRoutes(
        ["frontend-next"],
        [
          "apps/web/app/page.tsx",
          "apps/web/app/(marketing)/about/page.tsx",
          "apps/web/pages/account/index.tsx",
          "apps/web/pages/_app.tsx",
        ],
      ),
    ).toEqual(["/", "/about", "/account"]);
  });
});
