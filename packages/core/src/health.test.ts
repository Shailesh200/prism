import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HealthScoreSchema } from "@prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace getHealth (M-015)", () => {
  it("requires index first", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const blocked = await opened.value.getHealth();
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("PRISM_INDEX_REQUIRED");
  });

  it("returns schema-valid health after index", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;
    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    const health = await ws.getHealth();
    expect(health.ok).toBe(true);
    if (!health.ok) return;
    expect(HealthScoreSchema.safeParse(health.value).success).toBe(true);
    expect(health.value.factors).toHaveLength(5);
    expect(health.value.score).toBeGreaterThanOrEqual(0);
    expect(health.value.score).toBeLessThanOrEqual(100);
  });
});
