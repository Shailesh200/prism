import { describe, expect, it } from "vitest";
import {
  dominantHeat,
  heatBand,
  parseLayerSignals,
  toggleLayer,
} from "./map-layers.js";

describe("map-layers", () => {
  it("parses signals and picks dominant heat", () => {
    const signals = parseLayerSignals({
      layerSignals: { debt: 0.9, risk: 0.2, coverage: 0.1 },
    });
    expect(signals?.debt).toBe(0.9);
    const dom = dominantHeat(signals, ["architecture", "debt", "risk"]);
    expect(dom?.layer).toBe("debt");
    expect(heatBand(0.9)).toBe("3");
  });

  it("keeps architecture when toggling last layer off", () => {
    expect(toggleLayer(["architecture"], "architecture")).toEqual([
      "architecture",
    ]);
    expect(toggleLayer(["architecture", "debt"], "debt")).toEqual([
      "architecture",
    ]);
  });
});
