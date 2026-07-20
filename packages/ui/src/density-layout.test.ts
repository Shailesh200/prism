import { describe, expect, it } from "vitest";
import { buildFileTreeIndex } from "./file-tree.js";
import { layoutIcicle, layoutTreemap } from "./density-layout.js";

describe("density-layout", () => {
  const nodes = [
    {
      id: "file:src/a.ts",
      kind: "file",
      label: "src/a.ts",
      attrs: { path: "src/a.ts" },
    },
    {
      id: "file:src/lib/b.ts",
      kind: "file",
      label: "src/lib/b.ts",
      attrs: { path: "src/lib/b.ts" },
    },
    {
      id: "file:pkg/c.ts",
      kind: "file",
      label: "pkg/c.ts",
      attrs: { path: "pkg/c.ts" },
    },
  ];

  it("lays out a treemap covering the viewport", () => {
    const roots = buildFileTreeIndex(nodes).root.children;
    const rects = layoutTreemap(roots, 800, 600);
    expect(rects.length).toBeGreaterThan(2);
    const area = rects
      .filter((r) => r.depth === 0)
      .reduce((sum, r) => sum + r.w * r.h, 0);
    expect(area).toBeGreaterThan(800 * 600 * 0.9);
  });

  it("lays out an icicle with stacked depths", () => {
    const roots = buildFileTreeIndex(nodes).root.children;
    const rects = layoutIcicle(roots, 800, 600);
    const depths = new Set(rects.map((r) => r.depth));
    expect(depths.size).toBeGreaterThan(1);
    expect(rects.some((r) => r.name === "src")).toBe(true);
  });
});
