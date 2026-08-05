import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IntelligenceReportSchema, PrismErrorCode } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace.intelligence (M-014)", () => {
  it("requires an index before the aggregate API", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const report = await opened.value.intelligence();
    expect(report.ok).toBe(false);
    if (report.ok) return;
    expect(report.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it("returns a schema-valid aggregate on the feature fixture", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const report = await ws.intelligence();
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const parsed = IntelligenceReportSchema.safeParse(report.value);
    expect(parsed.success).toBe(true);
    expect(report.value.summary.stats.filesIndexed).toBeGreaterThan(0);
    expect(report.value.dna.summary.length).toBeGreaterThan(0);
    expect(report.value.dependencyGraph.nodes.length).toBeGreaterThan(0);
    expect(report.value.knowledgeGraph.nodes.length).toBeGreaterThan(0);
    expect(report.value.features.length).toBeGreaterThanOrEqual(4);
    expect(report.value.consistency.ok).toBe(true);
    expect(report.value.capabilities.intelligence).toBe(true);
    expect(report.value.capabilities.graphs).toBe(true);
  });
});
