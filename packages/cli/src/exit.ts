/**
 * Exit codes (M-028).
 *
 * The distinction that makes the CLI usable in CI is between *"ran fine, and
 * what it found is bad"* and *"did not run"*. A tool that returns 1 for both
 * forces every pipeline to parse output to tell them apart.
 */

import { PrismErrorCode, type PrismError } from "@prism/shared";

export const ExitCode = {
  /** Ran, and found nothing the user asked to be warned about. */
  OK: 0,
  /** Ran fine; the analysis found the problem the user asked about. */
  FINDINGS: 1,
  /** The command line was wrong: unknown flag, bad argument, missing input. */
  USAGE: 2,
  /** Prism failed: indexing broke, I/O failed, a bug. */
  INTERNAL: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

/**
 * A Core failure is a usage error when the user could fix it by typing
 * something different, and an internal error when they could not.
 */
export function exitCodeForError(error: PrismError): ExitCode {
  switch (error.code) {
    case PrismErrorCode.VALIDATION:
    case PrismErrorCode.NOT_FOUND:
    case PrismErrorCode.INVALID_PATH:
    case PrismErrorCode.INVALID_ID:
    case PrismErrorCode.UNSUPPORTED:
      return ExitCode.USAGE;
    default:
      return ExitCode.INTERNAL;
  }
}
