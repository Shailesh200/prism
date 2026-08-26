import { describe, expect, it } from "vitest";
import { adoptOrCreateWorktree } from "./worktrees.js";
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
});
