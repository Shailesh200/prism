import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROVENANCE,
  ProvenancedValueSchema,
  SIGNAL_PROVENANCE,
  SignalProvenanceSchema,
  combineProvenance,
  estimated,
  hasValue,
  heuristic,
  inferred,
  measured,
  unavailable,
  valueOr,
} from "./provenance.js";

describe("SignalProvenance", () => {
  it("accepts the documented kinds including inferred (M-061)", () => {
    expect([...SIGNAL_PROVENANCE]).toEqual([
      "measured",
      "heuristic",
      "inferred",
      "estimated",
      "unavailable",
    ]);
  });

  it("rejects anything else", () => {
    expect(SignalProvenanceSchema.safeParse("vibes").success).toBe(false);
    expect(SignalProvenanceSchema.safeParse("").success).toBe(false);
  });

  // ADR-0029 §6: pre-existing signals were mostly inference rules, so absent
  // provenance must not be read as a measurement.
  it("defaults to heuristic", () => {
    expect(DEFAULT_PROVENANCE).toBe("heuristic");
  });
});

// The load-bearing invariant: there is no field to put a fabricated number in.
describe("ProvenancedValueSchema", () => {
  it("accepts a value with a real source", () => {
    expect(ProvenancedValueSchema.safeParse(measured(0.5)).success).toBe(true);
    expect(ProvenancedValueSchema.safeParse(heuristic(0)).success).toBe(true);
    expect(ProvenancedValueSchema.safeParse(estimated(1)).success).toBe(true);
  });

  it("accepts unavailable with a null value", () => {
    expect(ProvenancedValueSchema.safeParse(unavailable()).success).toBe(true);
  });

  it("rejects a number paired with unavailable", () => {
    const result = ProvenancedValueSchema.safeParse({
      value: 0.42,
      provenance: "unavailable",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a number paired with unavailable even when it is zero", () => {
    const result = ProvenancedValueSchema.safeParse({
      value: 0,
      provenance: "unavailable",
    });
    expect(result.success).toBe(false);
  });

  it("allows a null value with a known source, meaning not yet computed", () => {
    expect(
      ProvenancedValueSchema.safeParse({ value: null, provenance: "measured" })
        .success,
    ).toBe(true);
  });
});

describe("constructors", () => {
  it("tag values with their origin", () => {
    expect(measured(0.5)).toEqual({ value: 0.5, provenance: "measured" });
    expect(heuristic(0.5)).toEqual({ value: 0.5, provenance: "heuristic" });
    expect(inferred(0.5)).toEqual({ value: 0.5, provenance: "inferred" });
    expect(estimated(0.5)).toEqual({ value: 0.5, provenance: "estimated" });
    expect(unavailable()).toEqual({ value: null, provenance: "unavailable" });
  });
});

describe("hasValue", () => {
  it("is true only for a usable number", () => {
    expect(hasValue(measured(0))).toBe(true);
    expect(hasValue(unavailable())).toBe(false);
    expect(hasValue({ value: null, provenance: "measured" })).toBe(false);
  });
});

describe("valueOr", () => {
  it("returns the value when present", () => {
    expect(valueOr(measured(0.25), 1)).toBe(0.25);
  });

  it("substitutes the fallback when unavailable", () => {
    expect(valueOr(unavailable(), 1)).toBe(1);
  });

  it("does not confuse a measured zero with absence", () => {
    expect(valueOr(measured(0), 1)).toBe(0);
  });
});

describe("combineProvenance", () => {
  it("is unavailable when nothing contributes", () => {
    expect(combineProvenance([])).toBe("unavailable");
    expect(combineProvenance(["unavailable", "unavailable"])).toBe(
      "unavailable",
    );
  });

  it("is measured only when every contributor is measured", () => {
    expect(combineProvenance(["measured", "measured"])).toBe("measured");
    expect(combineProvenance(["measured", "unavailable"])).toBe("measured");
  });

  // A rollup is only as strong as its weakest contributing source.
  it("degrades to the weakest present source", () => {
    expect(combineProvenance(["measured", "heuristic"])).toBe("heuristic");
    expect(combineProvenance(["measured", "inferred"])).toBe("inferred");
    expect(combineProvenance(["heuristic", "inferred"])).toBe("inferred");
    expect(combineProvenance(["measured", "estimated"])).toBe("estimated");
    expect(combineProvenance(["heuristic", "estimated"])).toBe("estimated");
    expect(combineProvenance(["inferred", "estimated"])).toBe("estimated");
  });
});
