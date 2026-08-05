/**
 * `--fail-on` and `--limit` (M-029).
 *
 * `--fail-on` is the reason a CLI exists. Reading a report is what the editor
 * is for; a terminal earns its place when `prism blast src/x.ts --fail-on high`
 * can fail a pipeline. One implementation over the shared band type, so no
 * command invents its own idea of what "high" means.
 */

import {
  PrismErrorCode,
  RISK_BAND_IDS,
  err,
  ok,
  prismError,
  riskToBand,
  type PrismError,
  type Result,
  type RiskBand,
} from "@prism/shared";

/** Bands ordered by severity, so "at or above" is an index comparison. */
const SEVERITY: readonly RiskBand[] = ["low", "mid", "high"];

export function parseFailOn(
  value: string | undefined,
): Result<RiskBand | undefined, PrismError> {
  if (value === undefined) return ok(undefined);
  const normalized = value.trim().toLowerCase();
  const band = RISK_BAND_IDS.find((id) => id === normalized);
  if (!band) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `--fail-on expects one of ${RISK_BAND_IDS.join(", ")}, got '${value}'`,
      ),
    );
  }
  return ok(band);
}

/**
 * Whether a score is at or above the threshold band.
 *
 * The comparison is on bands rather than raw numbers so that the CLI and the
 * UI agree at the boundary: 60 is High in both, or in neither.
 */
export function meetsThreshold(
  score: number,
  threshold: RiskBand | undefined,
): boolean {
  if (threshold === undefined) return false;
  return SEVERITY.indexOf(riskToBand(score)) >= SEVERITY.indexOf(threshold);
}

/**
 * `--fail-on` on a command that counts things rather than scoring them, e.g.
 * `prism cycles --fail-on any`. Kept separate from the band version because
 * conflating "risky" with "non-empty" would make one flag mean two things.
 */
export function parseFailOnCount(
  value: string | undefined,
): Result<number | undefined, PrismError> {
  if (value === undefined) return ok(undefined);
  const normalized = value.trim().toLowerCase();
  if (normalized === "any") return ok(1);
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `--fail-on expects 'any' or a non-negative count, got '${value}'`,
      ),
    );
  }
  return ok(parsed);
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 1000;

export function parseLimit(
  value: string | undefined,
): Result<number, PrismError> {
  if (value === undefined) return ok(DEFAULT_LIMIT);
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `--limit expects a positive integer, got '${value}'`,
      ),
    );
  }
  return ok(Math.min(parsed, MAX_LIMIT));
}

export type Bounded<T> = {
  readonly items: readonly T[];
  readonly totalCount: number;
  readonly truncated: boolean;
  readonly limit: number;
};

/**
 * Bound a list for display, keeping the total.
 *
 * A truncated list that does not say so is a lie about the repository, and the
 * count is often the answer the user wanted anyway.
 */
export function bound<T>(items: readonly T[], limit: number): Bounded<T> {
  return {
    items: items.slice(0, limit),
    totalCount: items.length,
    truncated: items.length > limit,
    limit,
  };
}

/** The line that admits a list was cut short. */
export function truncationNote<T>(bounded: Bounded<T>, noun: string): string {
  if (!bounded.truncated) return "";
  return `… ${bounded.totalCount - bounded.items.length} more ${noun} (showing ${bounded.limit}; use --limit)`;
}
