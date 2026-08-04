import { describe, expect, it } from "vitest";
import {
  RISK_BANDS,
  RISK_BAND_IDS,
  RISK_BAND_MIN,
  RiskBandSchema,
  riskBandDescriptor,
  riskToBand,
} from "./risk-bands.js";

describe("riskToBand", () => {
  // Q-023: Blast Radius and Change Review each had their own copy of these
  // boundaries. The exact edges are the part that silently drifts.
  it.each([
    [0, "low"],
    [1, "low"],
    [19, "low"],
    [19.9, "low"],
    [20, "mid"],
    [20.1, "mid"],
    [59, "mid"],
    [59.9, "mid"],
    [60, "high"],
    [60.1, "high"],
    [100, "high"],
  ])("bands %s as %s", (score, band) => {
    expect(riskToBand(score)).toBe(band);
  });

  it("treats out-of-range scores by their side of the boundary", () => {
    expect(riskToBand(-10)).toBe("low");
    expect(riskToBand(1000)).toBe("high");
  });

  // NaN compares false against every bound, so without an explicit guard it
  // would land in whichever branch happens to be last.
  it("falls back to low for NaN", () => {
    expect(riskToBand(Number.NaN)).toBe("low");
  });

  it("treats infinity as the top band", () => {
    expect(riskToBand(Number.POSITIVE_INFINITY)).toBe("high");
    expect(riskToBand(Number.NEGATIVE_INFINITY)).toBe("low");
  });

  it("agrees with the published minimums", () => {
    expect(riskToBand(RISK_BAND_MIN.high)).toBe("high");
    expect(riskToBand(RISK_BAND_MIN.mid)).toBe("mid");
    expect(riskToBand(RISK_BAND_MIN.low)).toBe("low");
    expect(riskToBand(RISK_BAND_MIN.high - 0.0001)).toBe("mid");
    expect(riskToBand(RISK_BAND_MIN.mid - 0.0001)).toBe("low");
  });
});

describe("riskBandDescriptor", () => {
  it("gives every band a full label and a one-word short form", () => {
    for (const id of RISK_BAND_IDS) {
      const band = RISK_BANDS[id];
      expect(band.id).toBe(id);
      expect(band.label.length).toBeGreaterThan(0);
      expect(band.short.length).toBeGreaterThan(0);
      expect(band.tone).toBe(id);
    }
  });

  it("resolves a score straight to its descriptor", () => {
    expect(riskBandDescriptor(85).short).toBe("High");
    expect(riskBandDescriptor(30).short).toBe("Moderate");
    expect(riskBandDescriptor(5).short).toBe("Low");
  });
});

describe("RiskBandSchema", () => {
  it("accepts only the three bands", () => {
    for (const id of RISK_BAND_IDS) {
      expect(RiskBandSchema.safeParse(id).success).toBe(true);
    }
    expect(RiskBandSchema.safeParse("medium").success).toBe(false);
    expect(RiskBandSchema.safeParse("critical").success).toBe(false);
  });
});
