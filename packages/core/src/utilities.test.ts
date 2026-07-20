import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  UTILITY_JOB_ECHO,
  UTILITY_JOB_LIGHTHOUSE,
  UTILITY_JOB_REMOTE_PROBE_STUB,
} from "@prism/intelligence";
import { CwvReportSchema, PrismErrorCode } from "@prism/shared";
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

    const withFlag = await ws.startUtilityJob({
      kind: UTILITY_JOB_REMOTE_PROBE_STUB,
      consentGranted: true,
    });
    expect(withFlag.ok).toBe(true);
    if (!withFlag.ok) return;
    expect(withFlag.value.status).toBe("succeeded");
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

    const job = await ws.startUtilityJob({
      kind: UTILITY_JOB_LIGHTHOUSE,
      consentGranted: true,
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
});
