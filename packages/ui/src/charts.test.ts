import { describe, expect, it } from "vitest";
import {
  candleGeometry,
  chartTipEdge,
  formatCompactCount,
  gaugeArc,
  ganttSegmentPercents,
  integerTicks,
  niceTicks,
  pickAxisIndices,
  seriesGeometry,
  valueToY,
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

  it("maps 0 onto the baseline (height - pad)", () => {
    expect(valueToY(0, 180, 8, 0, 4_300_000)).toBe(172);
    expect(valueToY(4_300_000, 180, 8, 0, 4_300_000)).toBe(8);
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

  it("labels large counts as K M B", () => {
    expect(formatCompactCount(950)).toBe("950");
    expect(formatCompactCount(1_200)).toBe("1.2K");
    expect(formatCompactCount(12_000)).toBe("12K");
    expect(formatCompactCount(3_400_000)).toBe("3.4M");
    expect(formatCompactCount(1_400_000_000)).toBe("1.4B");
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

describe("chartTipEdge", () => {
  it("anchors the last slot left and the first slot right", () => {
    expect(chartTipEdge(0.95)).toBe("end");
    expect(chartTipEdge(0.05)).toBe("start");
    expect(chartTipEdge(0.5)).toBeUndefined();
  });
});

describe("candleGeometry", () => {
  it("slots an up day and a down day across the plot", () => {
    const geo = candleGeometry(
      [
        { open: 0, high: 100, low: 0, close: 100 },
        { open: 100, high: 100, low: 40, close: 40 },
      ],
      200,
      100,
      10,
    );
    expect(geo.bars).toHaveLength(2);
    expect(geo.bars[0]?.up).toBe(true);
    expect(geo.bars[1]?.up).toBe(false);
    expect(geo.bars[0]?.x).toBeLessThan(geo.bars[1]?.x ?? 0);
  });
});
