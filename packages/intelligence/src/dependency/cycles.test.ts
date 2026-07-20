import { describe, expect, it } from "vitest";
import { findCycles } from "./cycles.js";

describe("findCycles", () => {
  it("detects a 3-node cycle", () => {
    const cycles = findCycles(
      ["a", "b", "c"],
      [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
      ],
    );
    expect(cycles).toEqual([["a", "b", "c"]]);
  });

  it("detects self-loop", () => {
    expect(findCycles(["a"], [{ from: "a", to: "a" }])).toEqual([["a"]]);
  });

  it("returns empty when acyclic", () => {
    expect(
      findCycles(
        ["a", "b"],
        [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
        ],
      ),
    ).toEqual([]);
  });
});
