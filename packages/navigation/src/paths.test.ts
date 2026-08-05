import { describe, expect, it } from "vitest";
import {
  NavigationRouteResultSchema,
  type GraphSnapshotDto,
} from "@repo-prism/shared";
import { findPaths, shortestPath } from "./paths.js";

function graph(
  edges: Array<[string, string]>,
  nodes?: string[],
): GraphSnapshotDto {
  const ids = new Set<string>(nodes ?? []);
  for (const [a, b] of edges) {
    ids.add(a);
    ids.add(b);
  }
  return {
    id: "g",
    nodes: [...ids].sort().map((id) => ({ id, kind: "file", label: id })),
    edges: edges.map(([from, to], i) => ({
      id: `e${i}`,
      kind: "imports",
      from,
      to,
    })),
  };
}

describe("findPaths (M-016)", () => {
  it("finds shortest path on a line", () => {
    const g = graph([
      ["file:a.ts", "file:b.ts"],
      ["file:b.ts", "file:c.ts"],
    ]);
    expect(shortestPath(g, "file:a.ts", "file:c.ts")).toEqual([
      "file:a.ts",
      "file:b.ts",
      "file:c.ts",
    ]);
  });

  it("returns empty result when no route exists", () => {
    const g = graph([
      ["file:a.ts", "file:b.ts"],
      ["file:c.ts", "file:d.ts"],
    ]);
    const result = findPaths(g, "file:a.ts", "file:d.ts");
    expect(NavigationRouteResultSchema.safeParse(result).success).toBe(true);
    expect(result.empty).toBe(true);
    expect(result.routes).toEqual([]);
  });

  it("returns multiple alternatives when requested", () => {
    const g = graph([
      ["file:a.ts", "file:b.ts"],
      ["file:b.ts", "file:d.ts"],
      ["file:a.ts", "file:c.ts"],
      ["file:c.ts", "file:d.ts"],
    ]);
    const result = findPaths(g, "file:a.ts", "file:d.ts", {
      maxAlternatives: 2,
    });
    expect(result.empty).toBe(false);
    expect(result.routes.length).toBeGreaterThanOrEqual(2);
    expect(result.routes[0]?.length).toBe(2);
  });
});
