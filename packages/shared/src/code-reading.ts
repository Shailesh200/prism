/**
 * The review a developer reads. Risk only decides which files are opened.
 * Prism does not call a model. The host reads the named files and writes
 * the findings. Notes already on the pack are proven and stay Critical.
 */

import { isOperationalPath } from "./operational-judge.js";

export const CODE_READING_ORDER = [
  "correct",
  "safe",
  "load",
  "tested",
  "speed",
  "lean",
] as const;

export const CODE_READING_RULES = [
  "Read each named file, then only the callers and tests listed with it. A caller that is not listed was not measured.",
  "Read in this order: correct, safe, load, tested, speed, then smaller code. Say whether this is one person or many at once, and judge load against that.",
  "Correct: a wrong result, a crash, an empty or last-item case, a caller this change breaks.",
  "Safe: injection, a missing check on outside input, a secret, a write that can lose data.",
  "Tested: new risky logic with no test that fails when it breaks.",
  "Speed: a big slowdown is Low or High. A small repeated cost is a Nit.",
  "Smaller code: dead code, a copy of a helper that already exists, a dependency for a few lines. Prefer a change that deletes code.",
  "Every finding needs a concrete case: this input leads to this wrong result. No case, no finding.",
  "Write what the change does in two or three sentences, then the finding count. Do not put a Receipt on that line.",
  "Group findings as Critical, High, Low, and Nit. Bold each group title. Number findings straight through. Leave empty groups out.",
  "Bold each finding title, then the path. Under it, an unordered list: This code, Breaks when, Change, and Left as is.",
  "Critical: a wrong result, a security hole, lost data, or a change that does the opposite of what it is for.",
  "High: an edge that can happen, new risky logic with no test that fails when it breaks, or behavior that will not hold at the real load.",
  "Low: a duplicate, a slower path, or a bounded case that does not change the outcome for the way this code is used.",
  "Nit: a line that can go, a name, or a comment.",
  "Notes already on this pack are proven. Keep them. Do not soften a Critical.",
  "After the findings, one explanation line and no Receipt label. Then one line for what was not opened.",
  "End with one Receipt only: the verdict, then the cheapest check or fix when it is not SHIP. NO-SHIP if any finding is Critical. NOT PROVEN if any finding is High. Otherwise SHIP.",
  "Do not print risk scores.",
] as const;

export const REVIEW_SEVERITIES = ["critical", "high", "low", "nit"] as const;

export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export type ReviewNote = {
  severity: ReviewSeverity;
  title: string;
  where: string;
  thisCode: string;
  breaksWhen: string;
  change: string;
  leftAsIs: string;
};

export type ReviewReceipt = {
  verdict: "SHIP" | "NOT PROVEN" | "NO-SHIP";
  why: string;
  next: string;
};

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
  notes: ReviewNote[];
  receipt: ReviewReceipt;
  notChecked: string;
};

/** A proven wrong result is Critical. The host must not soften it. */
export function noteFromProven(item: {
  what: string;
  where: string;
  fix: string;
}): ReviewNote {
  const title = item.what.split(". ")[0] ?? item.what;
  return {
    severity: "critical",
    title,
    where: item.where,
    thisCode: "This file decides what runs.",
    breaksWhen: item.what,
    change: item.fix,
    leftAsIs: "What this file is for does not happen.",
  };
}

/**
 * Receipt from the findings so far. A Critical finding is NO-SHIP.
 * A High finding, or named files nobody has read, is NOT PROVEN.
 */
export function reviewReceipt(input: {
  readonly notes: readonly ReviewNote[];
  readonly unread: boolean;
}): ReviewReceipt {
  const critical = input.notes.find((note) => note.severity === "critical");
  if (critical) {
    return {
      verdict: "NO-SHIP",
      why: critical.title,
      next: "Fix the Critical findings, then review again.",
    };
  }
  const high = input.notes.find((note) => note.severity === "high");
  if (high) {
    return {
      verdict: "NOT PROVEN",
      why: high.title,
      next: "Fix the High findings, or run the check they name.",
    };
  }
  if (input.unread) {
    return {
      verdict: "NOT PROVEN",
      why: "The named files have not been read yet.",
      next: "Read them, then write any findings in this same shape.",
    };
  }
  return {
    verdict: "SHIP",
    why: "No Critical or High finding.",
    next: "",
  };
}

export function buildCodeReading(input: {
  readonly targets: readonly CodeReadingTarget[];
  readonly proven?: readonly {
    what: string;
    where: string;
    fix: string;
  }[];
  readonly truncated?: { readonly total: number; readonly analysed: number };
}): CodeReading {
  const source = input.targets.filter(
    (target) => !isOperationalPath(target.path),
  );
  const targets = [...source]
    .sort((a, b) => b.risk - a.risk || a.path.localeCompare(b.path))
    .slice(0, CODE_READING_TARGETS);
  const skipped = input.truncated
    ? input.truncated.total - input.truncated.analysed
    : 0;
  const notChecked =
    skipped > 0
      ? `${skipped} changed files were not opened. The named files are the ones to read. Command files are judged apart from that list.`
      : "Callers beyond the five listed on a file were not named.";
  const proven = [...(input.proven ?? [])];
  const notes = proven.map((item) => noteFromProven(item));
  const listed = targets.map((target) => ({
    path: target.path,
    risk: target.risk,
    callers: [...target.callers],
    tests: [...target.tests],
  }));
  return {
    order: [...CODE_READING_ORDER],
    rules: [...CODE_READING_RULES],
    targets: listed,
    proven,
    notes,
    receipt: reviewReceipt({ notes, unread: listed.length > 0 }),
    notChecked,
  };
}
