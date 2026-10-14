/**
 * What a failing check failed on, read from its output (M-092).
 *
 * The receipt compares this before and after a change to tell a failure the
 * change caused from one that was already there. It only needs to be good
 * enough to answer "did anything new fail?", so it reads the shapes the
 * common runners print and otherwise falls back to the first failure line.
 */

export type FailureSignature = {
  /** Files named as failing (test files, or files with type/lint errors). */
  readonly files: readonly string[];
  /** Failing tests or reported errors, when the output says how many. */
  readonly count: number;
};

// oxlint-disable-next-line no-control-regex -- terminal colour codes are the point
const ANSI = /\u001b\[[0-9;]*m/g;

/** vitest / jest: ` FAIL  src/a.test.ts > suite > name` or `FAIL src/a.test.ts`. */
const TEST_FAIL =
  /^\s*(?:FAIL|×|✗)\s+(?:\|[^|]+\|\s+)?([^\s>]+\.(?:test|spec)\.[cm]?[jt]sx?)/;
/** tsc: `src/a.ts(3,4): error TS2322` or `src/a.ts:3:4 - error TS2322`. */
const TSC_ERROR =
  /^([^\s(:]+\.[cm]?[jt]sx?)(?:\(\d+,\d+\)|:\d+:\d+)\s*-?\s*:?\s*error\b/;
/** oxlint / eslint: `  ╭─[src/a.ts:3:4]` or an eslint file header line. */
const LINT_FILE = /^\s*(?:╭─\[)?([^\s[\]:]+\.[cm]?[jt]sx?):\d+:\d+\]?/;
const FAILED_COUNT = /Tests?\s+(\d+)\s+failed/i;
const ERROR_COUNT = /Found\s+(\d+)\s+errors?/i;

export function failureSignature(output: string): FailureSignature {
  const files = new Set<string>();
  let errors = 0;
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.replace(ANSI, "");
    const test = TEST_FAIL.exec(line);
    if (test) {
      files.add(test[1]!);
      continue;
    }
    const tsc = TSC_ERROR.exec(line);
    if (tsc) {
      files.add(tsc[1]!);
      errors += 1;
      continue;
    }
    const lint = LINT_FILE.exec(line);
    if (lint && /error|✗|×/i.test(line)) files.add(lint[1]!);
  }
  const clean = output.replace(ANSI, "");
  const failedTests = FAILED_COUNT.exec(clean);
  const foundErrors = ERROR_COUNT.exec(clean);
  const count = failedTests
    ? Number(failedTests[1])
    : foundErrors
      ? Number(foundErrors[1])
      : errors || files.size;
  return { files: [...files].sort(), count };
}

/**
 * True when `now` shows nothing the `before` run did not: no new failing
 * file and no more failures. Two empty signatures say nothing, so they never
 * count as the same failure.
 */
export function failureIsPreexisting(
  before: FailureSignature,
  now: FailureSignature,
): boolean {
  if (now.files.length === 0 && before.files.length === 0) return false;
  const known = new Set(before.files);
  if (now.files.some((file) => !known.has(file))) return false;
  return now.count <= before.count;
}
