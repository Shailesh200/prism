import { describe, expect, it } from "vitest";
import { FindingSchema } from "./schemas.js";
import {
  findingFromReceiptFlag,
  findingFromRef,
  findingsFromLens,
  findingsFromGuardFiles,
  findingsFromReceiptParts,
  listedFindingFromRef,
  mergeFindings,
} from "./structured-finding.js";
import { renderReceipt, renderReceiptMarkdown } from "./receipt-render.js";
import type { ChangeReceipt } from "./receipt.js";

describe("P18 structured findings", () => {
  it("FND-3 schema contract requires what/where/fix/risk/sources", () => {
    const ok = FindingSchema.parse({
      what: "Unused export foo",
      where: "src/a.ts",
      fix: "Remove the export or add a real importer.",
      riskIfSkipped: "low",
      sources: ["unused_export"],
    });
    expect(ok.fix.length).toBeGreaterThan(0);
    expect(ok.fix.length).toBeLessThanOrEqual(160);
    expect(() =>
      FindingSchema.parse({
        what: "x",
        where: "y",
        fix: "",
        riskIfSkipped: "low",
        sources: ["s"],
      }),
    ).toThrow();
    expect(() =>
      FindingSchema.parse({
        what: "x",
        where: "y",
        fix: "z",
        riskIfSkipped: "medium",
        sources: ["s"],
      }),
    ).toThrow();
  });

  it("FND-1 / FND-2 receipt flag maps all fields with short fix", () => {
    const f = findingFromReceiptFlag({
      path: "src/orphan.ts",
      kind: "orphan",
      detail: "nothing imports this file",
    });
    expect(f.what).toBe("nothing imports this file");
    expect(f.where).toBe("src/orphan.ts");
    expect(f.fix.length).toBeGreaterThan(0);
    expect(f.fix.length).toBeLessThanOrEqual(160);
    expect(f.riskIfSkipped).toBe("low");
    expect(f.sources).toEqual(["guard:orphan"]);
  });

  it("FND-1 FindingRef producers map with source-specific fix", () => {
    const f = findingFromRef({
      id: "sym:1",
      source: "unused_export",
      title: 'Unused export "foo" in src/a.ts',
      path: "src/a.ts",
      fingerprint: "fp",
    });
    expect(f.what).toContain("Unused export");
    expect(f.where).toBe("src/a.ts");
    expect(f.fix).toContain("Remove");
    expect(f.sources).toEqual(["unused_export"]);
  });

  it("FND-4 lens sources list matches producer", () => {
    const rows = findingsFromLens({
      lens: "security",
      check: "off_limits_touched",
      status: "fail",
      evidence: ["src/a.ts: hard-coded token"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sources[0]).toBe("lens:security:off_limits_touched");
    expect(rows[0]!.riskIfSkipped).toBe("high");
  });

  it("mergeFindings unions sources for the same where+what", () => {
    const a = findingFromReceiptFlag({
      path: "src/a.ts",
      kind: "duplicate",
      detail: "looks like existing helper",
    });
    const b = {
      ...a,
      sources: ["lens:frontend:duplicate_symbol"],
      riskIfSkipped: "high" as const,
    };
    const merged = mergeFindings([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sources.sort()).toEqual(
      ["guard:duplicate", "lens:frontend:duplicate_symbol"].sort(),
    );
    expect(merged[0]!.riskIfSkipped).toBe("high");
  });

  it("findingsFromReceiptParts combines flags and lenses", () => {
    const rows = findingsFromReceiptParts({
      flags: [
        {
          path: "src/a.ts",
          kind: "boundary",
          detail: "reaches into another package",
        },
      ],
      lensFindings: [
        {
          lens: "backend",
          check: "new_dependency_added",
          status: "concern",
          evidence: ["src/a.ts: added lodash"],
        },
      ],
    });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const f of rows) {
      expect(f.fix.length).toBeGreaterThan(0);
      expect(f.fix.length).toBeLessThanOrEqual(160);
      expect(f.sources.length).toBeGreaterThan(0);
    }
  });

  it("FND-1 guard files map every flag with the file path", () => {
    const rows = findingsFromGuardFiles([
      {
        path: "src/b.ts",
        flags: [
          {
            kind: "boundary",
            detail: "imports pkg internals",
            provenance: "measured",
          },
          {
            kind: "orphan",
            detail: "nothing imports this file",
            provenance: "measured",
          },
        ],
      },
    ]);
    expect(rows.map((f) => f.sources[0])).toEqual([
      "guard:boundary",
      "guard:orphan",
    ]);
    expect(rows.every((f) => f.where === "src/b.ts")).toBe(true);
  });

  it("FND-1 list_findings rows keep mute keys and structured fields", () => {
    const row = listedFindingFromRef({
      id: "sym:2",
      source: "wrapper_over_existing",
      title: "wrap() only calls base()",
      path: "src/w.ts",
      fingerprint: "fp2",
    });
    expect(row).toMatchObject({
      id: "sym:2",
      fingerprint: "fp2",
      where: "src/w.ts",
      riskIfSkipped: "med",
      sources: ["wrapper_over_existing"],
    });
    expect(row.fix.length).toBeGreaterThan(0);
  });

  it("FND-1 receipt renders what, where, fix and risk for each finding", () => {
    const receipt: ChangeReceipt = {
      id: "0123456789abcdef",
      diffHash: "d1ff",
      generatedAt: "2026-10-10T00:00:00.000Z",
      verdict: "not_proven",
      reason: "untested",
      checksState: "done",
      unsupported: [],
      touched: {
        files: ["src/o.ts"],
        totalFiles: 1,
        dependents: 0,
        truncated: false,
      },
      checks: [],
      testMode: "none",
      testFiles: [],
      notProven: [],
      flags: [
        {
          path: "src/o.ts",
          kind: "orphan",
          detail: "nothing imports this file",
        },
      ],
      durationMs: 1,
    };
    for (const text of [
      renderReceipt(receipt),
      renderReceiptMarkdown(receipt),
    ]) {
      expect(text).toContain("src/o.ts — nothing imports this file → ");
      expect(text).toContain("(low risk)");
      expect(text).not.toContain("Flag");
    }
  });
});
