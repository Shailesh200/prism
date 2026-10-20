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
  it("VAL-1 states no saving at all", () => {
    const value = sessionValue({
      filesCovered: 6,
      current: base,
      earlier: [],
    });
    expect(value).not.toHaveProperty("estimatedSaved");
    expect(sessionValueLine(value)).toBe(
      "Prism: remembered 6 files for next time",
    );
  });

  it("VAL-2 is deterministic for a recorded session", () => {
    const input = {
      filesCovered: 5,
      current: base,
      earlier: [failed("a1")],
    };
    expect(sessionValue(input)).toEqual(sessionValue(input));
    expect(sessionValueLine(sessionValue(input))).toBe(
      "Prism: remembered 5 files for next time · 1 issue caught",
    );
  });

  it("VAL-3 the stop receipt never claims tokens or a saving (2.0.0)", () => {
    const value = sessionValue({
      filesCovered: 5,
      current: base,
      earlier: [failed("a1")],
    });
    // A receipt stored before this change may still carry the old key.
    const stale = { ...value, estimatedSaved: 7500 } as typeof value;
    const negative = { ...value, estimatedSaved: -6000 } as typeof value;
    for (const v of [value, stale, negative]) {
      const line = sessionValueLine(v) ?? "";
      expect(line).not.toMatch(/tokens|saved/i);
      const text = renderReceipt({ ...base, value: v });
      expect(text).toContain("Prism: remembered 5 files for next time");
      expect(text).not.toMatch(/tokens|saved/i);
    }
  });

  it("VAL-4 counts only NO-SHIP issues that are fixed by this stop", () => {
    const stillFailing = sessionValue({
      filesCovered: 0,
      current: failed("c", "test"),
      earlier: [failed("e1", "test"), failed("e2", "typecheck")],
    });
    // `test` still fails now; only `typecheck` was fixed.
    expect(stillFailing.issuesCaught).toBe(1);
    const notProven = sessionValue({
      filesCovered: 0,
      current: base,
      earlier: [
        { ...base, id: "n1", verdict: "not_proven", reason: "untested" },
      ],
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
            issuesCaught: 0,
            checksSuggested: 0,
          },
        },
      ],
    });
    expect(value.filesRemembered).toBe(2);
    expect(sessionValueLine(value)).toBe(
      "Prism: remembered 2 files for next time",
    );
    // Nothing new and nothing caught: no line at all.
    expect(sessionValueLine({ ...value, filesRemembered: 0 })).toBeNull();
  });
});
