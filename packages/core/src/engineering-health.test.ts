import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EngineeringHealthReportSchema } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace getEngineeringHealth (M-022)", () => {
  it("requires index first", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const blocked = await opened.value.getEngineeringHealth();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("PRISM_INDEX_REQUIRED");
  });

  it("returns schema-valid engineering health after index", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    const report = await ws.getEngineeringHealth();
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(EngineeringHealthReportSchema.safeParse(report.value).success).toBe(
      true,
    );
    expect(report.value.metrics).toHaveLength(6);
    expect(
      report.value.metrics.every((m) => m.score >= 0 && m.score <= 100),
    ).toBe(true);
  });
});
