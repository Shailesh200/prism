import { describe, expect, it } from "vitest";
import type { ChangeReceipt } from "./receipt.js";
import { renderReceipt } from "./receipt-render.js";
import { sessionValue, sessionValueLine } from "./session-value.js";

const base: ChangeReceipt = {
  id: "0123456789abcdef",
  diffHash: "d",
  generatedAt: "2026-10-10T00:00:00.000Z",
  verdict: "proven",
  checksState: "done",
  unsupported: [],
  touched: {
    files: ["src/a.ts"],
    totalFiles: 1,
    dependents: 0,
    truncated: false,
  },
  checks: [{ name: "test", status: "passed", detail: "", durationMs: 1 }],
  testMode: "scoped",
  testFiles: ["src/a.test.ts"],
  notProven: [],
  flags: [],
  durationMs: 1,
};

const failed = (id: string, name = "test"): ChangeReceipt => ({
  ...base,
  id,
  verdict: "failed",
  checks: [
    { name, status: "failed", detail: "FAIL", durationMs: 1, cause: "caused" },
  ],
});

describe("P13 session value line", () => {
  it("VAL-1 leaves the saving out until a calibration exists", () => {
    const value = sessionValue({
      filesCovered: 6,
      current: base,
      earlier: [],
      tokensPerFile: null,
    });
    expect(value.estimatedSaved).toBeNull();
    expect(sessionValueLine(value)).toBe(
      "Prism: remembered 6 files for next time",
    );
  });

  it("VAL-2 is deterministic for a recorded session", () => {
    const input = {
      filesCovered: 5,
      current: base,
      earlier: [failed("a1")],
      tokensPerFile: 1500,
    };
    expect(sessionValue(input)).toEqual(sessionValue(input));
    expect(sessionValueLine(sessionValue(input))).toBe(
      "Prism: saved ~7.5k tokens · remembered 5 files for next time · 1 issue caught",
    );
  });

  it("VAL-3 shows negative savings as a cost", () => {
    const value = {
      ...sessionValue({
        filesCovered: 2,
        current: base,
        earlier: [],
        tokensPerFile: null,
      }),
      estimatedSaved: -6000,
    };
    expect(sessionValueLine(value)).toContain(
      "Prism: cost ~6.0k more tokens than it saved",
    );
  });

  it("VAL-4 counts only NO-SHIP issues that are fixed by this stop", () => {
    const stillFailing = sessionValue({
      filesCovered: 0,
      current: failed("c", "test"),
      earlier: [failed("e1", "test"), failed("e2", "typecheck")],
      tokensPerFile: null,
    });
    // `test` still fails now; only `typecheck` was fixed.
    expect(stillFailing.issuesCaught).toBe(1);
    const notProven = sessionValue({
      filesCovered: 0,
      current: base,
      earlier: [
        { ...base, id: "n1", verdict: "not_proven", reason: "untested" },
      ],
      tokensPerFile: null,
    });
    expect(notProven.issuesCaught).toBe(0);
  });

  it("counts distinct suggested proofs and prints the line on the receipt", () => {
    const proof = {
      command: "npm run typecheck",
      cwd: ".",
      proves: ["src/a.ts"],
    };
    const value = sessionValue({
      filesCovered: 1,
      current: { ...base, proof },
      earlier: [{ ...base, id: "p1", proof }],
      tokensPerFile: null,
    });
    expect(value.checksSuggested).toBe(1);
    expect(renderReceipt({ ...base, value })).toContain(
      "Prism: remembered 1 file for next time",
    );
    expect(sessionValueLine({ ...value, filesRemembered: 0 })).toBeNull();
  });

  it("round 2: remembers only what this turn added to session memory", () => {
    const value = sessionValue({
      filesCovered: 5,
      current: base,
      earlier: [
        {
          ...base,
          id: "turn1",
          value: {
            filesCovered: 3,
            estimatedSaved: null,
            issuesCaught: 0,
            checksSuggested: 0,
          },
        },
      ],
      tokensPerFile: null,
    });
    expect(value.filesRemembered).toBe(2);
    expect(sessionValueLine(value)).toBe(
      "Prism: remembered 2 files for next time",
    );
    // Nothing calibrated and nothing new: no line at all.
    expect(sessionValueLine({ ...value, filesRemembered: 0 })).toBeNull();
  });
});
