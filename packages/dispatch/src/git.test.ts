import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultGitRunner,
  gitChildEnv,
  isMissingGitRepoMessage,
} from "./git.js";

describe("git runner isolation", () => {
  const temps: string[] = [];

  afterEach(async () => {
    for (const dir of temps.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function gitRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "prism-dispatch-git-"));
    temps.push(root);
    execFileSync("git", ["init", "--quiet", "--initial-branch=main"], {
      cwd: root,
    });
    execFileSync("git", ["config", "user.name", "Fixture"], { cwd: root });
    execFileSync("git", ["config", "user.email", "fixture@example.invalid"], {
      cwd: root,
    });
    execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: root });
    await writeFile(join(root, "README.md"), "ok\n");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "first"], { cwd: root });
    return root;
  }

  it("still sees a real repo when GIT_DIR is inherited and wrong", async () => {
    const root = await gitRepo();
    const previous = process.env.GIT_DIR;
    process.env.GIT_DIR = "/tmp/prism-not-a-git-dir";
    try {
      const result = await defaultGitRunner(root, [
        "rev-parse",
        "--is-inside-work-tree",
      ]);
      expect(result.ok).toBe(true);
      expect(result.stdout.trim()).toBe("true");
    } finally {
      if (previous === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = previous;
    }
  });

  it("strips git override variables from the child env", () => {
    const env = gitChildEnv({
      PATH: "/usr/bin",
      GIT_DIR: "/tmp/wrong",
      GIT_WORK_TREE: "/tmp/also-wrong",
      HOME: "/home/dev",
    });
    expect(env.GIT_DIR).toBeUndefined();
    expect(env.GIT_WORK_TREE).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/home/dev");
  });

  it("recognises the missing-repo fatal", () => {
    expect(
      isMissingGitRepoMessage(
        "fatal: not a git repository (or any of the parent directories): .git",
      ),
    ).toBe(true);
    expect(isMissingGitRepoMessage("worktree add failed")).toBe(false);
  });
});
