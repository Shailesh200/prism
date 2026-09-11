import { describe, expect, it } from "vitest";
import {
  gaugeArc,
  ganttSegmentPercents,
  integerTicks,
  niceTicks,
  pickAxisIndices,
  seriesGeometry,
} from "./charts.js";

describe("seriesGeometry", () => {
  it("returns empty geometry for no values", () => {
    expect(seriesGeometry([])).toEqual({ line: "", area: "", points: [] });
  });

  it("honours an explicit y domain so 50/100 sits at mid-height", () => {
    const geo = seriesGeometry([50, 50], 600, 200, 10, { min: 0, max: 100 });
    expect(geo.line).toBe("10,100 590,100");
    expect(geo.area).toBe("10,190 10,100 590,100 590,190");
  });

  it("places a single point and a closed area", () => {
    const geo = seriesGeometry([4], 100, 20, 2);
    expect(geo.points).toHaveLength(1);
    expect(geo.line).toMatch(/^\d/);
    expect(geo.area.startsWith("2,18")).toBe(true);
  });
});

describe("niceTicks / integerTicks / pickAxisIndices", () => {
  it("covers a 0–100 score domain with five ticks", () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
  });

  it("returns integer counts from 0 to max", () => {
    expect(integerTicks(3)).toEqual([0, 1, 2, 3]);
    expect(integerTicks(100)[0]).toBe(0);
    expect(integerTicks(100).at(-1)).toBe(100);
    expect(integerTicks(11).at(-1)).toBe(11);
    expect(integerTicks(11)).not.toContain(12);
    expect(integerTicks(11)).toEqual([0, 2, 4, 6, 8, 11]);
    expect(integerTicks(13)).toEqual([0, 2, 4, 6, 8, 10, 13]);
  });

  it("always includes first and last indices", () => {
    expect(pickAxisIndices(2)).toEqual([0, 1]);
    expect(pickAxisIndices(20, 5)[0]).toBe(0);
    expect(pickAxisIndices(20, 5).at(-1)).toBe(19);
  });

  it("labels every day in a 7-day window", () => {
    expect(pickAxisIndices(7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("ganttSegmentPercents", () => {
  it("clips a bar to the visible range", () => {
    const bar = ganttSegmentPercents(0, 100, 25, 50);
    expect(bar).toEqual({ left: 25, width: 25 });
  });

  it("returns undefined when the bar is outside the range", () => {
    expect(ganttSegmentPercents(0, 100, 200, 250)).toBeUndefined();
  });
});

describe("gaugeArc", () => {
  it("draws a path for a mid score", () => {
    expect(gaugeArc(50).startsWith("M ")).toBe(true);
  });
});
