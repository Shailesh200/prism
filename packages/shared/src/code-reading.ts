/**
 * The reading half of a review. Blast radius says what can break. This says
 * which files to open and how to judge them: correct, safe, load, tested,
 * speed, then lean. A finding without a concrete case is not a finding.
 * Prism does not call a model. The host writes the prose from this pack.
 */

export const CODE_READING_ORDER = [
  "correct",
  "safe",
  "load",
  "tested",
  "speed",
  "lean",
] as const;

export const CODE_READING_RULES = [
  "Read the file, then the callers and tests listed here. A caller that is not listed was not measured.",
  "Correct: a wrong result, a crash, an empty or last-item case, a caller this change breaks.",
  "Safe: injection, a missing check on outside input, a secret, a write that can lose data.",
  "Load: say whether this is one person or many at once. A check-then-write race or a list that only grows is a finding only at that load.",
  "Tested: new risky logic (a branch, a parser, a security check) with no test that fails when it breaks.",
  "Speed: a big slowdown. A small repeated cost is a suggestion.",
  "Lean: dead code, a copy of a helper that already exists, a dependency for a few lines. Prefer a fix that deletes code.",
  "Every finding needs a concrete case: this input leads to this wrong result. No case, no finding.",
  "Write what the change does, then numbered findings (what this is, problem, fix, if we skip it), then Ship or which numbers to fix first.",
] as const;

/** How many of the riskiest files the reading pack names. */
export const CODE_READING_TARGETS = 8;

export type CodeReadingTarget = {
  path: string;
  risk: number;
  callers: string[];
  tests: string[];
};

export type CodeReading = {
  order: string[];
  rules: string[];
  targets: CodeReadingTarget[];
  proven: { what: string; where: string; fix: string }[];
  notChecked: string;
};

export function buildCodeReading(input: {
  readonly targets: readonly CodeReadingTarget[];
  readonly proven?: readonly {
    what: string;
    where: string;
    fix: string;
  }[];
  readonly truncated?: { readonly total: number; readonly analysed: number };
}): CodeReading {
  const targets = [...input.targets]
    .sort((a, b) => b.risk - a.risk || a.path.localeCompare(b.path))
    .slice(0, CODE_READING_TARGETS);
  const skipped = input.truncated
    ? input.truncated.total - input.truncated.analysed
    : 0;
  const notChecked =
    skipped > 0
      ? `${skipped} changed files were not opened. The pack is the highest-import source files plus workflows and vercel.json.`
      : "Every changed file was in the measured set. Callers beyond the five listed on a file were not named.";
  return {
    order: [...CODE_READING_ORDER],
    rules: [...CODE_READING_RULES],
    targets: targets.map((target) => ({
      path: target.path,
      risk: target.risk,
      callers: [...target.callers],
      tests: [...target.tests],
    })),
    proven: [...(input.proven ?? [])],
    notChecked,
  };
}
