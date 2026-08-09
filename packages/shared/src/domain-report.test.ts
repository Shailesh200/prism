import { describe, expect, it } from "vitest";
import {
  buildBackendCoverage,
  buildDesktopIpcChannels,
  buildDevopsFindings,
  buildDevopsTiles,
  buildDomainStackSnapshot,
  buildFrontendComponentBreakdown,
  buildFrontendRouteBreakdown,
  buildMobileScreenCoverage,
  countDataLayerByKind,
  fileStem,
  inboundDepCounts,
  lookupInbound,
  mergeFrontendRoutes,
  normalizeDepKey,
  rankChurnHotspots,
  rankMostDepended,
  selectPrimaryCwv,
  summarizeFrontendDomainReport,
  summarizeMobileDomainReport,
} from "./domain-report.js";
import type {
  BackendReport,
  CwvReport,
  DnaReport,
  GitActivity,
  GraphNodeDto,
  GraphSnapshotDto,
  UtilityOverlayReport,
} from "./schemas.js";

/**
 * Characterisation tests for domain-report aggregations (M-053 T-08 / T-10).
 */

function metric(
  id: "LCP" | "INP" | "CLS" | "FCP" | "TTFB",
  value: number,
  rating: "good" | "needs-improvement" | "poor" | "unknown" = "good",
): CwvReport["metrics"][number] {
  return { id, value, unit: id === "CLS" ? "score" : "ms", rating };
}

function report(
  partial: Partial<CwvReport> & Pick<CwvReport, "url">,
): CwvReport {
  return {
    collectedAt: "2026-01-15T12:00:00.000Z",
    source: "lab-fixture",
    callout: "test",
    metrics: [],
    categoryScores: {},
    attributions: [],
    rollups: [],
    insights: [],
    warnings: [],
    ...partial,
  };
}

function node(
  partial: Pick<GraphNodeDto, "id" | "kind" | "label"> & {
    path?: string;
    attrs?: GraphNodeDto["attrs"];
  },
): GraphNodeDto {
  return {
    id: partial.id,
    kind: partial.kind,
    label: partial.label,
    attrs: {
      ...(partial.path !== undefined ? { path: partial.path } : {}),
      ...partial.attrs,
    },
  };
}

describe("mergeFrontendRoutes", () => {
  it("merges sources, defaults to /, and pins / first", () => {
    expect(mergeFrontendRoutes([], [])).toEqual(["/"]);
    expect(mergeFrontendRoutes(["/about", "/"], ["/login"])).toEqual([
      "/",
      "/about",
      "/login",
    ]);
  });
});

describe("selectPrimaryCwv", () => {
  const local = report({ url: "http://127.0.0.1:4173/" });
  const pagespeed = report({ url: "https://example.com/" });

  it("prefers local by default", () => {
    expect(selectPrimaryCwv("local", local, pagespeed)?.url).toBe(local.url);
    expect(selectPrimaryCwv("local", null, pagespeed)?.url).toBe(pagespeed.url);
  });

  it("prefers pagespeed when requested", () => {
    expect(selectPrimaryCwv("pagespeed", local, pagespeed)?.url).toBe(
      pagespeed.url,
    );
    expect(selectPrimaryCwv("pagespeed", local, null)?.url).toBe(local.url);
  });
});

describe("buildFrontendRouteBreakdown", () => {
  it("marks measured root route and leaves others unknown", () => {
    const cwv = report({
      url: "http://127.0.0.1:4173/",
      metrics: [
        metric("LCP", 1200, "good"),
        metric("INP", 300, "needs-improvement"),
      ],
      attributions: [{ route: "/", note: "hero" }],
    });
    const rows = buildFrontendRouteBreakdown(["/", "/about"], cwv);
    expect(rows.find((r) => r.route === "/")?.measured).toBe(true);
    expect(rows.find((r) => r.route === "/")?.rating).toBe("needs-improvement");
    expect(rows.find((r) => r.route === "/")?.notes).toEqual(["hero"]);
    expect(rows.find((r) => r.route === "/about")?.measured).toBe(false);
  });

  it("does not mark `/` measured when the lab ran a sub-path ending in /", () => {
    const cwv = report({
      url: "http://127.0.0.1:4173/docs/",
      metrics: [metric("LCP", 1200, "good")],
    });
    const rows = buildFrontendRouteBreakdown(["/", "/docs", "/docs/"], cwv);
    // Trailing-slash normalisation: measured pathname `/docs` matches both
    // spellings of that route, but never the unrelated root route.
    expect(rows.find((r) => r.route === "/docs")?.measured).toBe(true);
    expect(rows.find((r) => r.route === "/docs/")?.measured).toBe(true);
    expect(rows.find((r) => r.route === "/")?.measured).toBe(false);
    expect(rows.find((r) => r.route === "/")?.metrics).toEqual([]);
  });

  it("does not substring-match `/a` against a measured `/admin`", () => {
    const cwv = report({
      url: "http://localhost:3000/admin",
      metrics: [metric("LCP", 1200, "good")],
    });
    const rows = buildFrontendRouteBreakdown(["/", "/a", "/admin"], cwv);
    expect(rows.find((r) => r.route === "/admin")?.measured).toBe(true);
    expect(rows.find((r) => r.route === "/a")?.measured).toBe(false);
    expect(rows.find((r) => r.route === "/a")?.metrics).toEqual([]);
    expect(rows.find((r) => r.route === "/")?.measured).toBe(false);
  });

  it("marks only exact path equality as measured (settings vs settings/profile)", () => {
    const cwv = report({
      url: "https://example.com/settings",
      metrics: [metric("LCP", 1200, "good")],
    });
    const rows = buildFrontendRouteBreakdown(
      ["/settings", "/settings/profile"],
      cwv,
    );
    expect(rows.find((r) => r.route === "/settings")?.measured).toBe(true);
    expect(rows.find((r) => r.route === "/settings/profile")?.measured).toBe(
      false,
    );
  });
});

describe("buildFrontendComponentBreakdown", () => {
  it("pins rollup rating and attribution-only components", () => {
    const cwv = report({
      url: "http://127.0.0.1:4173/",
      attributions: [{ component: "Footer" }],
      rollups: [
        {
          key: "Hero",
          level: "component",
          sampleCount: 1,
          metrics: [metric("LCP", 4000, "poor")],
        },
      ],
    });
    const rows = buildFrontendComponentBreakdown(cwv);
    expect(rows.map((c) => c.key)).toEqual(["Hero", "Footer"]);
    expect(rows[0]?.rating).toBe("poor");
  });
});

describe("summarizeFrontendDomainReport", () => {
  const row = (
    route: string,
    measured: boolean,
  ): Parameters<
    typeof summarizeFrontendDomainReport
  >[0]["routeBreakdown"][number] => ({
    route,
    measured,
    linked: measured,
    sampleCount: measured ? 1 : 0,
    metricCount: measured ? 1 : 0,
    metrics: [],
    rating: measured ? "good" : "unknown",
    notes: [],
  });

  it("describes missing vs measured CWV", () => {
    expect(
      summarizeFrontendDomainReport({
        routes: ["/", "/a"],
        routeBreakdown: [],
        componentBreakdown: [],
        hasPrimaryCwv: false,
      }),
    ).toContain("no CWV report yet");
    expect(
      summarizeFrontendDomainReport({
        routes: ["/", "/a"],
        routeBreakdown: [row("/", true)],
        componentBreakdown: [
          { key: "H", sampleCount: 0, rating: "unknown", metrics: [] },
        ],
        hasPrimaryCwv: true,
      }),
    ).toContain("routes with CWV");
  });

  it("divides by routeBreakdown (the listed superset), never routes", () => {
    const summary = summarizeFrontendDomainReport({
      routes: ["/"],
      routeBreakdown: [row("/", true), row("/about", false)],
      componentBreakdown: [],
      hasPrimaryCwv: true,
    });
    expect(summary).toBe("1 of 2 routes with CWV · 0 components");
  });
});

describe("inbound helpers", () => {
  it("normalizeDepKey strips file: prefix, ./, and backslashes", () => {
    expect(normalizeDepKey("file:src\\util.ts")).toBe("src/util.ts");
    expect(normalizeDepKey("./src/util.ts")).toBe("src/util.ts");
  });

  it("counts in-degree by normalised edge.to", () => {
    const graph: GraphSnapshotDto = {
      id: "g",
      nodes: [],
      edges: [
        {
          id: "e1",
          kind: "depends_on",
          from: "a.ts",
          to: "file:./src/util.ts",
        },
        { id: "e2", kind: "depends_on", from: "b.ts", to: "src/util.ts" },
      ],
    };
    const inDeg = inboundDepCounts(graph);
    expect(inDeg.get("src/util.ts")).toBe(2);
    expect(lookupInbound(inDeg, "file:src/util.ts")).toBe(2);
  });

  it("fileStem strips test/spec suffixes", () => {
    expect(fileStem("src/Foo.Bar.test.tsx")).toBe("foo.bar");
    expect(fileStem("screens/HomeScreen.tsx")).toBe("homescreen");
  });
});

describe("backend aggregations", () => {
  it("buildBackendCoverage counts untested endpoints", () => {
    const backend = {
      endpoints: [{ tested: true }, { tested: false }, { tested: false }],
    } as BackendReport;
    const coverage = buildBackendCoverage(backend);
    expect(coverage.total).toBe(3);
    expect(coverage.tested).toBe(1);
    expect(coverage.untested).toHaveLength(2);
  });

  it("countDataLayerByKind pins 2×2 grid counts", () => {
    expect(
      countDataLayerByKind([
        { kind: "model" },
        { kind: "model" },
        { kind: "sql" },
      ]),
    ).toEqual({ model: 2, migration: 0, sql: 1, client: 0 });
  });

  it("rankMostDepended sorts handlers by inbound deps", () => {
    const handlers = [
      node({ id: "a", kind: "handler", label: "a", path: "src/a.ts" }),
      node({ id: "b", kind: "handler", label: "b", path: "src/b.ts" }),
    ];
    const graph: GraphSnapshotDto = {
      id: "g",
      nodes: [],
      edges: [
        { id: "e1", kind: "depends_on", from: "x", to: "src/b.ts" },
        { id: "e2", kind: "depends_on", from: "y", to: "src/b.ts" },
        { id: "e3", kind: "depends_on", from: "z", to: "src/a.ts" },
      ],
    };
    expect(rankMostDepended(handlers, graph).map((r) => r.id)).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("devops aggregations", () => {
  it("buildDevopsTiles splits CI from IaC without double-counting container/k8s", () => {
    const nodes = [
      node({ id: "1", kind: "ci", label: "ci" }),
      node({ id: "2", kind: "terraform", label: "tf" }),
      node({ id: "3", kind: "container", label: "docker" }),
      node({ id: "4", kind: "kubernetes", label: "k8s" }),
    ];
    expect(buildDevopsTiles(nodes)).toEqual({
      iacResources: 1,
      pipelines: 1,
      containers: 1,
      kubernetes: 1,
    });
  });

  it("buildDevopsFindings falls back to concurrency/permissions heuristics", () => {
    const overlay: UtilityOverlayReport = {
      kind: "iac-resources",
      domain: "devops_platform",
      rootPath: "/repo",
      generatedAt: "2026-01-15T12:00:00.000Z",
      summary: "empty findings",
      graph: {
        id: "g",
        nodes: [
          node({
            id: "wf",
            kind: "ci",
            label: "ci.yml",
            path: ".github/workflows/ci.yml",
            attrs: { hasConcurrency: false, hasPermissions: false },
          }),
        ],
        edges: [],
      },
      mapLayer: { id: "l", label: "IaC", nodeKinds: [] },
      findings: [],
    };
    const findings = buildDevopsFindings(overlay);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => f.id.includes("concurrency"))).toBe(true);
    expect(findings.some((f) => f.id.includes("permissions"))).toBe(true);
  });
});

describe("mobile aggregations", () => {
  it("buildMobileScreenCoverage matches screen stems to QA tests", () => {
    const screens = [
      node({
        id: "s1",
        kind: "screen",
        label: "Home",
        path: "screens/Home.tsx",
      }),
      node({ id: "s2", kind: "screen", label: "Pay", path: "screens/Pay.tsx" }),
    ];
    const qa: UtilityOverlayReport = {
      kind: "qa-test-gaps",
      domain: "qa",
      rootPath: "/repo",
      generatedAt: "2026-01-15T12:00:00.000Z",
      summary: "qa",
      graph: {
        id: "q",
        nodes: [
          node({
            id: "t1",
            kind: "test",
            label: "Home.test",
            path: "screens/Home.test.tsx",
          }),
        ],
        edges: [],
      },
      mapLayer: { id: "l", label: "QA", nodeKinds: [] },
      findings: [],
    };
    const coverage = buildMobileScreenCoverage(screens, qa);
    expect(coverage.total).toBe(2);
    expect(coverage.tested).toBe(1);
    expect(coverage.untestedIds).toEqual(["s2"]);
    expect(
      summarizeMobileDomainReport({
        screens: 2,
        navigators: 1,
        expoRouter: 0,
        untested: 1,
      }),
    ).toContain("untested");
  });

  it("buildDomainStackSnapshot filters mobile DNA signals", () => {
    const dna = {
      languages: [],
      frameworks: ["expo", "react"],
      summary: "x",
      architectureHints: [],
      testRunners: [],
      rankedDomains: [],
      stack: {
        rootPath: "/r",
        generatedAt: "2026-01-15T12:00:00.000Z",
        signals: [
          {
            id: "expo-router",
            domain: "mobile",
            confidence: 0.9,
            personas: [],
            evidence: [],
          },
          {
            id: "express",
            domain: "backend",
            confidence: 0.8,
            personas: [],
            evidence: [],
          },
        ],
        domains: ["mobile", "backend"],
        personas: [],
        summary: "s",
        packages: [],
      },
    } as DnaReport;
    const stack = buildDomainStackSnapshot(dna, "mobile");
    expect(stack?.detected).toBe(true);
    expect(stack?.frameworks).toEqual(["expo"]);
    expect(stack?.signals.map((s) => s.id)).toEqual(["expo-router"]);
  });
});

describe("desktop aggregations", () => {
  it("buildDesktopIpcChannels parses finding messages", () => {
    const overlay: UtilityOverlayReport = {
      kind: "desktop-boundary",
      domain: "desktop",
      rootPath: "/repo",
      generatedAt: "2026-01-15T12:00:00.000Z",
      summary: "desktop",
      graph: { id: "g", nodes: [], edges: [] },
      mapLayer: { id: "l", label: "Desktop", nodeKinds: [] },
      findings: [
        {
          id: "f1",
          message: 'IPC ipcMain.handle: "open-file"',
          path: "main.ts",
          severity: "medium",
        },
      ],
    };
    expect(buildDesktopIpcChannels(overlay)).toEqual([
      {
        name: "open-file",
        source: "ipcMain.handle",
        path: "main.ts",
        risk: "medium",
      },
    ]);
  });

  it("rankChurnHotspots sorts by commits", () => {
    const nodes = [
      node({ id: "a", kind: "main", label: "a", path: "main.ts" }),
      node({ id: "b", kind: "preload", label: "b", path: "preload.ts" }),
    ];
    const git = {
      root: "/r",
      generatedAt: "2026-01-15T12:00:00.000Z",
      available: true,
      recentFiles: [
        {
          path: "main.ts",
          commits: 2,
          additions: 1,
          deletions: 0,
          lastCommit: {
            sha: "a",
            author: "a",
            date: "2026-01-01T00:00:00.000Z",
            message: "x",
          },
        },
        {
          path: "preload.ts",
          commits: 5,
          additions: 1,
          deletions: 0,
          lastCommit: {
            sha: "b",
            author: "a",
            date: "2026-01-02T00:00:00.000Z",
            message: "y",
          },
        },
      ],
    } as GitActivity;
    expect(rankChurnHotspots(nodes, git).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
