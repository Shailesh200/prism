import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { shipVerdictLabel, type ChangeReceipt } from "./receipt.js";
import { listStoredReceipts, writeStoredReceipt } from "./receipt-store.js";
import {
  receiptFeedback,
  receiptHeadline,
  receiptSummaryLine,
  receiptTerminalLine,
  renderReceipt,
  renderReceiptAtStop,
  renderReceiptMarkdown,
  renderReceiptSvg,
  renderReceiptTerminal,
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

  it("keeps still_running in what --json and stored receipts carry (Arc)", () => {
    // The stop hook's interim line is text only ("checking… verdict in a
    // moment"); the receipt, its stored copy and the CLI's --json `verdict`
    // still say still_running.
    const pending: ChangeReceipt = {
      ...base,
      verdict: "not_proven",
      reason: "still_running",
      checksState: "pending",
      checks: [],
    };
    const home = mkdtempSync(join(tmpdir(), "prism-interim-"));
    try {
      const env = { PRISM_HOME: home };
      writeStoredReceipt("/repo", pending, env);
      const [stored] = listStoredReceipts("/repo", env);
      expect(stored?.reason).toBe("still_running");
      expect(stored?.checksState).toBe("pending");
      expect(shipVerdictLabel(stored!)).toBe("NOT PROVEN (still_running)");
      expect(JSON.parse(JSON.stringify(stored))).toMatchObject({
        verdict: "not_proven",
        reason: "still_running",
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
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

describe("terminal line per verdict (Muse v2.1)", () => {
  const passed = [
    { name: "test", status: "passed" as const, detail: "", durationMs: 1 },
  ];
  const offLimits = (n: number): ChangeReceipt["lensFindings"] => [
    {
      lens: "Dev",
      check: "off_limits_touched",
      status: "fail",
      evidence: Array.from({ length: n }, (_, i) => `locked/f${i}.ts`),
    },
  ];
  const notProven = (reason: ChangeReceipt["reason"]): ChangeReceipt => ({
    ...base,
    verdict: "not_proven",
    reason,
    checks: [],
  });

  it("gives Muse's exact line for every row", () => {
    const rows: [ChangeReceipt, string][] = [
      [
        { ...base, verdict: "proven", checks: passed },
        "Prism · SHIP — the checks this change reaches passed",
      ],
      [base, "Prism · NO-SHIP (1 check failed) — the agent is fixing it"],
      [
        {
          ...base,
          verdict: "proven",
          checks: passed,
          lensFindings: offLimits(2),
        },
        "Prism · NO-SHIP (2 off-limits paths) — the agent is undoing those edits",
      ],
      [
        { ...base, lensFindings: offLimits(1) },
        "Prism · NO-SHIP (1 check failed, 1 off-limits path) — the agent is fixing it",
      ],
      [
        notProven("untested"),
        "Prism · NOT PROVEN (no tests reach this change) — add a test that covers it",
      ],
      [
        notProven("no_node_modules"),
        "Prism · NOT PROVEN (no_node_modules) — install dependencies to run its tests",
      ],
      [
        notProven("unknown_runner"),
        "Prism · NOT PROVEN (unknown_runner) — no known runner could run its tests",
      ],
      [
        notProven("skipped_offline"),
        "Prism · NOT PROVEN (skipped_offline) — checks are off for this run",
      ],
      [
        notProven("timeout"),
        "Prism · NOT PROVEN (timeout) — a check ran past its time limit",
      ],
      [
        notProven("already_failing"),
        "Prism · NOT PROVEN (tests already failing) — its tests failed before this session",
      ],
      [
        notProven("baseline_unknown"),
        "Prism · NOT PROVEN (can't tell if this failure is new) — a check failed; it may not be from this change",
      ],
      [
        notProven("unsupported_language"),
        "Prism · NOT PROVEN (unsupported_language) — only TS and JS files are checked",
      ],
      [
        notProven("superseded"),
        "Prism · NOT PROVEN (superseded) — a newer change replaced this one",
      ],
      [
        { ...notProven("still_running"), checksState: "pending" },
        "Prism · checking… still running",
      ],
      [
        notProven("still_running"),
        "Prism · NOT PROVEN (still_running) — no verdict yet; the next receipt shows it",
      ],
      [
        {
          ...base,
          verdict: "proven",
          checks: [],
          touched: { ...base.touched, files: [], totalFiles: 0 },
        },
        "Prism · nothing changed",
      ],
    ];
    for (const [receipt, line] of rows) {
      expect(receiptTerminalLine(receipt)).toBe(line);
    }
  });

  it("prism receipts opens with it and keeps the rest of the receipt", () => {
    const text = renderReceiptTerminal(base).split("\n");
    expect(text[0]).toBe(
      "Prism · NO-SHIP (1 check failed) — the agent is fixing it",
    );
    expect(text.slice(1)).toEqual(renderReceipt(base).split("\n").slice(1));
    // SMK-8's summary line is untouched.
    expect(text[1]).toBe(receiptSummaryLine(base));
  });

  it("prism receipts shows a pending receipt as checking, with no verdict word", () => {
    const pending: ChangeReceipt = {
      ...notProven("still_running"),
      checksState: "pending",
    };
    const text = renderReceiptTerminal(pending).split("\n");
    expect(text[0]).toBe("Prism · checking… still running");
    expect(text[1]).toBe(
      "Prism receipt: changed 1 file, 4 dependents, 1 test reach it",
    );
    expect(text.join("\n")).not.toMatch(/NOT PROVEN|SHIP/);
  });
});

describe("who a failure is blamed on: the baseline decides (M-092, Arc)", () => {
  const failing = (
    cause: "caused" | "already-failing" | "unknown",
  ): ChangeReceipt["checks"][number] => ({
    name: "test",
    status: "failed",
    detail: "FAIL src/a.test.ts",
    durationMs: 20,
    cause,
  });
  const at = (
    cause: "caused" | "already-failing" | "unknown",
  ): ChangeReceipt => ({
    ...base,
    ...(cause === "caused"
      ? { verdict: "failed" as const }
      : {
          verdict: "not_proven" as const,
          reason:
            cause === "unknown"
              ? ("baseline_unknown" as const)
              : ("already_failing" as const),
        }),
    checks: [failing(cause)],
  });
  const everything = (receipt: ChangeReceipt) =>
    [
      renderReceipt(receipt),
      renderReceiptTerminal(receipt),
      renderReceiptMarkdown(receipt),
      renderReceiptSvg(receipt),
      receiptFeedback(receipt) ?? "",
    ].join("\n");

  it("(a) passed at the baseline, failing now: NO-SHIP, and the agent fixes it", () => {
    const receipt = at("caused");
    expect(shipVerdictLabel(receipt)).toBe("NO-SHIP");
    expect(receiptTerminalLine(receipt)).toBe(
      "Prism · NO-SHIP (1 check failed) — the agent is fixing it",
    );
    expect(renderReceipt(receipt)).toMatch(
      /Failed\s+test ✗ FAIL src\/a\.test\.ts$/m,
    );
    expect(receiptFeedback(receipt)).toMatch(/they failed\. Fix these/);
  });

  it("(b) failed at the baseline too: NOT PROVEN (tests already failing), no blame", () => {
    const receipt = at("already-failing");
    expect(shipVerdictLabel(receipt)).toBe(
      "NOT PROVEN (tests already failing)",
    );
    expect(receiptTerminalLine(receipt)).toBe(
      "Prism · NOT PROVEN (tests already failing) — its tests failed before this session",
    );
    expect(receiptSummaryLine(receipt)).toMatch(
      /— NOT PROVEN \(tests already failing\)$/,
    );
    expect(renderReceipt(receipt)).toMatch(/Already failing\s+test/);
    expect(receiptFeedback(receipt)).toBeNull();
    expect(everything(receipt)).not.toMatch(/NO-SHIP|caused|fixing/i);
    // Muse's words on every surface, never the raw code (Arc).
    const stop = renderReceiptAtStop(receipt, false);
    expect(`${everything(receipt)}\n${stop}`).not.toContain("already_failing");
    expect(stop.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (tests already failing)",
    );
  });

  it("(c) no baseline or a different failure there: NOT PROVEN (can't tell…), never NO-SHIP", () => {
    const receipt = at("unknown");
    expect(shipVerdictLabel(receipt)).toBe(
      "NOT PROVEN (can't tell if this failure is new)",
    );
    expect(receiptTerminalLine(receipt)).toBe(
      "Prism · NOT PROVEN (can't tell if this failure is new) — a check failed; it may not be from this change",
    );
    expect(renderReceipt(receipt)).toMatch(
      /Failed\s+test ✗ FAIL src\/a\.test\.ts \(can't tell if new\)/,
    );
    expect(renderReceiptMarkdown(receipt)).toContain(
      "| Failed (can't tell if new) | `test` — FAIL src/a.test.ts |",
    );
    expect(receiptFeedback(receipt)).toBeNull();
    expect(everything(receipt)).not.toMatch(/NO-SHIP|SHIP —|caused|fixing/i);
  });

  it("(c) beside an off-limits edit: NO-SHIP for the edit only, nothing to fix", () => {
    const receipt: ChangeReceipt = {
      ...at("unknown"),
      lensFindings: [
        {
          lens: "Dev",
          check: "off_limits_touched",
          status: "fail",
          evidence: ["locked/a.ts"],
        },
      ],
    };
    expect(receiptTerminalLine(receipt)).toBe(
      "Prism · NO-SHIP (1 off-limits path) — the agent is undoing those edits",
    );
    expect(receiptFeedback(receipt)).toBeNull();
  });
});

describe("stop text without the plugin's daemon path (renderReceiptAtStop)", () => {
  const pending: ChangeReceipt = {
    ...base,
    verdict: "not_proven",
    reason: "still_running",
    checksState: "pending",
    checks: [],
    earlier: { id: "r0", verdict: "proven", summary: "changed 1 file — SHIP" },
  };

  it("daemon answered: checking, with the verdict on the next receipt", () => {
    expect(renderReceiptAtStop(pending, true)).toBe(
      [
        "Prism · checking… verdict comes with your next receipt",
        "Prism receipt: changed 1 file, 4 dependents, 1 test reach it",
        "Earlier change  changed 1 file — SHIP",
      ].join("\n"),
    );
  });

  it("no daemon: NOT PROVEN stays the final answer, with the real reason", () => {
    expect(renderReceiptAtStop(pending, false)).toBe(
      [
        "Prism · NOT PROVEN (daemon not running)",
        "Prism receipt: changed 1 file, 4 dependents, 1 test reach it — NOT PROVEN (daemon not running)",
        "Earlier change  changed 1 file — SHIP",
      ].join("\n"),
    );
  });

  it("no daemon with another reason, or a final receipt: the full receipt as before", () => {
    const untested = { ...pending, reason: "untested" as const };
    expect(renderReceiptAtStop(untested, false)).toBe(renderReceipt(untested));
    expect(renderReceiptAtStop(base, true)).toBe(renderReceipt(base));
    expect(renderReceiptAtStop(base, false)).toBe(renderReceipt(base));
  });
});
