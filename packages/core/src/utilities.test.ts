import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UTILITY_JOB_BUNDLE_STATS,
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
} from "@prism/intelligence";
import {
  BundleWeightReportSchema,
  CwvReportSchema,
  PrismErrorCode,
} from "@prism/shared";
import { writeFile } from "node:fs/promises";
import { Prism } from "./prism.js";

describe("workspace utilities APIs (M-041 P0)", () => {
  it("runs echo-ingest via Core and lists the artifact", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-core-util-"));
    const client = Prism.create();
    const opened = client.openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const job = await ws.startUtilityJob({ kind: UTILITY_JOB_ECHO });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.value.status).toBe("succeeded");

    const listed = await ws.listIngestArtifacts({ kind: "echo" });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThanOrEqual(1);

    const presets = await ws.getPersonaPresets();
    expect(presets.ok).toBe(true);
    if (!presets.ok) return;
    expect(presets.value.summary.length).toBeGreaterThan(0);
  });

  it("requires consent for remote-probe-stub", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-core-consent-"));
    const client = Prism.create();
    const opened = client.openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const blocked = await ws.startUtilityJob({
      kind: UTILITY_JOB_REMOTE_PROBE_STUB,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe(PrismErrorCode.UNSUPPORTED);

    // The grant is recorded by the user, through Core, ahead of the call —
    // the caller no longer gets to assert it as part of starting the job.
    const granted = await ws.setConsent("network.pagespeed", true);
    expect(granted.ok).toBe(true);

    const allowed = await ws.startUtilityJob({
      kind: UTILITY_JOB_REMOTE_PROBE_STUB,
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value.status).toBe("succeeded");
    expect(allowed.value.consentPurpose).toBe("network.pagespeed");
  });

  it("runs opt-in lighthouse lab-fixture and returns CWV via Core", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-core-lh-"));
    const client = Prism.create();
    const opened = client.openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const blocked = await ws.startUtilityJob({ kind: UTILITY_JOB_LIGHTHOUSE });
    expect(blocked.ok).toBe(false);

    await ws.setConsent("network.package-install", true);
    const job = await ws.startUtilityJob({
      kind: UTILITY_JOB_LIGHTHOUSE,
      lighthouse: { mode: "lab-fixture", port: 4173 },
    });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.value.status).toBe("succeeded");

    const cwv = await ws.getCwvReport(job.value.resultArtifactId!);
    expect(cwv.ok).toBe(true);
    if (!cwv.ok) return;
    expect(CwvReportSchema.safeParse(cwv.value).success).toBe(true);
    expect(cwv.value.callout).toMatch(/dedicated local PORT/i);
    expect(cwv.value.metrics.some((m) => m.id === "LCP")).toBe(true);
  });

  it("detects + ingests bundle-stats via Core", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-core-bundle-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({
        name: "web-app",
        scripts: { analyze: "echo analyze", build: "echo build" },
        dependencies: { next: "14.0.0" },
      }),
      "utf8",
    );
    await writeFile(
      join(root, "next.config.mjs"),
      "export default {};\n",
      "utf8",
    );
    const statsPath = join(root, "stats.json");
    await writeFile(
      statsPath,
      JSON.stringify({
        mode: "production",
        chunks: [
          {
            id: 0,
            names: ["main"],
            size: 50_000,
            gzipSize: 15_000,
            initial: true,
            modules: [{ id: 1, name: "./src/a.ts", size: 50_000 }],
          },
        ],
      }),
      "utf8",
    );

    const client = Prism.create();
    const opened = client.openRepository(root);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const cap = ws.detectBundleAnalyzeCapability();
    expect(cap.ok).toBe(true);
    if (!cap.ok) return;
    expect(cap.value.supported).toBe(true);
    expect(cap.value.preferredStrategy).toBe("project-script");

    const blocked = await ws.startUtilityJob({
      kind: UTILITY_JOB_BUNDLE_STATS,
    });
    expect(blocked.ok).toBe(false);

    await ws.setConsent("run.local-build", true);
    const job = await ws.startUtilityJob({
      kind: UTILITY_JOB_BUNDLE_STATS,
      bundleAnalyze: { mode: "ingest", reportPath: statsPath },
    });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.value.status).toBe("succeeded");

    const report = await ws.getBundleWeightReport(job.value.resultArtifactId!);
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(BundleWeightReportSchema.safeParse(report.value).success).toBe(true);
    expect(report.value.overview.totalRaw).toBe(50_000);
  });
});
