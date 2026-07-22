import { describe, expect, it } from "vitest";
import { squarifyTreemap, type TreemapItem } from "./overview-treemap.js";

function items(weights: number[]): TreemapItem[] {
  return weights.map((w, i) => ({
    id: `n${i}`,
    label: `n${i}`,
    kind: "package",
    weight: w,
  }));
}

describe("squarifyTreemap", () => {
  it("returns one cell per positive-weight item, filling the area", () => {
    const cells = squarifyTreemap(items([4, 2, 1, 1]), 200, 100);
    expect(cells).toHaveLength(4);
    const area = cells.reduce((s, c) => s + c.w * c.h, 0);
    expect(area).toBeGreaterThan(200 * 100 * 0.98);
    expect(area).toBeLessThan(200 * 100 * 1.02);
  });

  it("keeps every cell inside the bounds", () => {
    const cells = squarifyTreemap(items([9, 8, 7, 6, 5, 4, 3, 2, 1]), 320, 240);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(-0.001);
      expect(c.y).toBeGreaterThanOrEqual(-0.001);
      expect(c.x + c.w).toBeLessThanOrEqual(320 + 0.01);
      expect(c.y + c.h).toBeLessThanOrEqual(240 + 0.01);
    }
  });

  it("scales area with weight (bigger weight → bigger cell)", () => {
    const cells = squarifyTreemap(items([10, 1]), 300, 300);
    const big = cells.find((c) => c.id === "n0")!;
    const small = cells.find((c) => c.id === "n1")!;
    expect(big.w * big.h).toBeGreaterThan(small.w * small.h * 5);
  });

  it("ignores zero/negative weights and empty input", () => {
    expect(squarifyTreemap(items([0, 0]), 100, 100)).toHaveLength(0);
    expect(squarifyTreemap([], 100, 100)).toHaveLength(0);
    expect(squarifyTreemap(items([1, 1]), 0, 100)).toHaveLength(0);
  });
});
