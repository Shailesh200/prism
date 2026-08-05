import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RepositoryMapSchema } from "@repo-prism/shared";
import { Prism } from "./prism.js";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "intelligence",
  "fixtures",
  "m012-features",
);

describe("workspace getRepositoryMap (M-017)", () => {
  it("requires index and returns schema-valid maps per zoom", async () => {
    const client = Prism.create();
    const opened = client.openRepository(fixture);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const ws = opened.value;

    const blocked = ws.getRepositoryMap();
    expect(blocked.ok).toBe(false);

    const indexed = await ws.index();
    expect(indexed.ok).toBe(true);

    const featureMap = ws.getRepositoryMap({ zoom: "feature" });
    expect(featureMap.ok).toBe(true);
    if (!featureMap.ok) return;
    expect(RepositoryMapSchema.safeParse(featureMap.value).success).toBe(true);
    expect(featureMap.value.layers.length).toBe(8);
    expect(featureMap.value.searchIndex.length).toBeGreaterThan(0);

    const fileMap = ws.getRepositoryMap({ zoom: "file" });
    expect(fileMap.ok).toBe(true);
    if (!fileMap.ok) return;
    expect(fileMap.value.zoom).toBe("file");
    expect(fileMap.value.graph.nodes.length).toBeGreaterThan(0);
  });
});
