import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UtilityOverlayReportSchema } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m041-overlays",
);

describe("Core utility overlays", () => {
  it("lists kinds and builds overlays; cross-package needs index", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const kinds = ws.listUtilityOverlayKinds();
    expect(kinds.ok).toBe(true);
    if (!kinds.ok) return;
    expect(kinds.value.length).toBe(12);

    const api = await ws.getUtilityOverlay("api-surface");
    expect(api.ok).toBe(true);
    if (!api.ok) return;
    expect(UtilityOverlayReportSchema.safeParse(api.value).success).toBe(true);
    expect(api.value.graph.nodes.length).toBeGreaterThan(0);

    const blocked = await ws.getUtilityOverlay("cross-package-impact");
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error.code).toBe("PRISM_INDEX_REQUIRED");

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);

    const xp = await ws.getUtilityOverlay("cross-package-impact");
    expect(xp.ok).toBe(true);
    if (!xp.ok) return;
    expect(xp.value.kind).toBe("cross-package-impact");
    expect(xp.value.graph.nodes.length).toBeGreaterThan(0);

    const regions = await ws.getUtilityOverlay("domain-regions");
    expect(regions.ok).toBe(true);
    if (!regions.ok) return;
    expect(regions.value.mapLayer.nodeKinds).toContain("domain-region");
  });
});
