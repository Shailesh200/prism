import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FEEDBACK_WEIGHT_CAP,
  appendFeedback,
  feedbackIsPathsOnly,
  feedbackPath,
  feedbackScores,
  feedbackTerms,
  pruneFeedback,
  readFeedbackRows,
} from "./feedback-store.js";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});

function env(): { root: string; env: NodeJS.ProcessEnv } {
  const home = mkdtempSync(join(tmpdir(), "prism-fb-"));
  homes.push(home);
  const root = mkdtempSync(join(tmpdir(), "prism-fb-repo-"));
  homes.push(root);
  return { root, env: { ...process.env, PRISM_HOME: home } };
}

describe("feedback store (plan P6)", () => {
  it("FB-1 appends one row and FB-2 stores paths/terms only", () => {
    const { root, env: e } = env();
    const row = {
      ts: new Date().toISOString(),
      suggested: ["src/a.ts", "src/b.ts"],
      edited: ["src/a.ts"],
      terms: ["fix", "login"],
    };
    appendFeedback(root, row, e);
    const path = feedbackPath(root, e);
    const raw = readFileSync(path, "utf8");
    expect(raw).not.toMatch(/function |const |export /);
    expect(raw).not.toContain("\n  ");
    const rows = readFeedbackRows(root, e);
    expect(rows).toHaveLength(1);
    expect(feedbackIsPathsOnly(rows[0]!)).toBe(true);
    expect(rows[0]!.suggested).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("FB-3 repeatedly edited files score higher", () => {
    const { root, env: e } = env();
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      appendFeedback(
        root,
        {
          ts: new Date(now - i * 1000).toISOString(),
          suggested: ["hot.ts", "cold.ts"],
          edited: ["hot.ts"],
          terms: ["auth"],
        },
        e,
      );
    }
    const scores = feedbackScores(root, "fix auth", e, now);
    expect(scores.get("hot.ts") ?? 0).toBeGreaterThan(
      scores.get("cold.ts") ?? 0,
    );
  });

  it("FB-4 feedback weight cap is ≤ 0.12", () => {
    expect(FEEDBACK_WEIGHT_CAP).toBeLessThanOrEqual(0.12);
  });

  it("prunes rows older than TTL", () => {
    const { root, env: e } = env();
    const now = Date.now();
    appendFeedback(
      root,
      {
        ts: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString(),
        suggested: ["old.ts"],
        edited: ["old.ts"],
        terms: ["x"],
      },
      e,
    );
    appendFeedback(
      root,
      {
        ts: new Date(now).toISOString(),
        suggested: ["new.ts"],
        edited: ["new.ts"],
        terms: ["x"],
      },
      e,
    );
    expect(pruneFeedback(root, e, now)).toBe(1);
    expect(readFeedbackRows(root, e, now).map((r) => r.suggested[0])).toEqual([
      "new.ts",
    ]);
  });

  it("feedbackTerms stems the task", () => {
    expect(feedbackTerms("Fix the Login Form validation")).toEqual(
      expect.arrayContaining(["fix", "the", "login", "form", "validation"]),
    );
  });
});
