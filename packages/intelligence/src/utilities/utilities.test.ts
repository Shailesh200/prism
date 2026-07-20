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

    const granted = await session.consent.set(
      UTILITY_JOB_REMOTE_PROBE_STUB,
      true,
    );
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
    const started = await session.jobs.start({
      kind: UTILITY_JOB_LIGHTHOUSE,
      consentGranted: true,
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
});
