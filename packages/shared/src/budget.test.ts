import { describe, expect, it } from "vitest";
import { budgetFor, fitToBudget } from "./budget.js";
import { estimateJsonTokens } from "./tokens.js";

const big = () => ({
  task: "x",
  files: Array.from({ length: 200 }, (_, i) => ({
    path: `src/f${i}.ts`,
    why: "imports a",
  })),
  tests: Array.from({ length: 50 }, (_, i) => `test/t${i}.test.ts`),
});

describe("fitToBudget", () => {
  it("BUD-1: output fits maxTokens within 5%", () => {
    for (const max of [300, 800, 2000]) {
      const { value } = fitToBudget(big(), max);
      expect(estimateJsonTokens(value)).toBeLessThanOrEqual(max * 1.05);
    }
  });
  it("BUD-2: highest-ranked items survive", () => {
    const { value } = fitToBudget(big(), 500);
    expect(value.files[0]?.path).toBe("src/f0.ts");
    expect(value.tests[0]).toBe("test/t0.test.ts");
  });
  it("BUD-3: footer names exactly what was cut", () => {
    const input = big();
    const { value, budget } = fitToBudget(input, 500);
    expect(budget).toBeDefined();
    expect(value.files.length + (budget!.cut.files ?? 0)).toBe(200);
    expect(value.tests.length + (budget!.cut.tests ?? 0)).toBe(50);
    expect(budget!.hint).toMatch(/^truncated: \d+ more/);
  });
  it("BUD-4: offset paging returns the rest exactly once", () => {
    const seen: string[] = [];
    let offset = 0;
    for (let page = 0; page < 100; page += 1) {
      const { value, budget } = fitToBudget(big(), 800, offset);
      seen.push(...value.files.map((f) => f.path));
      if (!budget || Object.keys(budget.cut).length === 0) break;
      offset = Number(/offset: (\d+)/.exec(budget.hint)?.[1]);
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(200);
  });
  it("leaves small answers untouched and clamps requests", () => {
    const small = { a: 1, items: [1, 2] };
    expect(fitToBudget(small, 2000)).toEqual({ value: small });
    expect(budgetFor("prepare_change")).toBe(2000);
    expect(budgetFor("x", 10)).toBe(200);
    expect(budgetFor("x", 1e9)).toBe(12000);
  });
});
