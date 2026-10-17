import { DEFAULT_LENSES } from "@repo-prism/shared/lens-store";
import type { ChangeReceipt, LensDefinition } from "@repo-prism/shared";
import { describe, expect, it } from "vitest";
import {
  evaluateLensChecks,
  pathFingerprint,
  type LensSignals,
} from "./lens-checks.js";

const lens = (id: string): LensDefinition =>
  DEFAULT_LENSES.find((row) => row.id === id)!;

function receipt(overrides: Partial<ChangeReceipt> = {}): ChangeReceipt {
  return {
    id: "r1",
    diffHash: "d",
    generatedAt: new Date().toISOString(),
    verdict: "proven",
    checksState: "done",
    touched: { files: [], totalFiles: 0, dependents: 0, truncated: false },
    checks: [],
    testMode: "none",
    testFiles: [],
    notProven: [],
    unsupported: [],
    flags: [],
    durationMs: 1,
    ...overrides,
  };
}

function signals(overrides: Partial<LensSignals> = {}): LensSignals {
  return {
    changed: [],
    addedLines: new Map(),
    edges: [],
    valueCycles: [],
    packageOf: (path) => path.split("/").slice(0, 2).join("/"),
    dependenciesAdded: [],
    removedLines: new Map(),
    dependentsNotInDiff: new Map(),
    fingerprint: () => "h1",
    ...overrides,
  };
}

const status = (
  findings: ReturnType<typeof evaluateLensChecks>,
  check: string,
) => findings.find((row) => row.check === check);

describe("lens checks (plan §5.3)", () => {
  it("LN-6: a new import from packages/web into packages/core fails with the edge named", () => {
    const from = "packages/core/src/a.ts";
    const out = evaluateLensChecks(
      [lens("architect")],
      receipt(),
      signals({
        changed: [from],
        addedLines: new Map([[from, ['import { x } from "../../web/src/x";']]]),
        edges: [
          {
            from,
            to: "packages/web/src/x.ts",
            source: "../../web/src/x",
            typeOnly: false,
          },
        ],
      }),
    );
    expect(status(out, "new_cross_package_edge")).toMatchObject({
      status: "fail",
      evidence: [
        "packages/core/src/a.ts imports packages/web/src/x.ts (packages/core → packages/web)",
      ],
    });
  });

  it("an edge between packages that already depend on each other passes", () => {
    const from = "packages/core/src/a.ts";
    const out = evaluateLensChecks(
      [lens("architect")],
      receipt(),
      signals({
        changed: [from],
        addedLines: new Map([[from, ['import { x } from "@web/x";']]]),
        edges: [
          {
            from,
            to: "packages/web/src/x.ts",
            source: "@web/x",
            typeOnly: false,
          },
          {
            from: "packages/core/src/b.ts",
            to: "packages/web/src/y.ts",
            source: "@web/y",
            typeOnly: false,
          },
        ],
      }),
    );
    expect(status(out, "new_cross_package_edge")?.status).toBe("pass");
  });

  it("LN-7: an added value import closing a cycle fails; a type-only one passes", () => {
    const a = "src/a.ts";
    const b = "src/b.ts";
    const base = {
      changed: [a],
      addedLines: new Map([[a, ['import { b } from "./b";']]]),
      valueCycles: [[a, b]],
    };
    const value = evaluateLensChecks(
      [lens("architect")],
      receipt(),
      signals({
        ...base,
        edges: [
          { from: a, to: b, source: "./b", typeOnly: false },
          { from: b, to: a, source: "./a", typeOnly: false },
        ],
      }),
    );
    expect(status(value, "new_value_cycle")?.status).toBe("fail");
    const typeOnly = evaluateLensChecks(
      [lens("architect")],
      receipt(),
      signals({
        ...base,
        valueCycles: [],
        edges: [{ from: a, to: b, source: "./b", typeOnly: true }],
      }),
    );
    expect(status(typeOnly, "new_value_cycle")?.status).toBe("pass");
  });

  it("LN-8: a duplicate helper is a reuse_missed concern with the path", () => {
    const out = evaluateLensChecks(
      [lens("dev")],
      receipt({
        flags: [
          {
            path: "src/utils/formatDueDate.ts",
            kind: "duplicate",
            detail:
              '"formatDueDate" looks like "formatDate" in src/utils/date.ts',
          },
        ],
      }),
      signals(),
    );
    expect(status(out, "reuse_missed")).toMatchObject({
      status: "concern",
      evidence: [expect.stringContaining("src/utils/formatDueDate.ts")],
    });
  });

  it("LN-9: a changed export with dependents not edited fails", () => {
    const path = "src/function/debounce.ts";
    const out = evaluateLensChecks(
      [lens("qa")],
      receipt(),
      signals({
        changed: [path],
        addedLines: new Map([
          [path, ["export function debounce(fn, wait, options) {"]],
        ]),
        removedLines: new Map([
          [path, ["export function debounce(fn, wait) {"]],
        ]),
        dependentsNotInDiff: new Map([[path, ["src/function/throttle.ts"]]]),
      }),
    );
    expect(status(out, "dependents_not_in_diff")).toMatchObject({
      status: "fail",
      evidence: [expect.stringContaining("src/function/throttle.ts")],
    });
  });

  it("a new export or a new file breaks no dependent (website round)", () => {
    const path = "lib/seo.ts";
    const out = evaluateLensChecks(
      [lens("qa")],
      receipt(),
      signals({
        changed: [path],
        addedLines: new Map([[path, ["export function pageMetadata() {"]]]),
        dependentsNotInDiff: new Map([[path, ["app/page.tsx"]]]),
      }),
    );
    expect(status(out, "dependents_not_in_diff")?.status).toBe("pass");
  });

  it("CL-2/CL-3: an overrule holds until the file changes", () => {
    const path = "src/utils/formatDueDate.ts";
    const dev: LensDefinition = {
      ...lens("dev"),
      overrules: [
        {
          check: "reuse_missed",
          fingerprint: pathFingerprint(path, "h1"),
          note: "formatDueDate intentionally differs",
          at: new Date().toISOString(),
        },
      ],
    };
    const flagged = receipt({
      flags: [{ path, kind: "duplicate", detail: "looks like formatDate" }],
    });
    const held = evaluateLensChecks([dev], flagged, signals());
    expect(status(held, "reuse_missed")).toMatchObject({
      status: "overruled",
      note: "formatDueDate intentionally differs",
    });
    const edited = evaluateLensChecks(
      [dev],
      flagged,
      signals({ fingerprint: () => "h2" }),
    );
    expect(status(edited, "reuse_missed")?.status).toBe("concern");
  });

  it("off-limits, new dependency, untested and not-run checks read the receipt", () => {
    const out = evaluateLensChecks(
      [lens("architect"), lens("dev"), lens("qa")],
      receipt({
        checksState: "pending",
        testFiles: ["src/a.test.ts"],
        notProven: [{ path: "src/b.ts", reason: "no test reaches it" }],
      }),
      signals({
        changed: ["src/generated/types.ts", "src/b.ts"],
        addedLines: new Map([["src/b.ts", ["  if (x) return y;"]]]),
        dependenciesAdded: ["package.json: left-pad"],
      }),
    );
    // J-07: a generated file is a concern (a note), never a fail.
    expect(status(out, "off_limits_touched")?.status).toBe("concern");
    expect(status(out, "new_dependency_added")?.status).toBe("concern");
    expect(status(out, "untested_new_branch")?.status).toBe("concern");
    expect(status(out, "untested_changed_symbol")?.status).toBe("concern");
    expect(status(out, "test_reaches_but_not_run")?.status).toBe("concern");
  });

  it("a change past 20 files keeps 20 evidence lines, the last one counting the rest", () => {
    const paths = Array.from({ length: 31 }, (_, i) => `src/f${i}.ts`);
    const out = evaluateLensChecks(
      DEFAULT_LENSES.filter((row) =>
        row.checks.includes("untested_changed_symbol"),
      ),
      receipt({
        notProven: paths.map((path) => ({ path, reason: "untested" })),
      }),
      signals({ changed: paths }),
    );
    const row = status(out, "untested_changed_symbol")!;
    expect(row.evidence).toHaveLength(20);
    expect(row.evidence.at(-1)).toBe("+12 more");
  });
});

describe("J-07: generated files never fail off_limits_touched", () => {
  const all = [lens("architect"), lens("dev"), lens("qa")];
  it("an edit under gen/ is a concern with the path as evidence", () => {
    const out = evaluateLensChecks(
      all,
      receipt(),
      signals({ changed: ["gen/api.ts", "src/b.gen.ts"] }),
    );
    const f = status(out, "off_limits_touched");
    expect(f?.status).toBe("concern");
    expect(f?.evidence).toEqual(["gen/api.ts (generated)", "src/b.gen.ts (generated)"]);
  });
  it("a vendored path still fails, listed before generated ones", () => {
    const out = evaluateLensChecks(
      all,
      receipt(),
      signals({ changed: ["gen/api.ts", "vendor/lib.ts"] }),
    );
    const f = status(out, "off_limits_touched");
    expect(f?.status).toBe("fail");
    expect(f?.evidence).toEqual(["vendor/lib.ts (vendor)", "gen/api.ts (generated)"]);
  });
});

