import { describe, expect, it } from "vitest";
import { buildFileTreeIndex } from "./file-tree.js";
import {
  breadcrumbTrail,
  findTreeEntry,
  treeEntriesToTreemapPoints,
  treeLevelToTreemapPoints,
} from "./highcharts-treemap-data.js";

const sampleNodes = [
  {
    id: "file:src/a.ts",
    kind: "file" as const,
    label: "src/a.ts",
    attrs: { path: "src/a.ts" },
  },
  {
    id: "file:src/lib/b.ts",
    kind: "file" as const,
    label: "src/lib/b.ts",
    attrs: { path: "src/lib/b.ts" },
  },
  {
    id: "file:README.md",
    kind: "file" as const,
    label: "README.md",
    attrs: { path: "README.md" },
  },
];

describe("highcharts-treemap-data", () => {
  it("emits parent links and leaf values for full tree", () => {
    const roots = buildFileTreeIndex(sampleNodes).root.children;
    const points = treeEntriesToTreemapPoints(roots);
    expect(points.some((p) => p.id === "folder:src")).toBe(true);
    const leaf = points.find((p) => p.id === "file:src/a.ts");
    expect(leaf?.value).toBe(1);
    expect(leaf?.parent).toBe("folder:src");
    const folder = points.find((p) => p.id === "folder:src");
    expect(folder?.value).toBeUndefined();
  });

  it("emits only one level with sized folder tiles", () => {
    const roots = buildFileTreeIndex(sampleNodes).root.children;
    const points = treeLevelToTreemapPoints(roots);
    expect(points.map((p) => p.id).sort()).toEqual(
      ["file:README.md", "folder:src"].sort(),
    );
    expect(points.every((p) => p.parent === undefined)).toBe(true);
    const src = points.find((p) => p.id === "folder:src");
    expect(src?.value).toBe(2);
    expect(src?.custom.kind).toBe("folder");
    // Nested lib folder must not appear at root level.
    expect(points.some((p) => p.id === "folder:src/lib")).toBe(false);
  });

  it("finds entries and builds breadcrumbs", () => {
    const root = buildFileTreeIndex(sampleNodes).root;
    const lib = findTreeEntry(root, "folder:src/lib");
    expect(lib?.name).toBe("lib");
    const crumbs = breadcrumbTrail(root, "folder:src/lib");
    expect(crumbs.map((c) => c.name)).toEqual(["src", "lib"]);
  });
});
