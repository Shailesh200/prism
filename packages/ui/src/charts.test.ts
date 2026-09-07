import { describe, expect, it } from "vitest";
import { gaugeArc, ganttSegmentPercents, seriesGeometry } from "./charts.js";

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
