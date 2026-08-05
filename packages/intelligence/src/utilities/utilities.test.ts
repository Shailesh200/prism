import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  IngestArtifactSchema,
  PersonaPresetsSchema,
  PrismErrorCode,
  StackDomain,
  UtilityJobSchema,
  type StackProfile,
} from "@prism/shared";
import {
  buildCwvReport,
  buildCwvRollups,
  cwvMetricsFromLighthouse,
  labFixtureLighthouseJson,
  labUrlForRoute,
  medianMergeLighthouseReports,
  mergeRouteCwvReports,
} from "./cwv.js";
import { getCwvReport } from "./cwv-from-artifact.js";
import {
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
} from "./jobs.js";
import { buildPersonaPresets } from "./presets.js";
import { createUtilitiesSession } from "./session.js";

describe("M-041 P0 utilities foundation", () => {
  it("echo job writes a local ingest artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m041-p0-"));
    const session = createUtilitiesSession({ workspaceRoot: root });
    const phases: string[] = [];
    const started = await session.jobs.start({
      kind: UTILITY_JOB_ECHO,
      onProgress: (p) => phases.push(p.phase),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(UtilityJobSchema.safeParse(started.value).success).toBe(true);
    expect(started.value.status).toBe("succeeded");
    expect(started.value.resultArtifactId).toBeTruthy();
    expect(phases).toContain("ready");

    const artifact = await session.ingest.get(started.value.resultArtifactId!);
    expect(artifact.ok).toBe(true);
    if (!artifact.ok) return;
    expect(IngestArtifactSchema.safeParse(artifact.value).success).toBe(true);
    expect(artifact.value.kind).toBe("echo");
  });

  it("consent gate blocks remote-probe-stub without grant", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m041-consent-"));
    const session = createUtilitiesSession({ workspaceRoot: root });
    const blocked = await session.jobs.start({
      kind: UTILITY_JOB_REMOTE_PROBE_STUB,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe(PrismErrorCode.UNSUPPORTED);

    // Consent is recorded against the purpose, not the job kind (M-036): the
    // question a user answers is "may Prism contact PageSpeed", not "may Prism
    // run a remote-probe-stub".
    const granted = await session.consent.set("network.pagespeed", true);
    expect(granted.ok).toBe(true);
    const started = await session.jobs.start({
      kind: UTILITY_JOB_REMOTE_PROBE_STUB,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.status).toBe("succeeded");
  });

  it("builds persona presets from stack profile", () => {
    const profile: StackProfile = {
      rootPath: "/tmp",
      generatedAt: "2026-07-20T00:00:00.000Z",
      signals: [],
      domains: [StackDomain.FRONTEND, StackDomain.BACKEND],
      personas: ["fullstack_engineer"],
      summary: "test",
      packages: [],
    };
    const presets = buildPersonaPresets(profile);
    expect(PersonaPresetsSchema.safeParse(presets).success).toBe(true);
    expect(presets.mapPresets).toContain("client_server");
    expect(presets.insightsPresets).toContain("web_perf");
  });

  it("lighthouse job produces CWV report with attribution rollups", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m041-lh-"));
    const session = createUtilitiesSession({ workspaceRoot: root });
    const messages: string[] = [];
    await session.consent.set("network.package-install", true);
    const started = await session.jobs.start({
      kind: UTILITY_JOB_LIGHTHOUSE,
      lighthouse: { port: 4173, mode: "lab-fixture" },
      onProgress: (p) => messages.push(p.message ?? p.phase),
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.status).toBe("succeeded");
    expect(messages.some((m) => /dedicated local PORT/i.test(m))).toBe(true);

    const cwv = await getCwvReport(
      session.ingest,
      started.value.resultArtifactId!,
    );
    expect(cwv.ok).toBe(true);
    if (!cwv.ok) return;
    expect(cwv.value.metrics.map((m) => m.id)).toEqual(
      expect.arrayContaining(["LCP", "CLS", "INP"]),
    );
    expect(cwv.value.rollups.some((r) => r.level === "component")).toBe(true);
    expect(cwv.value.rollups.some((r) => r.level === "route")).toBe(true);
  });

  it("lighthouse mode=run fails without Chrome and never writes fixture scores", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-m046-lh-run-"));
    const session = createUtilitiesSession({ workspaceRoot: root });
    const prev = process.env.PRISM_TEST_NO_CHROME;
    process.env.PRISM_TEST_NO_CHROME = "1";
    try {
      await session.consent.set("network.package-install", true);
      const started = await session.jobs.start({
        kind: UTILITY_JOB_LIGHTHOUSE,
        lighthouse: { port: 4173, mode: "run" },
      });
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      expect(started.value.status).toBe("failed");
      expect(started.value.error?.code).toBe("CHROME_NOT_FOUND");
      expect(started.value.error?.message ?? "").toMatch(/Chrome/i);
      expect(started.value.error?.message ?? "").toMatch(/never shown/i);
      expect(started.value.resultArtifactId).toBeUndefined();
    } finally {
      if (prev === undefined) delete process.env.PRISM_TEST_NO_CHROME;
      else process.env.PRISM_TEST_NO_CHROME = prev;
    }
  });

  it("probeLabUrl reports unreachable ports clearly", async () => {
    const { probeLabUrl } = await import("./lighthouse-runner.js");
    const result = await probeLabUrl("http://127.0.0.1:59999/");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(
      /listening|Timed out|unreachable|ECONNREFUSED/i,
    );
  });

  it("probeLabUrl rejects AirTunes / HTTP 403 non-app listeners", async () => {
    const { createServer } = await import("node:http");
    const { probeLabUrl, isNonAppLabServer } =
      await import("./lighthouse-runner.js");
    expect(isNonAppLabServer("AirTunes/950.7.1")).toBe(true);

    const server = createServer((_req, res) => {
      res.writeHead(403, { Server: "AirTunes/950.7.1", "Content-Length": "0" });
      res.end();
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      server.close();
      throw new Error("expected TCP address");
    }
    try {
      const result = await probeLabUrl(`http://127.0.0.1:${addr.port}/`);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toMatch(/AirTunes|not a frontend|HTTP 403/i);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });

  it("does not invent component rollups when attribution lacks component", () => {
    const raw = labFixtureLighthouseJson({ url: "http://127.0.0.1:4173/" });
    const metrics = cwvMetricsFromLighthouse(raw);
    const rollups = buildCwvRollups(metrics, [
      { app: "web", route: "/only", metricId: "LCP" },
    ]);
    expect(rollups.some((r) => r.level === "component")).toBe(false);
    expect(rollups.some((r) => r.level === "route")).toBe(true);
    const report = buildCwvReport({
      url: "http://127.0.0.1:4173/",
      source: "lab-fixture",
      lighthouseOrPayload: {
        ...(raw as object),
        attributions: [{ app: "web", route: "/only" }],
      },
    });
    expect(report.rollups.some((r) => r.level === "component")).toBe(false);
  });

  it("buildCwvReport extracts TBT, insights, and measured-route rollup without INP invent", () => {
    const raw = {
      finalUrl: "http://127.0.0.1:4173/",
      categories: { performance: { score: 0.7 } },
      audits: {
        "largest-contentful-paint": { numericValue: 4100, score: 0.2 },
        "cumulative-layout-shift": { numericValue: 0.18, score: 0.6 },
        "first-contentful-paint": { numericValue: 2600, score: 0.55 },
        "server-response-time": { numericValue: 4, score: 1 },
        "total-blocking-time": { numericValue: 120, score: 0.95 },
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
    const report = buildCwvReport({
      url: "http://127.0.0.1:4173/",
      source: "lighthouse",
      lighthouseOrPayload: raw,
    });
    expect(report.tbtMs).toBe(120);
    expect(report.metrics.some((m) => m.id === "INP")).toBe(false);
    expect(
      report.rollups.some((r) => r.level === "route" && r.key === "/"),
    ).toBe(true);
    expect(report.insights.some((i) => i.severity === "pain")).toBe(true);
    expect(report.insights.some((i) => i.auditId === "unused-javascript")).toBe(
      true,
    );
    expect(
      report.insights.some((i) => (i.detail ?? "").includes("Boot message")),
    ).toBe(true);
  });

  it("medianMergeLighthouseReports takes median LCP across passes", () => {
    const mk = (lcp: number) => ({
      audits: {
        "largest-contentful-paint": {
          numericValue: lcp,
          numericUnit: "millisecond",
          score: lcp <= 2500 ? 0.9 : 0.3,
        },
        "cumulative-layout-shift": { numericValue: 0.1, score: 0.7 },
      },
      categories: { performance: { score: 0.5 } },
    });
    const merged = medianMergeLighthouseReports([
      mk(2800),
      mk(4150),
      mk(4890),
    ]) as {
      audits: Record<string, { numericValue: number }>;
    };
    expect(merged.audits["largest-contentful-paint"]!.numericValue).toBe(4150);
  });

  it("labUrlForRoute joins origin with path", () => {
    expect(labUrlForRoute("http://127.0.0.1:4173/", "/login")).toBe(
      "http://127.0.0.1:4173/login",
    );
    expect(labUrlForRoute("http://127.0.0.1:4173/old?x=1", "account")).toBe(
      "http://127.0.0.1:4173/account",
    );
  });

  it("mergeRouteCwvReports adds per-route rollups from extras", () => {
    const primary = buildCwvReport({
      url: "http://127.0.0.1:4173/",
      source: "lighthouse",
      lighthouseOrPayload: labFixtureLighthouseJson({
        url: "http://127.0.0.1:4173/",
      }),
    });
    const loginUrl = labUrlForRoute("http://127.0.0.1:4173/", "/login");
    const login = buildCwvReport({
      url: loginUrl,
      source: "lighthouse",
      lighthouseOrPayload: labFixtureLighthouseJson({ url: loginUrl }),
    });
    const merged = mergeRouteCwvReports(primary, [
      { route: "/login", report: login },
    ]);
    expect(
      merged.rollups.some((r) => r.level === "route" && r.key === "/"),
    ).toBe(true);
    expect(
      merged.rollups.some((r) => r.level === "route" && r.key === "/login"),
    ).toBe(true);
    const loginRollup = merged.rollups.find(
      (r) => r.level === "route" && r.key === "/login",
    );
    expect(loginRollup?.metrics.length).toBeGreaterThan(0);
  });

  it("looksLikeNotFoundHtml detects soft 404 pages", async () => {
    const { looksLikeNotFoundHtml, lighthouseLooksLikeNotFound } =
      await import("./lighthouse-runner.js");
    expect(
      looksLikeNotFoundHtml(
        "<html><head><title>Page not found</title></head><body>404</body></html>",
      ),
    ).toBe(true);
    expect(
      looksLikeNotFoundHtml(
        "<html><head><title>Home</title></head><body>Welcome</body></html>",
      ),
    ).toBe(false);
    expect(
      lighthouseLooksLikeNotFound({
        audits: {
          "document-title": {
            displayValue: "404: This page could not be found",
          },
        },
      }),
    ).toBe(true);
  });
});
