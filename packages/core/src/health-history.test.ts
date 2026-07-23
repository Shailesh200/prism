import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  HealthHistoryReportSchema,
  RegionMoversReportSchema,
} from "@prism/shared";
import { wipePrismCache } from "@prism/indexer";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace health history (M-046)", () => {
  afterEach(async () => {
    await wipePrismCache(fixture);
  });

  it("snapshots on index and returns history + movers", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);

    const history = await ws.getHealthHistory();
    expect(history.ok).toBe(true);
    if (!history.ok) return;
    expect(HealthHistoryReportSchema.safeParse(history.value).success).toBe(
      true,
    );
    expect(history.value.points.length).toBeGreaterThanOrEqual(1);
    expect(history.value.points[0]?.score).toBeGreaterThanOrEqual(0);

    // Second index without new commit sha may skip duplicate HEAD row.
    await ws.reindex();
    const again = await ws.getHealthHistory();
    expect(again.ok).toBe(true);

    const movers = await ws.getRegionMovers();
    expect(movers.ok).toBe(true);
    if (!movers.ok) return;
    expect(RegionMoversReportSchema.safeParse(movers.value).success).toBe(true);

    const status = ws.getHealthHistoryBackfillStatus();
    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.value.status).toBe("idle");

    const started = await ws.startHealthHistoryBackfill({ maxCommits: 4 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(
      started.value.status === "running" || started.value.status === "done",
    ).toBe(true);

    // Poll briefly for async completion.
    for (let i = 0; i < 40; i++) {
      const s = ws.getHealthHistoryBackfillStatus();
      if (s.ok && (s.value.status === "done" || s.value.status === "error")) {
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    const finalStatus = ws.getHealthHistoryBackfillStatus();
    expect(finalStatus.ok).toBe(true);
    if (!finalStatus.ok) return;
    expect(["done", "error"]).toContain(finalStatus.value.status);

    ws.close();
  });
});
