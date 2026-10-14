import { describe, expect, it } from "vitest";
import {
  PREPARE_RESPONSE_CEILING,
  clampPrepareBudget,
  fitPrepareToBudget,
  PREPARE_RESERVES,
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
    expect(cut).toContain("order");
    expect(cut).toContain("pack");
    expect(fitted.pack.files.length).toBeGreaterThanOrEqual(1);
  });

  it("keeps reserved sections within their share and cuts files first (plan §5.1)", () => {
    const fitted = fitPrepareToBudget(big(), 2000);
    // Reserved sections keep their best item; the file list was cut instead.
    expect(fitted.reuse.length).toBeGreaterThanOrEqual(1);
    expect(fitted.conventions?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(fitted.pack.files.length).toBeLessThan(40);
    expect(prepareResponseTokens(fitted.reuse)).toBeLessThanOrEqual(
      Math.max(
        Math.floor(2000 * PREPARE_RESERVES.reuse),
        prepareResponseTokens([fitted.reuse[0]]),
      ),
    );
    // Best item first: the first reuse hit survives.
    expect(fitted.reuse[0]?.symbol).toBe("helper0");
  });

  it("PC-9 never exceeds the budget (200 random shapes and budgets)", () => {
    let seed = 7;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 200; i += 1) {
      const b = big();
      const pick = <T>(xs: T[]) =>
        xs.slice(0, Math.floor(rnd() * (xs.length + 1)));
      const prep: PrepareChange = {
        ...b,
        pack: {
          ...b.pack,
          files:
            pick(b.pack.files).length > 0
              ? pick(b.pack.files)
              : b.pack.files.slice(0, 1),
          tests: pick(b.pack.tests),
        },
        reuse: pick(b.reuse),
        conventions: pick(b.conventions ?? []),
        notes: pick(b.notes ?? []),
        order: {
          ...b.order,
          inScope: pick(b.order.inScope),
          offLimits: pick(b.order.offLimits),
          needsSignOff: pick(b.order.needsSignOff),
        },
      };
      const budget = 200 + Math.floor(rnd() * 5800);
      const fitted = fitPrepareToBudget(prep, budget);
      expect(prepareResponseTokens(fitted)).toBeLessThanOrEqual(
        clampPrepareBudget(budget),
      );
    }
  }, 30_000); // 200 property cases; ~4 s alone, slower when every package tests in parallel

  it("clamps the budget to the ceiling", () => {
    expect(clampPrepareBudget(undefined)).toBe(2000);
    expect(clampPrepareBudget(50_000)).toBe(PREPARE_RESPONSE_CEILING);
    expect(clampPrepareBudget(10)).toBe(200);
  });
});
