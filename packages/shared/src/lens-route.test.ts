import { describe, expect, it } from "vitest";
import { applyDefaultProcedures, DEFAULT_LENSES } from "./lens-store.js";
import {
  chooseLens,
  chooseLensDetailed,
  invalidTrigger,
  stripNegatedClauses,
} from "./lens-route.js";
import type { LensDefinition } from "./lenses.js";

const custom: LensDefinition = {
  id: "security",
  name: "Security",
  role: "Looks for secrets and trust boundaries.",
  focus: "A change that handles a credential or a trust boundary.",
  tone: "",
  checklist: ["No new secret is committed."],
  evidence: ["off-limits"],
  enabled: true,
  seededDefault: false,
  procedure: "",
  triggers: [],
  checks: [],
  overrules: [],
};

const lenses = [...DEFAULT_LENSES, custom];

const LABELED: readonly { task: string; id: string }[] = [
  { task: "planning a new feature for billing", id: "architect" },
  { task: "review this PR", id: "architect" },
  { task: "review the last commit", id: "architect" },
  { task: "work on a big feature", id: "architect" },
  { task: "draft an RFC for auth", id: "architect" },
  { task: "review the pull request before it lands", id: "architect" },
  { task: "we need a new feature for exports", id: "architect" },
  { task: "find bugs in checkout", id: "qa" },
  { task: "what's broken in the login flow", id: "qa" },
  { task: "hunt a regression in the parser", id: "qa" },
  { task: "missing tests for money", id: "qa" },
  { task: "does this break the session", id: "qa" },
  { task: "find bugs in this PR", id: "qa" },
  { task: "fix the null check in parse", id: "dev" },
  { task: "rename the helper", id: "dev" },
  { task: "typo in the error message", id: "dev" },
  { task: "daily fix for the badge", id: "dev" },
  { task: "plan the spacing of the button", id: "dev" },
  { task: "update the copy on the empty state", id: "dev" },
  { task: "use QA on this pull request", id: "qa" },
  { task: "run the Security lens on the diff", id: "security" },
  { task: "Architect, look at this typo", id: "architect" },
  // Several lenses named (website round): an ask wins, then "<name> lens",
  // then the task's intent; no longer the first word.
  {
    task: "Context: the Architect plan is in plan.md.\nUse Prism's Dev lens. Build the home page.",
    id: "dev",
  },
  { task: "The Architect lens wrote this; now use QA on it", id: "qa" },
  { task: "Architect notes are done. Build it with the Dev lens", id: "dev" },
  {
    task: "Dev notes aside, review this PR from the architect",
    id: "architect",
  },
  {
    task: "The architect and dev folks want the button padding fixed",
    id: "dev",
  },
];

describe("chooseLens", () => {
  it("matches the labeled tasks", () => {
    const misses = LABELED.filter(
      (row) => chooseLens(row.task, lenses)?.id !== row.id,
    ).map(
      (row) =>
        `${JSON.stringify(row.task)} → ${chooseLens(row.task, lenses)?.id}, wanted ${row.id}`,
    );
    expect(misses).toEqual([]);
  });

  it("uses Architect for a plan, a new feature, or a pull request", () => {
    expect(chooseLens("planning a new feature for billing", lenses)?.id).toBe(
      "architect",
    );
    expect(chooseLens("review this PR", lenses)?.id).toBe("architect");
    expect(chooseLens("work on a big feature", lenses)?.id).toBe("architect");
  });

  it("uses QA when the task is to find bugs", () => {
    expect(chooseLens("find bugs in checkout", lenses)?.id).toBe("qa");
    expect(chooseLens("what's broken in the login flow", lenses)?.id).toBe(
      "qa",
    );
  });

  it("uses Dev for a daily fix", () => {
    expect(chooseLens("fix the null check in parse", lenses)?.id).toBe("dev");
    expect(chooseLens("rename the helper", lenses)?.id).toBe("dev");
  });

  it("prefers a lens the task names, including a custom one", () => {
    expect(chooseLens("use QA on this pull request", lenses)?.id).toBe("qa");
    expect(chooseLens("run the Security lens on the diff", lenses)?.id).toBe(
      "security",
    );
  });

  it("replaces an unedited default with the skill text and keeps an edit", () => {
    const previous = {
      ...DEFAULT_LENSES[0]!,
      role: "Checks structure: package boundaries, import cycles, and decisions already recorded.",
      focus:
        "A change should not add a new dependency between packages, a new cycle, or contradict an accepted ADR.",
      checklist: [
        "The change adds no import edge into a package it did not already depend on.",
        "The change adds no import cycle.",
        "Generated and vendor paths are untouched.",
      ],
      procedure: "",
    };
    const edited = { ...previous, role: "Our architect." };
    const next = applyDefaultProcedures([previous, edited]);
    expect(next[0]?.procedure).toMatch(/Architect lens/);
    expect(next[1]?.role).toBe("Our architect.");
    expect(next[1]?.procedure).toMatch(/Architect lens/);
  });

  it("skips a lens that is turned off", () => {
    const off = lenses.map((lens) =>
      lens.id === "dev" ? { ...lens, enabled: false } : lens,
    );
    expect(chooseLens("fix the typo", off)?.id).not.toBe("dev");
  });
});

describe("plan §5.3 routing rows", () => {
  const perf: LensDefinition = {
    ...custom,
    id: "perf",
    name: "Perf",
    triggers: ["slow query", "performance regression"],
    updatedAt: "2026-10-01T00:00:00.000Z",
  };
  const db: LensDefinition = {
    ...custom,
    id: "db",
    name: "Database",
    triggers: ["slow query on postgres"],
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
  const all = [...DEFAULT_LENSES, custom, perf, db];
  const pick = (task: string, set = all) => chooseLensDetailed(task, set);

  it("LN-1/LN-2/LN-4/LN-5/LN-11: built-in routing", () => {
    expect(pick("review this PR")?.lens.id).toBe("architect");
    expect(
      pick("review the uncommitted change before I open a PR")?.lens.id,
    ).toBe("architect");
    expect(pick("find bugs in this PR")?.lens.id).toBe("qa");
    expect(pick("why does checkout fail on empty carts")?.lens.id).toBe("qa");
    expect(pick("fix the due date bug")?.lens.id).toBe("dev");
    expect(
      pick("Ask the architect lens to look at this refactor")?.lens.id,
    ).toBe("architect");
  });

  it("CL-6/CL-12: a trigger wins over built-in routing", () => {
    expect(pick("the tenant list has a slow query, fix it")?.lens.id).toBe(
      "perf",
    );
    expect(pick("find bugs causing the performance regression")?.lens.id).toBe(
      "perf",
    );
  });

  it("CL-8: a trigger inside a code block or quote does not fire", () => {
    expect(pick("fix this:\n```\n// slow query\n```")?.lens.id).toBe("dev");
    expect(pick('the log says "slow query" — tidy the logger')?.lens.id).toBe(
      "dev",
    );
  });

  it("CL-9: the longest phrase wins and the conflict is reported", () => {
    const choice = pick("fix the slow query on postgres in reports");
    expect(choice?.lens.id).toBe("db");
    expect(choice?.conflict).toEqual(["db", "perf"]);
  });

  it("CL-10: on a tie the most recently edited lens wins", () => {
    const a = {
      ...perf,
      id: "pay-a",
      name: "Pay A",
      triggers: ["payment flow"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const b = {
      ...perf,
      id: "pay-b",
      name: "Pay B",
      triggers: ["payment flow"],
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const choice = pick("tidy the payment flow", [...DEFAULT_LENSES, a, b]);
    expect(choice?.lens.id).toBe("pay-b");
    expect(choice?.conflict).toEqual(["pay-b", "pay-a"]);
  });

  it("CL-11: a named lens beats a trigger", () => {
    expect(
      pick("use the security lens; there is a slow query too")?.lens.id,
    ).toBe("security");
  });

  it("round 2: a negated clause routes nowhere", () => {
    const task =
      "Tests listed below fail on this checkout. Fix the source so they pass.\nDo not edit test files. Do not push or open a pull request.";
    expect(chooseLensDetailed(task, lenses)?.lens.id).toBe("dev");
    expect(chooseLensDetailed(task, lenses)?.by).toBe("default");
    expect(
      chooseLens("don't use the Security lens, just fix it", lenses)?.id,
    ).toBe("dev");
    expect(chooseLens("review this pull request", lenses)?.id).toBe(
      "architect",
    );
    const kept = stripNegatedClauses(
      "Fix it. Never touch auth. Don't open a PR",
    );
    expect(kept).toMatch(/^Fix it\./);
    expect(kept).not.toMatch(/auth|PR/);
    // A fix phrased as a behaviour: the negated clause is the task.
    expect(
      stripNegatedClauses("don't match an empty path segment as a param"),
    ).toBe("don't match an empty path segment as a param");
  });

  it("CL-13: refuses short triggers and built-in routing words", () => {
    expect(invalidTrigger("fix")).toMatch(/too short/);
    expect(invalidTrigger("review")).toMatch(/built-in lens routing/);
    expect(invalidTrigger("payment flow")).toBeNull();
    expect(invalidTrigger("latency")).toBeNull();
  });
});
