import { describe, expect, it } from "vitest";
import { collectRepoTrees, sortTreeJobs } from "./trees.js";

describe("sortTreeJobs", () => {
  it("puts live and failed work ahead of finished jobs", () => {
    const ordered = sortTreeJobs([
      { id: "a", status: "done" },
      { id: "b", status: "failed" },
      { id: "c", status: "running" },
      { id: "d", status: "needs_review" },
    ]);
    expect(ordered.map((row) => row.id)).toEqual(["c", "b", "d", "a"]);
  });
});

describe("collectRepoTrees", () => {
  it("groups jobs onto the matching worktree and skips skill playbooks", async () => {
    const grouped = await collectRepoTrees({
      workspacePath: "/repo",
      label: "Prism",
      jobs: [
        {
          id: "on-you",
          title: "checkout job",
          status: "done",
          workspacePath: "/repo",
          worktreePath: "/repo",
        },
        {
          id: "on-wt",
          title: "isolated",
          status: "running",
          workspacePath: "/repo",
          worktreePath: "/repo/.prism/dispatch/worktrees/isolated",
        },
        {
          id: "skill-title",
          title: "Skill: commitpush",
          status: "done",
          workspacePath: "/repo",
          worktreePath: "/repo",
        },
      ],
    });
    // Without git, collect still emits the primary folder.
    const primary = grouped.trees.find((tree) => tree.kind === "primary");
    expect(primary?.jobs.map((row) => row.id)).toEqual(["on-you"]);
    expect(primary?.jobs.some((row) => row.id === "skill")).toBe(false);
  });
});
