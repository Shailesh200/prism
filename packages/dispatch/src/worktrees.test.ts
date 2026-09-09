import { describe, expect, it } from "vitest";
import { adoptOrCreateWorktree, alreadyCheckedOutPath } from "./worktrees.js";
import type { GitRunner } from "./git.js";

describe("adopt vs create", () => {
  it("creates a prism worktree when nothing matches", async () => {
    const calls: string[][] = [];
    const run: GitRunner = async (_cwd, args) => {
      calls.push([...args]);
      if (args[0] === "worktree" && args[1] === "list") {
        return { ok: true, stdout: "", stderr: "" };
      }
      if (args[0] === "rev-parse") {
        return { ok: false, stdout: "", stderr: "unknown" };
      }
      if (args[0] === "worktree" && args[1] === "add") {
        return { ok: true, stdout: "", stderr: "" };
      }
      return { ok: true, stdout: "", stderr: "" };
    };
    const tree = await adoptOrCreateWorktree({
      workspaceRoot: "/repo",
      jobId: "NEW-1",
      title: "brand new",
      run,
    });
    expect(tree.source).toBe("prism");
    expect(tree.path).toContain(".prism/dispatch/worktrees/NEW-1");
    expect(
      calls.some((args) => args[0] === "worktree" && args[1] === "add"),
    ).toBe(true);
  });

  it("adopts a linked tree whose branch was asked for", async () => {
    const run: GitRunner = async (_cwd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          ok: true,
          stdout: [
            "worktree /repo",
            "HEAD abc",
            "branch refs/heads/main",
            "",
            "worktree /repo/.prism/dispatch/worktrees/wt1",
            "HEAD def",
            "branch refs/heads/feature/wt1",
            "",
          ].join("\n"),
          stderr: "",
        };
      }
      return { ok: true, stdout: "", stderr: "" };
    };
    const tree = await adoptOrCreateWorktree({
      workspaceRoot: "/repo",
      jobId: "other-id",
      title: "something else",
      preferredBranch: "feature/wt1",
      run,
    });
    expect(tree.path).toBe("/repo/.prism/dispatch/worktrees/wt1");
    expect(tree.branch).toBe("feature/wt1");
  });

  it("adopts the existing checkout when git refuses a second worktree on that branch", async () => {
    const run: GitRunner = async (_cwd, args) => {
      if (args[0] === "worktree" && args[1] === "list") {
        return {
          ok: true,
          stdout: [
            "worktree /repo",
            "HEAD abc",
            "branch refs/heads/main",
            "",
            "worktree /existing/wt",
            "HEAD def",
            "branch refs/heads/dispatch/clash",
            "",
          ].join("\n"),
          stderr: "",
        };
      }
      if (args[0] === "rev-parse") {
        return { ok: true, stdout: "yes\n", stderr: "" };
      }
      if (args[0] === "worktree" && args[1] === "add") {
        return {
          ok: false,
          stdout: "",
          stderr:
            "fatal: 'dispatch/clash' is already checked out at '/existing/wt'\n",
        };
      }
      return { ok: true, stdout: "", stderr: "" };
    };
    const tree = await adoptOrCreateWorktree({
      workspaceRoot: "/repo",
      jobId: "fresh-job",
      title: "no overlap with existing names",
      preferredBranch: "dispatch/other",
      run,
    });
    expect(tree.path).toBe("/existing/wt");
  });
});

describe("alreadyCheckedOutPath", () => {
  it("reads the path git names", () => {
    expect(
      alreadyCheckedOutPath(
        "fatal: 'feat/x' is already checked out at '/Users/me/wt'\n",
      ),
    ).toBe("/Users/me/wt");
  });
});
