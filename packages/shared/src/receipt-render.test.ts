import { describe, expect, it } from "vitest";
import type { ChangeReceipt } from "./receipt.js";
import {
  receiptFeedback,
  receiptHeadline,
  renderReceipt,
  renderReceiptMarkdown,
  renderReceiptSvg,
} from "./receipt-render.js";

const base: ChangeReceipt = {
  generatedAt: "2026-10-10T00:00:00.000Z",
  verdict: "failed",
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
    expect(receiptHeadline(base)).toBe("Prism · failed (1 check)");
    const text = renderReceipt(base);
    expect(text.split("\n")[0]).toBe("Prism · failed (1 check)");
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
    expect(md.split("\n")[0]).toBe("### Prism · failed (1 check)");
    expect(md).toContain("| **Failed** | `test` — FAIL src/a.test.ts |");
    expect(md).toContain("| Already failing | `lint` — no-unused-vars |");
  });

  it("renders a self-contained SVG card with escaped text", () => {
    const svg = renderReceiptSvg({
      ...base,
      notProven: [{ path: "src/<x>.ts", reason: "no test reaches it" }],
    });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Prism · failed (1 check)");
    expect(svg).toContain("src/&lt;x&gt;.ts");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
});
