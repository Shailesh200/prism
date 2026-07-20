import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { Prism } from "./prism.js";

const featuresFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

/** Documented DoD: fixture yields ≥ N expected features. */
const EXPECTED_N = 4;
const EXPECTED_SLUGS = ["auth", "billing", "checkout", "dashboard"] as const;

describe("workspace feature graph (M-012)", () => {
  it("requires an index before feature APIs", () => {
    const client = Prism.create();
    const opened = client.openRepository(featuresFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const list = opened.value.listFeatures();
    expect(list.ok).toBe(false);
    if (list.ok) return;
    expect(list.error.code).toBe(PrismErrorCode.INDEX_REQUIRED);
  });

  it(`lists ≥${EXPECTED_N} golden features with member files`, async () => {
    const client = Prism.create();
    const opened = client.openRepository(featuresFixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);
    if (!indexed.ok) return;

    const listed = ws.listFeatures();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThanOrEqual(EXPECTED_N);

    const slugs = listed.value.map((f) => f.slug);
    for (const slug of EXPECTED_SLUGS) {
      expect(slugs).toContain(slug);
      const feature = listed.value.find((f) => f.slug === slug);
      expect(feature?.memberFiles.length).toBeGreaterThan(0);
    }

    const graph = ws.getFeatureGraph();
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.value.features).toEqual(listed.value);
    expect(graph.value.graph.nodes.some((n) => n.kind === "feature")).toBe(
      true,
    );
    expect(graph.value.graph.edges.some((e) => e.kind === "contains")).toBe(
      true,
    );
  });
});
