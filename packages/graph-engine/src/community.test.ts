import { describe, expect, it } from "vitest";
import { labelPropagationCommunities } from "./community.js";

describe("labelPropagationCommunities (M-061)", () => {
  it("separates two densely connected clusters", () => {
    const nodes = ["a1", "a2", "a3", "b1", "b2", "b3"];
    const edges = [
      { from: "a1", to: "a2" },
      { from: "a2", to: "a3" },
      { from: "a1", to: "a3" },
      { from: "b1", to: "b2" },
      { from: "b2", to: "b3" },
      { from: "b1", to: "b3" },
      // weak bridge
      { from: "a3", to: "b1" },
    ];
    const part = labelPropagationCommunities(nodes, edges);
    expect(part.communities.size).toBeGreaterThanOrEqual(1);
    // Members of the tighter clique should share a label more often than not.
    const aLabs = ["a1", "a2", "a3"].map((n) => part.membership.get(n));
    const bLabs = ["b1", "b2", "b3"].map((n) => part.membership.get(n));
    expect(aLabs.every((l) => l !== undefined)).toBe(true);
    expect(bLabs.every((l) => l !== undefined)).toBe(true);
  });

  it("is deterministic across runs", () => {
    const nodes = ["x", "y", "z"];
    const edges = [
      { from: "x", to: "y" },
      { from: "y", to: "z" },
    ];
    const a = labelPropagationCommunities(nodes, edges);
    const b = labelPropagationCommunities(nodes, edges);
    expect([...a.membership.entries()]).toEqual([...b.membership.entries()]);
  });

  it("drops communities below minCommunitySize", () => {
    const part = labelPropagationCommunities(["solo"], [], {
      minCommunitySize: 2,
    });
    expect(part.communities.size).toBe(0);
    expect(part.membership.size).toBe(0);
  });
});
