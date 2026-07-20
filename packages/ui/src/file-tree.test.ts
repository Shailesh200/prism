import { describe, expect, it } from "vitest";
import {
  buildFileTreeIndex,
  defaultExpandedIds,
  expandPathTo,
  flattenVisible,
} from "./file-tree.js";

describe("file-tree", () => {
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

  it("indexes folders and files", () => {
    const index = buildFileTreeIndex(nodes);
    expect(index.fileCount).toBe(3);
    expect(index.folderCount).toBeGreaterThanOrEqual(2);
    expect(index.byPath.get("src/lib/b.ts")).toBe("file:src/lib/b.ts");
    expect(index.root.children.map((c) => c.name).sort()).toEqual([
      "pkg",
      "src",
    ]);
  });

  it("expands only top-level by default and flattens shallow", () => {
    const index = buildFileTreeIndex(nodes);
    const expanded = defaultExpandedIds(index.root);
    const rows = flattenVisible(index.root, expanded);
    expect(rows.some((r) => r.entry.name === "src")).toBe(true);
    expect(rows.some((r) => r.entry.name === "a.ts")).toBe(true);
    expect(rows.some((r) => r.entry.name === "b.ts")).toBe(false);
  });

  it("expands ancestors for a deep path", () => {
    const index = buildFileTreeIndex(nodes);
    const ids = expandPathTo(index.root, { path: "src/lib/b.ts" });
    expect(ids).toContain("folder:src");
    expect(ids).toContain("folder:src/lib");
  });

  it("filters with query and reveals matches", () => {
    const index = buildFileTreeIndex(nodes);
    const rows = flattenVisible(index.root, new Set(), "lib/b");
    expect(rows.some((r) => r.entry.name === "b.ts")).toBe(true);
  });
});
