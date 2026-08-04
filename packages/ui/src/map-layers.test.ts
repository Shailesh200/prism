import { describe, expect, it } from "vitest";
import {
  HEAT_LAYER_IDS,
  dominantHeat,
  hasNoHeatData,
  heatBand,
  layersWithoutData,
  parseLayerSignals,
  signalProvenance,
  signalValue,
  toggleLayer,
} from "./map-layers.js";

describe("parseLayerSignals", () => {
  it("reads values alongside their provenance", () => {
    const signals = parseLayerSignals({
      layerSignals: { debt: 0.9, risk: 0.2 },
      layerProvenance: { debt: "measured", risk: "heuristic" },
    });

    expect(signalValue(signals, "debt")).toBe(0.9);
    expect(signalProvenance(signals, "debt")).toBe("measured");
    expect(signalProvenance(signals, "risk")).toBe("heuristic");
  });

  // The failure ADR-0029 exists to prevent: an absent layer used to default to
  // 0, painting "no data" in the same colour ramp as a measured zero.
  it("keeps an unavailable layer absent rather than zero", () => {
    const signals = parseLayerSignals({
      layerSignals: { debt: 0.9 },
      layerProvenance: { debt: "measured", performance: "unavailable" },
    });

    expect(signalValue(signals, "performance")).toBeNull();
    expect(signalProvenance(signals, "performance")).toBe("unavailable");
  });

  it("treats a declared layer with no number as unavailable", () => {
    const signals = parseLayerSignals({
      layerSignals: {},
      layerProvenance: { debt: "measured" },
    });

    expect(signalValue(signals, "debt")).toBeNull();
    expect(signalProvenance(signals, "debt")).toBe("unavailable");
  });

  it("rejects non-finite numbers", () => {
    const signals = parseLayerSignals({
      layerSignals: { debt: Number.NaN, risk: Number.POSITIVE_INFINITY },
      layerProvenance: { debt: "measured", risk: "measured" },
    });

    expect(signalValue(signals, "debt")).toBeNull();
    expect(signalValue(signals, "risk")).toBeNull();
  });

  // ADR-0029 §6: absent provenance reads as heuristic so pre-existing
  // consumers and cached graphs keep working.
  it("defaults missing provenance to heuristic", () => {
    const signals = parseLayerSignals({ layerSignals: { debt: 0.5 } });

    expect(signalValue(signals, "debt")).toBe(0.5);
    expect(signalProvenance(signals, "debt")).toBe("heuristic");
  });

  it("ignores an unrecognised provenance string", () => {
    const signals = parseLayerSignals({
      layerSignals: { debt: 0.5 },
      layerProvenance: { debt: "vibes" },
    });

    expect(signalProvenance(signals, "debt")).toBe("heuristic");
  });

  it("returns null when there are no layer signals at all", () => {
    expect(parseLayerSignals(undefined)).toBeNull();
    expect(parseLayerSignals({})).toBeNull();
    expect(parseLayerSignals({ layerSignals: "nope" })).toBeNull();
  });

  it("reports unavailable for an unknown layer id", () => {
    const signals = parseLayerSignals({ layerSignals: { debt: 0.5 } });
    expect(signalValue(signals, "notALayer")).toBeNull();
    expect(signalProvenance(signals, "notALayer")).toBe("unavailable");
  });
});

describe("dominantHeat", () => {
  const signals = parseLayerSignals({
    layerSignals: { debt: 0.9, risk: 0.2, coverage: 0.1 },
    layerProvenance: {
      debt: "measured",
      risk: "heuristic",
      coverage: "heuristic",
      performance: "unavailable",
      activity: "unavailable",
      ownership: "unavailable",
    },
  });

  it("picks the highest active heat layer", () => {
    const dom = dominantHeat(signals, ["architecture", "debt", "risk"]);
    expect(dom?.layer).toBe("debt");
    expect(dom?.value).toBe(0.9);
    expect(dom?.provenance).toBe("measured");
  });

  it("skips structural layers", () => {
    expect(dominantHeat(signals, ["architecture", "dependency"])).toBeNull();
  });

  it("returns null when every active layer is unavailable", () => {
    expect(dominantHeat(signals, ["performance", "activity"])).toBeNull();
    expect(hasNoHeatData(signals, ["performance", "activity"])).toBe(true);
  });

  it("ignores unavailable layers mixed with available ones", () => {
    const dom = dominantHeat(signals, ["performance", "risk"]);
    expect(dom?.layer).toBe("risk");
  });

  it("returns null for null signals", () => {
    expect(dominantHeat(null, ["debt"])).toBeNull();
    expect(hasNoHeatData(null, ["debt"])).toBe(true);
  });
});

describe("heatBand", () => {
  it.each([
    [0, "0"],
    [0.24, "0"],
    [0.25, "1"],
    [0.49, "1"],
    [0.5, "2"],
    [0.74, "2"],
    [0.75, "3"],
    [1, "3"],
  ])("bands %s as %s", (value, band) => {
    expect(heatBand(value)).toBe(band);
  });
});

describe("toggleLayer", () => {
  it("keeps architecture when toggling the last layer off", () => {
    expect(toggleLayer(["architecture"], "architecture")).toEqual([
      "architecture",
    ]);
    expect(toggleLayer(["architecture", "debt"], "debt")).toEqual([
      "architecture",
    ]);
  });

  it("adds a layer that is not active", () => {
    expect(toggleLayer(["architecture"], "debt")).toEqual([
      "architecture",
      "debt",
    ]);
  });
});

describe("layersWithoutData", () => {
  it("reports layers no node has data for", () => {
    const nodes = [
      {
        attrs: {
          layerSignals: { debt: 0.5 },
          layerProvenance: {
            debt: "measured",
            risk: "unavailable",
            activity: "unavailable",
            ownership: "unavailable",
            performance: "unavailable",
            coverage: "unavailable",
          },
        },
      },
    ];

    expect(layersWithoutData(nodes)).toEqual([
      "activity",
      "ownership",
      "risk",
      "performance",
      "coverage",
    ]);
  });

  it("counts a layer as present when any single node has it", () => {
    const nodes = [
      {
        attrs: {
          layerSignals: {},
          layerProvenance: { debt: "unavailable" },
        },
      },
      {
        attrs: {
          layerSignals: { debt: 0.2 },
          layerProvenance: { debt: "measured" },
        },
      },
    ];

    expect(layersWithoutData(nodes)).not.toContain("debt");
  });

  it("reports every layer for an empty graph", () => {
    expect(layersWithoutData([])).toEqual([...HEAT_LAYER_IDS]);
  });

  it("ignores nodes with no layer signals at all", () => {
    expect(layersWithoutData([{ attrs: {} }])).toEqual([...HEAT_LAYER_IDS]);
  });
});
