import { describe, expect, it } from "vitest";
import * as bench from "./bench";
import { GROUPS, HABITS_RAN, verdict } from "./bench";

describe("benchmark changes", () => {
  it("calls more habits run a win", () => {
    expect(verdict(HABITS_RAN)).toBe("win");
  });

  it("keeps the losses in the full detail", () => {
    const all = GROUPS.flatMap((g) => g.measures);
    expect(all.filter((m) => verdict(m) === "loss").length).toBeGreaterThan(3);
  });

  it("publishes no token or cost rows", () => {
    const text = GROUPS.flatMap((g) => [
      g.run,
      g.note ?? "",
      ...g.measures.map((m) => m.label),
    ]);
    expect(text.filter((t) => /token|cost/i.test(t))).toEqual([]);
    expect(Object.keys(bench).filter((k) => /token|cost/i.test(k))).toEqual([]);
  });
});
