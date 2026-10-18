import { describe, expect, it } from "vitest";
import type { ChangeReceipt } from "./receipt.js";
import {
  receiptFeedback,
  receiptHeadline,
  receiptSummaryLine,
  renderReceipt,
  renderReceiptMarkdown,
  renderReceiptSvg,
} from "./receipt-render.js";

const base: ChangeReceipt = {
  id: "0123456789abcdef",
  diffHash: "d1ff",
  generatedAt: "2026-10-10T00:00:00.000Z",
  verdict: "failed",
  checksState: "done",
  unsupported: [],
  touched: {
    files: ["src/a.ts"],
    totalFiles: 1,
    dependents: 4,
    truncated: false,
  },
  checks: [
    { name: "typecheck", status: "passed", detail: "", durationMs: 10 },
    {
      name: "test",
      status: "failed",
      detail: "FAIL src/a.test.ts",
      durationMs: 20,
      cause: "caused",
    },
    {
      name: "lint",
      status: "failed",
      detail: "no-unused-vars",
      durationMs: 5,
      cause: "already-failing",
    },
  ],
  testMode: "scoped",
  testFiles: ["src/a.test.ts"],
  notProven: [],
  flags: [],
  durationMs: 2400,
};

describe("receipt renderers", () => {
  it("leads with the verdict and counts only blocking failures", () => {
    expect(receiptHeadline(base)).toBe("Prism · NO-SHIP (1 check failed)");
    const text = renderReceipt(base);
    expect(text.split("\n")[0]).toBe("Prism · NO-SHIP (1 check failed)");
    expect(text).toMatch(/Failed\s+test ✗ FAIL src\/a\.test\.ts/);
    expect(text).toMatch(/Already failing\s+lint — no-unused-vars/);
    expect(text).toMatch(/Proven\s+1 scoped test file · typecheck ✓/);
  });

  it("asks the agent to fix only what it caused", () => {
    const feedback = receiptFeedback(base) ?? "";
    expect(feedback).toMatch(/- test: FAIL src\/a\.test\.ts/);
    expect(feedback).not.toMatch(/- lint/);
    expect(feedback).toMatch(/Already failing before this session.*lint/);
  });

  it("renders a markdown table for a PR comment", () => {
    const md = renderReceiptMarkdown(base);
    expect(md.split("\n")[0]).toBe("### Prism · NO-SHIP (1 check failed)");
    expect(md).toContain("| **Failed** | `test` — FAIL src/a.test.ts |");
    expect(md).toContain("| Already failing | `lint` — no-unused-vars |");
  });

  it("renders a self-contained SVG card with escaped text", () => {
    const svg = renderReceiptSvg({
      ...base,
      notProven: [{ path: "src/<x>.ts", reason: "no test reaches it" }],
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Prism · NO-SHIP (1 check failed)");
    expect(svg).toContain("src/&lt;x&gt;.ts");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});

describe("receipt summary line (SMK-8)", () => {
  it("reads changed files, dependents, reaching tests and the verdict", () => {
    const proven: ChangeReceipt = {
      ...base,
      verdict: "proven",
      checks: [{ name: "test", status: "passed", detail: "", durationMs: 1 }],
      touched: { ...base.touched, dependents: 3 },
      testFiles: ["src/a.test.ts", "src/b.test.ts"],
    };
    expect(receiptSummaryLine(proven)).toBe(
      "Prism receipt: changed 1 file, 3 dependents, 2 tests reach it — SHIP",
    );
    const missing: ChangeReceipt = {
      ...proven,
      verdict: "not_proven",
      reason: "no_node_modules",
      checks: [],
      checksState: "skipped",
    };
    expect(receiptSummaryLine(missing)).toMatch(
      /— NOT PROVEN \(no_node_modules\)$/,
    );
    expect(receiptHeadline(missing)).toBe(
      "Prism · NOT PROVEN (no_node_modules)",
    );
  });

  it("says checks are still running while they run", () => {
    const pending: ChangeReceipt = {
      ...base,
      verdict: "not_proven",
      reason: "still_running",
      checksState: "pending",
      checks: [],
    };
    expect(renderReceipt(pending)).toMatch(/checks still running/);
  });

  it("shows the earlier change's finished verdict under a pending one", () => {
    const pending: ChangeReceipt = {
      ...base,
      verdict: "not_proven",
      reason: "still_running",
      checksState: "pending",
      checks: [],
      earlier: {
        id: "r-old",
        verdict: "failed",
        summary: "changed 1 file, 2 dependents, 1 test reach it — NO-SHIP",
      },
    };
    expect(renderReceipt(pending).split("\n")[2]).toBe(
      "Earlier change  changed 1 file, 2 dependents, 1 test reach it — NO-SHIP",
    );
  });
});
