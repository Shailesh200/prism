import { describe, expect, it } from "vitest";
import {
  colorGitGraphNodes,
  gitGraphEdgePath,
  gitGraphLaneColor,
  gitGraphPoint,
  gitRefBranch,
  layoutGitGraph,
  worktreeColorMap,
  type GitGraphCommit,
} from "./git-graph.js";

function commit(
  sha: string,
  parents: readonly string[] = [],
  refs: readonly string[] = [],
): GitGraphCommit {
  return { sha, parents, refs, subject: sha, at: "2026-01-01T00:00:00.000Z" };
}

describe("layoutGitGraph", () => {
  it("keeps a linear history on one growing lane", () => {
    const layout = layoutGitGraph([
      commit("c", ["b"], ["HEAD -> main"]),
      commit("b", ["a"]),
      commit("a"),
    ]);
    expect(layout.lanes).toBe(1);
    expect(layout.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    expect(layout.nodes[0]?.isHead).toBe(true);
    expect(layout.edges).toHaveLength(2);
  });

  it("opens a second lane for a merge parent", () => {
    const layout = layoutGitGraph([
      commit("m", ["b", "f"], ["HEAD"]),
      commit("f", ["a"]),
      commit("b", ["a"]),
      commit("a"),
    ]);
    expect(layout.lanes).toBeGreaterThanOrEqual(2);
    const merge = layout.nodes.find((n) => n.sha === "m");
    expect(merge?.isHead).toBe(true);
    expect(layout.edges.some((e) => e.fromLane !== e.toLane)).toBe(true);
  });
});

describe("worktree colors", () => {
  it("reads the branch out of a HEAD decoration", () => {
    expect(gitRefBranch("HEAD -> milestone/M-078")).toBe("milestone/M-078");
    expect(gitRefBranch("origin/dispatch/fix-x")).toBe("dispatch/fix-x");
    expect(gitRefBranch("HEAD")).toBeUndefined();
  });

  it("paints a worktree tip and its first-parent history the same color", () => {
    const commits = [
      commit("c", ["b"], ["HEAD -> dispatch/fix-x"]),
      commit("b", ["a"]),
      commit("a"),
    ];
    const layout = layoutGitGraph(commits);
    const colors = colorGitGraphNodes(commits, layout, [
      { branch: "main" },
      { branch: "dispatch/fix-x" },
    ]);
    const linked = gitGraphLaneColor(1);
    expect(
      worktreeColorMap([{ branch: "main" }, { branch: "dispatch/fix-x" }]).get(
        "dispatch/fix-x",
      ),
    ).toBe(linked);
    expect(colors.get("c")).toBe(linked);
    expect(colors.get("b")).toBe(linked);
    expect(colors.get("a")).toBe(linked);
  });
});

describe("gitGraph geometry", () => {
  it("stacks rows downward and bends merge edges", () => {
    const a = gitGraphPoint(0, 0);
    const b = gitGraphPoint(1, 0);
    expect(b.y).toBeGreaterThan(a.y);
    const bent = gitGraphEdgePath({
      fromRow: 0,
      fromLane: 0,
      toRow: 2,
      toLane: 1,
      lane: 0,
    });
    expect(bent).toContain("C");
  });
});
