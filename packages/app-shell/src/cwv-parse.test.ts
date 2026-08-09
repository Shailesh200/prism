/**
 * Characterisation tests for client CWV parse (M-053 Phase 1).
 * Pin today's surface behaviour before converging onto intelligence.
 */

import { describe, expect, it } from "vitest";
import {
  cwvFieldReportFromPagespeedJson,
  cwvReportFromLighthouseJson,
  heuristicFrontendRoutes,
  metricsFromLighthouseJson,
  scoreRating,
} from "./cwv-parse.js";

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

describe("scoreRating", () => {
  it("maps Lighthouse 0–1 scores to CWV bands (verbatim)", () => {
    expect(scoreRating(null)).toBe("unknown");
    expect(scoreRating(undefined)).toBe("unknown");
    expect(scoreRating(Number.NaN)).toBe("unknown");
    expect(scoreRating(0.9)).toBe("good");
    expect(scoreRating(0.89)).toBe("needs-improvement");
    expect(scoreRating(0.5)).toBe("needs-improvement");
    expect(scoreRating(0.49)).toBe("poor");
  });
});

describe("metricsFromLighthouseJson", () => {
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

describe("cwvFieldReportFromPagespeedJson (surface wiring)", () => {
  it("builds a field (CrUX) report — never lab metrics under a field label", () => {
    const report = cwvFieldReportFromPagespeedJson({
      id: "https://example.com/",
      lighthouseResult: SAMPLE_LHR,
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2300, category: "FAST" },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: {
            percentile: 12,
            category: "AVERAGE",
          },
          INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: "FAST" },
        },
      },
    });
    expect(report.source).toBe("pagespeed");
    // Field values come from CrUX percentiles — lab LCP in SAMPLE_LHR is 4100.
    expect(report.metrics.find((m) => m.id === "LCP")).toEqual({
      id: "LCP",
      value: 2300,
      unit: "ms",
      rating: "good",
    });
    // CrUX CLS is reported in hundredths.
    expect(report.metrics.find((m) => m.id === "CLS")?.value).toBe(0.12);
    // Lab category scores remain available for the Lighthouse section.
    expect(report.categoryScores.performance).toBe(0.7);
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
