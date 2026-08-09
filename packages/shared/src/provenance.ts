import { z } from "zod";

/**
 * How a quantitative signal came to exist (ADR-0029).
 *
 * Prism's credibility rests on numbers being true. Without provenance every
 * surface is forced to treat measured data, inferred data and placeholders as
 * equally trustworthy — which is how hash-derived map heat ended up rendering
 * as if it were a measurement.
 */
export const SIGNAL_PROVENANCE = [
  /** Computed from real repository data: git, diagnostics, coverage, build stats. */
  "measured",
  /** Computed from real data through an inference rule: fan-in risk, feature guesses. */
  "heuristic",
  /**
   * Community / structural inference when stronger conventions are absent
   * (M-061 / ADR-0029 amendment — feature detection fallback).
   */
  "inferred",
  /** A real computation attributed to a subject it was not computed for. */
  "estimated",
  /** No data exists. The accompanying value must be absent or null. */
  "unavailable",
] as const;

export type SignalProvenance = (typeof SIGNAL_PROVENANCE)[number];

export const SignalProvenanceSchema = z.enum(SIGNAL_PROVENANCE);

/**
 * Absent provenance reads as `"heuristic"` for backward compatibility, since
 * that is what most pre-ADR-0029 signals actually were (ADR-0029 §6).
 */
export const DEFAULT_PROVENANCE: SignalProvenance = "heuristic";

/** A number paired with its origin. `value` is null exactly when unavailable. */
export type ProvenancedValue = {
  readonly value: number | null;
  readonly provenance: SignalProvenance;
};

export const ProvenancedValueSchema = z
  .object({
    value: z.number().nullable(),
    provenance: SignalProvenanceSchema,
  })
  .refine(
    (v) => (v.provenance === "unavailable" ? v.value === null : true),
    // The load-bearing invariant of ADR-0029: there is no field to put a
    // fabricated number in, which is what makes fabrication structurally
    // impossible rather than merely discouraged.
    { message: "unavailable signals must not carry a numeric value" },
  );

/** Build a signal with a known origin. */
export function measured(value: number): ProvenancedValue {
  return { value, provenance: "measured" };
}

export function heuristic(value: number): ProvenancedValue {
  return { value, provenance: "heuristic" };
}

export function inferred(value: number): ProvenancedValue {
  return { value, provenance: "inferred" };
}

export function estimated(value: number): ProvenancedValue {
  return { value, provenance: "estimated" };
}

export function unavailable(): ProvenancedValue {
  return { value: null, provenance: "unavailable" };
}

/** True when the signal carries a usable number. */
export function hasValue(
  signal: ProvenancedValue,
): signal is ProvenancedValue & { value: number } {
  return signal.value !== null && signal.provenance !== "unavailable";
}

/**
 * Read a signal for arithmetic, substituting `fallback` when unavailable.
 * Callers that render must use `hasValue` instead — substituting zero on screen
 * is the failure this contract exists to prevent.
 */
export function valueOr(signal: ProvenancedValue, fallback: number): number {
  return hasValue(signal) ? signal.value : fallback;
}

/**
 * Combine provenance across rolled-up signals. The result is only as strong as
 * its weakest contributing source, and rolling up nothing yields no data.
 */
export function combineProvenance(
  parts: readonly SignalProvenance[],
): SignalProvenance {
  const present = parts.filter((p) => p !== "unavailable");
  if (present.length === 0) return "unavailable";
  if (present.includes("estimated")) return "estimated";
  if (present.includes("inferred")) return "inferred";
  if (present.includes("heuristic")) return "heuristic";
  return "measured";
}
