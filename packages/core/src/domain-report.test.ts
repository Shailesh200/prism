import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CwvReport } from "@repo-prism/shared";
import { Prism } from "./prism.js";

/**
 * Characterisation: getDomainReport(domain) for all six domains (M-053).
 */

function unwrap<T>(
  result: { ok: true; value: T } | { ok: false; error: unknown },
): T {
  if (!result.ok) throw result.error;
  return result.value;
}

function metric(
  id: "LCP" | "INP" | "CLS",
  value: number,
  rating: "good" | "needs-improvement" | "poor",
): CwvReport["metrics"][number] {
  return { id, value, unit: id === "CLS" ? "score" : "ms", rating };
}

async function openFixture(setup: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "prism-domain-report-"));
  await setup(root);
  const client = Prism.create();
  const opened = client.openRepository(root);
  if (!opened.ok) throw opened.error;
  return { root, ws: opened.value };
}

describe("getDomainReport(frontend)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("pins route/component breakdown from fixture CWV + discovered routes", async () => {
    const fixture = await openFixture(async (dir) => {
      await mkdir(join(dir, "app", "about"), { recursive: true });
      await writeFile(
        join(dir, "app", "page.tsx"),
        "export default function Home() {}",
      );
      await writeFile(
        join(dir, "app", "about", "page.tsx"),
        "export default function About() {}",
      );
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "fixture", private: true }),
      );
    });
    root = fixture.root;
    const { ws } = fixture;

    const cwv: CwvReport = {
      url: "http://127.0.0.1:4173/",
      collectedAt: "2026-01-15T12:00:00.000Z",
      source: "lab-fixture",
      callout: "fixture",
      metrics: [
        metric("LCP", 1200, "good"),
        metric("INP", 300, "needs-improvement"),
        metric("CLS", 0.01, "good"),
      ],
      categoryScores: { performance: 0.82 },
      attributions: [
        { route: "/", note: "hero", component: "Hero" },
        { component: "Footer" },
      ],
      rollups: [
        {
          key: "Hero",
          level: "component",
          sampleCount: 1,
          metrics: [metric("LCP", 4000, "poor")],
        },
      ],
      insights: [],
      warnings: [],
    };

    const report = unwrap(
      await ws.getDomainReport("frontend", {
        cwvLocal: cwv,
        includeBundleCapability: false,
      }),
    );

    expect(report.domain).toBe("frontend");
    if (report.domain !== "frontend") return;
    expect(report.routes).toEqual(["/", "/about"]);
    expect(report.categoryScores).toEqual({ performance: 0.82 });
    expect(report.cwv.primary?.url).toBe(cwv.url);

    const rootRow = report.routeBreakdown.find((r) => r.route === "/")!;
    expect(rootRow.measured).toBe(true);
    expect(rootRow.rating).toBe("needs-improvement");
    expect(rootRow.notes).toEqual(["hero"]);

    const about = report.routeBreakdown.find((r) => r.route === "/about")!;
    expect(about.measured).toBe(false);

    expect(report.componentBreakdown.map((c) => c.key)).toEqual([
      "Hero",
      "Footer",
    ]);
    expect(report.componentBreakdown[0]?.rating).toBe("poor");
    expect(report.summary).toContain("routes with CWV");
  });
});

describe("getDomainReport(backend)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("wraps BackendReport with coverage and ranking arrays", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          private: true,
          dependencies: { express: "^4.0.0" },
        }),
      );
      await mkdir(join(dir, "src"), { recursive: true });
      await writeFile(
        join(dir, "src", "server.js"),
        [
          "const express = require('express');",
          "const app = express();",
          "app.get('/health', (req, res) => res.send('ok'));",
          "module.exports = app;",
        ].join("\n"),
      );
    });
    root = fixture.root;
    const { ws } = fixture;
    unwrap(await ws.index());

    const report = unwrap(await ws.getDomainReport("backend"));
    expect(report.domain).toBe("backend");
    if (report.domain !== "backend") return;
    expect(report.backend).toBeDefined();
    expect(report.coverage.total).toBe(report.backend.endpoints.length);
    expect(report.coverage.tested + report.coverage.untested.length).toBe(
      report.coverage.total,
    );
    expect(Array.isArray(report.mostDepended)).toBe(true);
    expect(Array.isArray(report.churn)).toBe(true);
    expect(report.dataLayerByKind).toMatchObject({
      model: expect.any(Number),
      migration: expect.any(Number),
      sql: expect.any(Number),
      client: expect.any(Number),
    });
    expect(report.summary).toContain("endpoints");
  });
});

describe("getDomainReport(devops_platform)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("assembles tiles and local findings from iac-resources overlay", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "fixture", private: true }),
      );
      await mkdir(join(dir, ".github", "workflows"), { recursive: true });
      await writeFile(
        join(dir, ".github", "workflows", "ci.yml"),
        [
          "name: CI",
          "on: push",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo hi",
        ].join("\n"),
      );
      await writeFile(join(dir, "Dockerfile"), "FROM node:20\n");
    });
    root = fixture.root;
    const { ws } = fixture;

    const report = unwrap(await ws.getDomainReport("devops_platform"));
    expect(report.domain).toBe("devops_platform");
    if (report.domain !== "devops_platform") return;
    expect(report.tiles.pipelines).toBeGreaterThanOrEqual(0);
    expect(report.tiles.iacResources).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.findings)).toBe(true);
    expect(Array.isArray(report.kindCounts)).toBe(true);
    expect(report.summary.length).toBeGreaterThan(0);
  });
});

describe("getDomainReport(mobile)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("returns screen coverage, stack, and ranking arrays", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          private: true,
          dependencies: { expo: "~51.0.0", "react-native": "0.74.0" },
        }),
      );
      await mkdir(join(dir, "app"), { recursive: true });
      await writeFile(
        join(dir, "app", "_layout.tsx"),
        "export default function Layout() {}",
      );
      await writeFile(
        join(dir, "app", "index.tsx"),
        "export default function Home() {}",
      );
    });
    root = fixture.root;
    const { ws } = fixture;
    unwrap(await ws.index());

    const report = unwrap(await ws.getDomainReport("mobile"));
    expect(report.domain).toBe("mobile");
    if (report.domain !== "mobile") return;
    expect(report.tiles.screens).toBe(report.screenCoverage.total);
    expect(
      report.screenCoverage.tested + report.screenCoverage.untestedIds.length,
    ).toBe(report.screenCoverage.total);
    expect(Array.isArray(report.screenMostDepended)).toBe(true);
    expect(Array.isArray(report.navLinks)).toBe(true);
    expect(report.summary).toContain("screens");
  });
});

describe("getDomainReport(desktop)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("returns process tiles, IPC channels, and boundary links", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "fixture",
          private: true,
          dependencies: { electron: "^28.0.0" },
          main: "main.js",
        }),
      );
      await writeFile(
        join(dir, "main.js"),
        [
          "const { app, ipcMain } = require('electron');",
          "ipcMain.handle('ping', () => 'pong');",
          "app.whenReady().then(() => {});",
        ].join("\n"),
      );
      await writeFile(
        join(dir, "preload.js"),
        "const { contextBridge } = require('electron'); contextBridge.exposeInMainWorld('api', {});",
      );
    });
    root = fixture.root;
    const { ws } = fixture;
    unwrap(await ws.index());

    const report = unwrap(await ws.getDomainReport("desktop"));
    expect(report.domain).toBe("desktop");
    if (report.domain !== "desktop") return;
    expect(
      report.tiles.main + report.tiles.preload + report.tiles.ipc,
    ).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.ipcChannels)).toBe(true);
    expect(Array.isArray(report.boundaryLinks)).toBe(true);
    expect(Array.isArray(report.mostDepended)).toBe(true);
    expect(report.summary).toContain("main");
  });
});

describe("getDomainReport(data_ml_ai)", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("assembles overlay kind counts and DNA stack", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "fixture", private: true }),
      );
      await mkdir(join(dir, "pipelines"), { recursive: true });
      await writeFile(
        join(dir, "pipelines", "etl.py"),
        "def run():\n    print('etl')\n",
      );
      await writeFile(
        join(dir, "analysis.ipynb"),
        JSON.stringify({
          cells: [
            {
              cell_type: "code",
              source: ["print(1)"],
              metadata: {},
              outputs: [],
            },
          ],
          metadata: {},
          nbformat: 4,
          nbformat_minor: 5,
        }),
      );
    });
    root = fixture.root;
    const { ws } = fixture;

    const report = unwrap(await ws.getDomainReport("data_ml_ai"));
    expect(report.domain).toBe("data_ml_ai");
    if (report.domain !== "data_ml_ai") return;
    expect(report.nodeCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.kindCounts)).toBe(true);
    expect(Array.isArray(report.findings)).toBe(true);
    expect(report.summary).toContain("nodes");
  });
});

describe("getDomainReport validation", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("rejects unknown domain ids", async () => {
    const fixture = await openFixture(async (dir) => {
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({ name: "fixture", private: true }),
      );
    });
    root = fixture.root;
    const rejected = await fixture.ws.getDomainReport("not_a_domain");
    expect(rejected.ok).toBe(false);
  });
});
