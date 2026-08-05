import { describe, expect, it } from "vitest";
import { computeRegionMovers, pickRegionMoverWindow } from "./movers.js";
import type { RegionHealthPoint } from "@repo-prism/shared";

function point(
  at: string,
  regions: RegionHealthPoint["regions"],
): RegionHealthPoint {
  return { at, regions };
}

describe("computeRegionMovers", () => {
  it("splits improving vs regressing and sorts by |delta|", () => {
    const from = point("2026-01-01T00:00:00.000Z", [
      { id: "a", label: "A", score: 50, files: 2 },
      { id: "b", label: "B", score: 80, files: 3 },
      { id: "c", label: "C", score: 60, files: 1 },
    ]);
    const to = point("2026-02-01T00:00:00.000Z", [
      { id: "a", label: "A", score: 70, files: 2 },
      { id: "b", label: "B", score: 55, files: 3 },
      { id: "c", label: "C", score: 60, files: 1 },
      { id: "d", label: "D", score: 90, files: 4 },
    ]);

    const report = computeRegionMovers(from, to);
    expect(report.improving).toEqual([
      {
        id: "a",
        label: "A",
        fromScore: 50,
        toScore: 70,
        delta: 20,
      },
    ]);
    expect(report.regressing).toEqual([
      {
        id: "b",
        label: "B",
        fromScore: 80,
        toScore: 55,
        delta: -25,
      },
    ]);
  });

  it("pickRegionMoverWindow uses first/last for longer series", () => {
    const a = point("t1", [{ id: "x", label: "X", score: 10, files: 1 }]);
    const b = point("t2", [{ id: "x", label: "X", score: 20, files: 1 }]);
    const c = point("t3", [{ id: "x", label: "X", score: 40, files: 1 }]);
    expect(pickRegionMoverWindow([])).toBeNull();
    expect(pickRegionMoverWindow([a])).toBeNull();
    expect(pickRegionMoverWindow([a, b])).toEqual({ from: a, to: b });
    expect(pickRegionMoverWindow([a, b, c])).toEqual({ from: a, to: c });
  });
});
