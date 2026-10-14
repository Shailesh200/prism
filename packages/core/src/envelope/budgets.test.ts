import { describe, expect, it } from "vitest";
import { envelopeFooter, envelopeReport } from "./budgets.js";
import type { EnvelopeLedgerEntry } from "./envelope-ledger.js";

const row = (
  tool: string,
  jsonBytes: number,
  extra: Partial<EnvelopeLedgerEntry> = {},
): EnvelopeLedgerEntry => ({
  ts: "2026-10-10T10:00:00.000Z",
  tool,
  itemCount: 1,
  totalCount: 1,
  truncated: false,
  limit: 0,
  jsonBytes,
  ...extra,
});

describe("envelopeReport", () => {
  it("counts tokens as bytes ÷ 4 and flags calls over their tool budget", () => {
    const report = envelopeReport([
      row("prepare_change", 4000, { source: "hook", sessionId: "s" }),
      row("prepare_change", 30_800, { sessionId: "s" }),
      row("dependency_graph", 73_000),
    ]);
    expect(report.calls).toBe(3);
    expect(report.tokens).toBe(1000 + 7700 + 18_250);
    expect(report.fromHooks).toBe(1);
    expect(report.sessions).toBe(1);
    expect(report.overBudget).toBe(2);
    expect(report.byTool[0]).toMatchObject({
      tool: "dependency_graph",
      overBudget: 1,
    });
    expect(report.estimatedSaved).toBeNull();
  });

  it("keeps only entries since a time", () => {
    const report = envelopeReport(
      [
        row("blast_radius", 400),
        row("blast_radius", 400, { ts: "2026-10-11T00:00:00.000Z" }),
      ],
      { since: Date.parse("2026-10-10T12:00:00.000Z") },
    );
    expect(report.calls).toBe(1);
  });

  it("renders the receipt footer without inventing a saving", () => {
    const footer = envelopeFooter(
      envelopeReport([row("prepare_change", 36_400)]),
    );
    expect(footer).toBe(
      "1 call · 9.1k tokens in · est. saved — (not calibrated yet) · 1 over budget",
    );
    expect(envelopeFooter(envelopeReport([]))).toBeNull();
  });
});
