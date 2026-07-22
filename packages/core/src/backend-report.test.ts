import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BackendReportSchema } from "@prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m044-backend",
);

describe("Core getBackendReport", () => {
  it("returns a typed BackendReport for the m044 fixture", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const report = await ws.getBackendReport();
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(BackendReportSchema.safeParse(report.value).success).toBe(true);
    expect(report.value.endpoints.length).toBeGreaterThanOrEqual(5);
    expect(report.value.frameworksDetected).toEqual(
      expect.arrayContaining(["express", "nest", "fastify"]),
    );
  });
});
