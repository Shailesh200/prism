import { describe, expect, it } from "vitest";
import { applyDefaultProcedures, DEFAULT_LENSES } from "./lens-store.js";
import { chooseLens } from "./lens-route.js";
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
};

const lenses = [...DEFAULT_LENSES, custom];

const LABELED: readonly { task: string; id: string }[] = [
  { task: "planning a new feature for billing", id: "architect" },
  { task: "review this PR", id: "architect" },
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
