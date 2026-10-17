import { describe, expect, it } from "vitest";
import type { ChangeReceipt } from "./receipt.js";
import { shipVerdict } from "./receipt.js";
import { cheapestProof, recordedCheckDurations } from "./receipt-proof.js";
import {
  proofLine,
  receiptFindings,
  renderReceipt,
  renderReceiptMarkdown,
} from "./receipt-render.js";

const base: ChangeReceipt = {
  id: "0123456789abcdef",
  diffHash: "d1ff",
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
  checks: [{ name: "test", status: "passed", detail: "", durationMs: 900 }],
  testMode: "scoped",
  testFiles: ["src/a.test.ts"],
  notProven: [],
  flags: [],
  durationMs: 10,
};

describe("P11 verdict-first receipt", () => {
  it("RV-1 the verdict is line 1 for each state", () => {
    const states: [ChangeReceipt, string][] = [
      [base, "Prism · SHIP"],
      [
        { ...base, verdict: "not_proven", reason: "untested" },
        "Prism · NOT PROVEN (untested)",
      ],
      [
        {
          ...base,
          verdict: "failed",
          checks: [
            {
              name: "test",
              status: "failed",
              detail: "FAIL",
              durationMs: 1,
              cause: "caused",
            },
          ],
        },
        "Prism · NO-SHIP (1 check failed)",
      ],
    ];
    for (const [receipt, line] of states) {
      expect(renderReceipt(receipt).split("\n")[0]).toBe(line);
      expect(renderReceiptMarkdown(receipt).split("\n")[0]).toBe(`### ${line}`);
    }
  });

  it("RV-1 an off-limits path touched is NO-SHIP even when tests pass", () => {
    const receipt: ChangeReceipt = {
      ...base,
      lensFindings: [
        {
          lens: "security",
          check: "off_limits_touched",
          status: "fail",
          evidence: ["infra/prod.tf (off-limits)"],
        },
      ],
    };
    expect(shipVerdict(receipt)).toBe("NO-SHIP");
    expect(renderReceipt(receipt).split("\n")[0]).toBe(
      "Prism · NO-SHIP (1 off-limits path)",
    );
  });

  it("RV-3 an already-failing check alone never yields NO-SHIP", () => {
    const receipt: ChangeReceipt = {
      ...base,
      verdict: "not_proven",
      reason: "already_failing",
      checks: [
        {
          name: "test",
          status: "failed",
          detail: "FAIL src/a.test.ts",
          durationMs: 1,
          cause: "already-failing",
        },
      ],
    };
    expect(shipVerdict(receipt)).toBe("NOT PROVEN");
  });

  it("RV-2 findings several sources agree on come first", () => {
    const receipt: ChangeReceipt = {
      ...base,
      verdict: "failed",
      checks: [
        {
          name: "test",
          status: "failed",
          detail: "FAIL src/b.ts > adds",
          durationMs: 1,
          cause: "caused",
        },
      ],
      flags: [
        {
          path: "src/a.ts",
          kind: "boundary",
          detail: "reaches into pkg internals",
        },
        {
          path: "src/b.ts",
          kind: "orphan",
          detail: "nothing imports this file",
        },
      ],
    };
    const ordered = receiptFindings(receipt).map((f) => f.where);
    // src/b.ts: orphan flag + the failing test agree; src/a.ts has one source.
    expect(ordered).toEqual(["src/b.ts", "src/a.ts"]);
  });

  it("NP-2 picks the widest proof, then the fastest recorded", () => {
    const durations = recordedCheckDurations([
      {
        ...base,
        checks: [
          {
            name: "pkg: typecheck",
            status: "passed",
            detail: "",
            durationMs: 4000,
          },
          { name: "pkg: test", status: "passed", detail: "", durationMs: 9000 },
        ],
      },
      {
        ...base,
        checks: [
          {
            name: "pkg: typecheck",
            status: "passed",
            detail: "",
            durationMs: 3000,
          },
          {
            name: "pkg: test",
            status: "timeout",
            detail: "",
            durationMs: 60000,
          },
        ],
      },
    ]);
    expect(durations.get("pkg: typecheck")).toBe(3000);
    expect(durations.get("pkg: test")).toBe(9000);
    const proof = cheapestProof(
      [
        {
          command: "npx vitest run a.test.ts",
          cwd: "pkg",
          check: "pkg: test",
          proves: ["pkg/a.ts"],
        },
        {
          command: "npm run typecheck",
          cwd: "pkg",
          check: "pkg: typecheck",
          proves: ["pkg/a.ts"],
        },
        {
          command: "node --check b.js",
          cwd: "pkg",
          check: "node --check b.js",
          proves: [],
        },
      ],
      durations,
    );
    expect(proof).toEqual({
      command: "npm run typecheck",
      cwd: "pkg",
      estimateMs: 3000,
      proves: ["pkg/a.ts"],
    });
    expect(proofLine(proof!)).toBe(
      "run: npm run typecheck (in pkg, ~3 s) → proves pkg/a.ts",
    );
    const wider = cheapestProof(
      [
        {
          command: "npm run typecheck",
          cwd: ".",
          check: "typecheck",
          proves: ["a.ts"],
        },
        {
          command: "npx vitest run x.test.ts",
          cwd: ".",
          check: "test",
          proves: ["a.ts", "b.ts"],
        },
      ],
      durations,
    );
    expect(wider?.proves).toEqual(["a.ts", "b.ts"]);
  });

  it("NP-3 a NOT PROVEN receipt prints its runnable proof", () => {
    const receipt: ChangeReceipt = {
      ...base,
      verdict: "not_proven",
      reason: "untested",
      notProven: [{ path: "src/a.ts", reason: "no test reaches it" }],
      proof: {
        command: "npx tsc --noEmit -p .",
        cwd: ".",
        proves: ["src/a.ts"],
      },
    };
    expect(renderReceipt(receipt)).toMatch(
      /Prove it\s+run: npx tsc --noEmit -p \. → proves src\/a\.ts/,
    );
    expect(renderReceiptMarkdown(receipt)).toContain(
      "| Prove it | run: npx tsc",
    );
  });
});
