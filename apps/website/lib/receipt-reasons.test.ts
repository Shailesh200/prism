import { NOT_PROVEN_REASONS } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import { RECEIPT_REASONS } from "./receipt-reasons";

/** Muse's approved wording, per code. Switch to REASON_LABEL after #13. */
const APPROVED: Record<string, readonly [label: string, means: string]> = {
  untested: ["no tests reach this change", "No test covers the changed code."],
  no_node_modules: [
    "dependencies not installed",
    "Install dependencies so the tests can run.",
  ],
  unknown_runner: [
    "no known test runner",
    "Prism couldn't find how this repo runs tests.",
  ],
  skipped_offline: [
    "checks skipped",
    "Checks didn't run, either because you're offline or because they're turned off.",
  ],
  still_running: [
    "checks still running",
    "The verdict comes with your next receipt.",
  ],
  timeout: ["checks timed out", "A check ran past its time limit."],
  already_failing: [
    "tests already failing",
    "They failed before this change too.",
  ],
  baseline_unknown: [
    "can't tell if this failure is new",
    'Prism couldn\'t compare with a clean "before" run.',
  ],
  outside_change: [
    "failure is in files outside this change",
    "The failing files aren't part of this change.",
  ],
  unsupported_language: [
    "unsupported language",
    "Prism can't check this language yet.",
  ],
  superseded: [
    "replaced by a newer change",
    "A later receipt replaced this one.",
  ],
};

describe("NOT PROVEN reasons on the receipts page", () => {
  it("words each code exactly as approved", () => {
    for (const r of RECEIPT_REASONS) {
      expect([r.code, r.label, r.means]).toEqual([
        r.code,
        ...APPROVED[r.code]!,
      ]);
    }
  });

  it("lists every approved code once", () => {
    const codes = RECEIPT_REASONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.toSorted()).toEqual(Object.keys(APPROVED).toSorted());
  });

  it("covers every reason the receipt can give", () => {
    const codes = new Set(RECEIPT_REASONS.map((r) => r.code));
    for (const reason of NOT_PROVEN_REASONS) expect(codes).toContain(reason);
  });

  it("shows labels, not raw codes", () => {
    for (const r of RECEIPT_REASONS) expect(r.label).not.toMatch(/_/);
  });
});
