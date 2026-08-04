import { z } from "zod";

/**
 * The single definition of what a 0–100 risk score means (Q-023, ADR-0027).
 *
 * Blast Radius and Change Review each carried their own copy of these
 * thresholds, and other packages banded the same number differently. Two
 * screens describing one score in two ways is worse than either description.
 */
export const RISK_BAND_IDS = ["low", "mid", "high"] as const;

export type RiskBand = (typeof RISK_BAND_IDS)[number];

export const RiskBandSchema = z.enum(RISK_BAND_IDS);

/** Inclusive lower bound of each band on the 0–100 scale. */
export const RISK_BAND_MIN: Record<RiskBand, number> = {
  low: 0,
  mid: 20,
  high: 60,
};

export type RiskBandDescriptor = {
  readonly id: RiskBand;
  /** Full phrase for headings: "High Impact Potential". */
  readonly label: string;
  /** One word for pills and tables: "High". */
  readonly short: string;
  /** Design-system tone token, not a raw colour. */
  readonly tone: RiskBand;
};

export const RISK_BANDS: Record<RiskBand, RiskBandDescriptor> = {
  high: {
    id: "high",
    label: "High Impact Potential",
    short: "High",
    tone: "high",
  },
  mid: { id: "mid", label: "Moderate Impact", short: "Moderate", tone: "mid" },
  low: { id: "low", label: "Low Impact", short: "Low", tone: "low" },
};

/** Band a 0–100 risk score. High ≥ 60, Mid ≥ 20, otherwise Low. */
export function riskToBand(score: number): RiskBand {
  // NaN compares false against every bound, so it would silently land in the
  // wrong band without this. Infinity is left to fall through as high.
  if (Number.isNaN(score)) return "low";
  if (score >= RISK_BAND_MIN.high) return "high";
  if (score >= RISK_BAND_MIN.mid) return "mid";
  return "low";
}

export function riskBandDescriptor(score: number): RiskBandDescriptor {
  return RISK_BANDS[riskToBand(score)];
}
