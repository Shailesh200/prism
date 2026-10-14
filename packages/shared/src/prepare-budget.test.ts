import { describe, expect, it } from "vitest";
import {
  PREPARE_RESPONSE_CEILING,
  clampPrepareBudget,
  fitPrepareToBudget,
  prepareResponseTokens,
} from "./prepare-budget.js";
import type { PrepareChange } from "./schemas.js";

function big(): PrepareChange {
  const path = (i: number) => `packages/area-${i}/src/module-${i}/file-${i}.ts`;
  return {
    pack: {
      task: "add caching to fetchUser",
      files: Array.from({ length: 40 }, (_, i) => ({
        path: path(i),
        symbols: ["fetchUser", "loadUser", "cacheKey"],
        why: ["name matches task", "import distance 1"],
        tokenWeight: 30,
        provenance: "measured" as const,
      })),
      tokenEstimate: 1200,
      tests: Array.from({ length: 20 }, (_, i) => `${path(i)}.test.ts`),
      truncated: false,
      totalCount: 40,
    },
    reuse: Array.from({ length: 10 }, (_, i) => ({
      path: path(i),
      symbol: `helper${i}`,
      kind: "function",
      score: 0.5,
      evidence: "same name stem as the task",
      provenance: "heuristic" as const,
    })),
    conventions: Array.from({ length: 3 }, (_, i) => ({
      path: path(i),
      symbol: `Handler${i}`,
      patternId: "route-handler" as const,
      whyCanonical:
        "most imported handler in the repository, follows the house shape",
    })),
    notes: Array.from({ length: 8 }, (_, i) => ({
      path: path(i),
      text: "remembered: keep this cache-free, see ADR-0012 for the reason why",
      source: "memory" as const,
    })),
    order: {
      inScope: Array.from({ length: 40 }, (_, i) => path(i)),
      offLimits: Array.from({ length: 120 }, (_, i) => ({
        path: `dist/generated-${i}.js`,
        reason: "generated",
      })),
      needsSignOff: Array.from({ length: 10 }, (_, i) => path(i)),
      advisory: true,
      hookArmed: false,
    },
    workingSet: null,
    generatedAt: "2026-10-10T00:00:00.000Z",
    indexIndexedAt: "2026-10-10T00:00:00.000Z",
    reuseProvenance: "heuristic",
    conventionsProvenance: "heuristic",
    ambiguous: null,
  } as PrepareChange;
}

describe("fitPrepareToBudget", () => {
  it("leaves a response that already fits untouched", () => {
    const small = {
      ...big(),
      order: { ...big().order, offLimits: [], inScope: [] },
    };
    const fitted = fitPrepareToBudget(small, PREPARE_RESPONSE_CEILING);
    expect(fitted).toBe(small);
  });

  it("fits the default budget and says what it cut, in order", () => {
    const prep = big();
    expect(prepareResponseTokens(prep)).toBeGreaterThan(2000);
    const fitted = fitPrepareToBudget(prep);
    expect(prepareResponseTokens(fitted)).toBeLessThanOrEqual(2000);
    expect(fitted.trimmed?.budgetTokens).toBe(2000);
    expect(fitted.trimmed?.tokens).toBe(prepareResponseTokens(fitted));
    const cut = fitted.trimmed?.cut.map((c) => c.section) ?? [];
    expect(cut[0]).toBe("conventions");
    expect(cut).toContain("order");
    expect(fitted.pack.files.length).toBeGreaterThanOrEqual(1);
  });

  it("drops house style before pack files", () => {
    const fitted = fitPrepareToBudget(big(), 1500);
    if ((fitted.pack.files.length ?? 0) < 40) {
      expect(fitted.conventions).toEqual([]);
      expect(fitted.notes).toEqual([]);
    }
  });

  it("clamps the budget to the ceiling", () => {
    expect(clampPrepareBudget(undefined)).toBe(2000);
    expect(clampPrepareBudget(50_000)).toBe(PREPARE_RESPONSE_CEILING);
    expect(clampPrepareBudget(10)).toBe(200);
  });
});
