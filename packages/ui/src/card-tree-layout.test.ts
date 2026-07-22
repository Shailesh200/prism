import { describe, expect, it } from "vitest";
import { buildFileTreeIndex } from "./file-tree.js";
import {
  cardsOverlap,
  childGridCols,
  collapseExpanded,
  layoutCardTree,
  toggleExpanded,
} from "./card-tree-layout.js";

describe("card-tree-layout", () => {
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

  /** Fixture matching the overlapping checkout siblings bug. */
  const checkoutFiles = [
    {
      id: "file:src/routes/checkout/cart.ts",
      kind: "file",
      label: "src/routes/checkout/cart.ts",
      attrs: { path: "src/routes/checkout/cart.ts" },
    },
    {
      id: "file:src/routes/checkout/page.ts",
      kind: "file",
      label: "src/routes/checkout/page.ts",
      attrs: { path: "src/routes/checkout/page.ts" },
    },
    {
      id: "file:src/features/dashboard/Dashboard.ts",
      kind: "file",
      label: "src/features/dashboard/Dashboard.ts",
      attrs: { path: "src/features/dashboard/Dashboard.ts" },
    },
    {
      id: "file:src/features/dashboard/widgets.ts",
      kind: "file",
      label: "src/features/dashboard/widgets.ts",
      attrs: { path: "src/features/dashboard/widgets.ts" },
    },
  ];

  function boxesFromLayout(
    roots: ReturnType<typeof buildFileTreeIndex>["root"]["children"],
    expanded: Set<string>,
  ) {
    const laid = layoutCardTree(roots, expanded, null);
    return laid.nodes.map((n) => {
      const w = typeof n.style?.width === "number" ? n.style.width : 260;
      const h = typeof n.style?.height === "number" ? n.style.height : 120;
      return { x: n.position.x, y: n.position.y, w, h, id: n.id };
    });
  }

  it("shows only roots until expanded", () => {
    const roots = buildFileTreeIndex(nodes).root.children;
    const laid = layoutCardTree(roots, new Set(), null);
    expect(laid.nodes.map((n) => n.id).sort()).toEqual([
      "folder:pkg",
      "folder:src",
    ]);
    expect(laid.edges).toHaveLength(0);
  });

  it("places children below an expanded parent with branch edges", () => {
    const roots = buildFileTreeIndex(nodes).root.children;
    const laid = layoutCardTree(roots, new Set(["folder:src"]), null);
    expect(laid.nodes.some((n) => n.id === "file:src/a.ts")).toBe(true);
    expect(laid.nodes.some((n) => n.id === "folder:src/lib")).toBe(true);
    expect(laid.edges.some((e) => e.source === "folder:src")).toBe(true);
    const parent = laid.nodes.find((n) => n.id === "folder:src");
    const child = laid.nodes.find((n) => n.id === "file:src/a.ts");
    expect(parent && child && child.position.y > parent.position.y).toBe(true);
  });

  it("keeps sibling file cards from overlapping", () => {
    const roots = buildFileTreeIndex(checkoutFiles).root.children;
    const expanded = new Set([
      "folder:src",
      "folder:src/routes",
      "folder:src/routes/checkout",
    ]);
    const boxes = boxesFromLayout(roots, expanded);
    expect(boxes.some((b) => b.id === "file:src/routes/checkout/cart.ts")).toBe(
      true,
    );
    expect(boxes.some((b) => b.id === "file:src/routes/checkout/page.ts")).toBe(
      true,
    );
    expect(cardsOverlap(boxes)).toBe(false);

    const cart = boxes.find(
      (b) => b.id === "file:src/routes/checkout/cart.ts",
    )!;
    const page = boxes.find(
      (b) => b.id === "file:src/routes/checkout/page.ts",
    )!;
    const left = cart.x <= page.x ? cart : page;
    const right = cart.x <= page.x ? page : cart;
    expect(right.x).toBeGreaterThanOrEqual(left.x + left.w + 24);
  });

  it("keeps a deep expanded tree free of overlaps", () => {
    const roots = buildFileTreeIndex(checkoutFiles).root.children;
    const expanded = new Set([
      "folder:src",
      "folder:src/routes",
      "folder:src/routes/checkout",
      "folder:src/features",
      "folder:src/features/dashboard",
    ]);
    const boxes = boxesFromLayout(roots, expanded);
    expect(boxes.length).toBeGreaterThan(6);
    expect(cardsOverlap(boxes)).toBe(false);
  });

  it("wraps a dense single level into a grid (not one wide row)", () => {
    // 18 files directly under src/ — the runaway-strip failure mode.
    const dense = Array.from({ length: 18 }, (_, i) => {
      const path = `src/mod${String(i).padStart(2, "0")}.ts`;
      return { id: `file:${path}`, kind: "file", label: path, attrs: { path } };
    });
    const roots = buildFileTreeIndex(dense).root.children;
    const laid = layoutCardTree(roots, new Set(["folder:src"]), null);
    const boxes = laid.nodes.map((n) => ({
      x: n.position.x,
      y: n.position.y,
      w: typeof n.style?.width === "number" ? n.style.width : 260,
      h: typeof n.style?.height === "number" ? n.style.height : 78,
      id: n.id,
    }));
    const fileBoxes = boxes.filter((b) => b.id.startsWith("file:"));
    expect(fileBoxes).toHaveLength(18);
    expect(cardsOverlap(boxes)).toBe(false);
    // The files must occupy multiple rows (distinct y values), not one strip.
    const distinctRows = new Set(fileBoxes.map((b) => Math.round(b.y)));
    expect(distinctRows.size).toBeGreaterThan(1);
    // …and stay in a bounded number of columns per row.
    const topRowY = Math.min(...fileBoxes.map((b) => Math.round(b.y)));
    const topRow = fileBoxes.filter((b) => Math.round(b.y) === topRowY);
    expect(topRow.length).toBeLessThanOrEqual(childGridCols(18));
  });

  it("childGridCols is near-square and capped", () => {
    expect(childGridCols(1)).toBe(1);
    expect(childGridCols(4)).toBe(2);
    expect(childGridCols(18)).toBe(5);
    expect(childGridCols(100)).toBe(6);
  });

  it("toggles expand and collapses descendants", () => {
    const roots = buildFileTreeIndex(nodes).root.children;
    const src = roots.find((r) => r.id === "folder:src")!;
    const open = toggleExpanded(new Set(), src);
    expect(open.has("folder:src")).toBe(true);
    const deeper = new Set(open);
    deeper.add("folder:src/lib");
    const closed = collapseExpanded(deeper, src);
    expect(closed.has("folder:src")).toBe(false);
    expect(closed.has("folder:src/lib")).toBe(false);
  });
});
