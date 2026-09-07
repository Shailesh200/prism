import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultGitRunner,
  gitChildEnv,
  isMissingGitRepoMessage,
  mergeJobBranch,
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

  // Six real git subprocesses to build the fixture plus one to assert on. The
  // default 5s budget is fine alone but starves when the whole package runs in
  // parallel, so this asserts isolation, not speed.
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
  }, 30_000);

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

describe("mergeJobBranch", () => {
  const temps: string[] = [];

  afterEach(async () => {
    for (const dir of temps.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function gitRepo(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "prism-dispatch-merge-"));
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

  it("merges a job branch onto the current checkout", async () => {
    const root = await gitRepo();
    execFileSync("git", ["checkout", "-b", "dispatch/land-me", "--quiet"], {
      cwd: root,
    });
    await writeFile(join(root, "job.txt"), "from the job\n");
    execFileSync("git", ["add", "job.txt"], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "job work"], { cwd: root });
    execFileSync("git", ["checkout", "main", "--quiet"], { cwd: root });
    const result = await mergeJobBranch(root, "dispatch/land-me");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.into).toBe("main");
      expect(result.already).toBe(false);
    }
    expect(
      execFileSync("git", ["log", "--oneline"], { cwd: root }).toString(),
    ).toMatch(/job work/);
  }, 30_000);

  it("is a no-op when the job branch is already the current branch", async () => {
    const root = await gitRepo();
    const result = await mergeJobBranch(root, "main");
    expect(result).toEqual({ ok: true, into: "main", already: true });
  }, 30_000);

  it("aborts a conflicting merge and leaves the tree clean", async () => {
    const root = await gitRepo();
    execFileSync("git", ["checkout", "-b", "dispatch/clash", "--quiet"], {
      cwd: root,
    });
    await writeFile(join(root, "README.md"), "job\n");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "job readme"], {
      cwd: root,
    });
    execFileSync("git", ["checkout", "main", "--quiet"], { cwd: root });
    await writeFile(join(root, "README.md"), "main\n");
    execFileSync("git", ["add", "README.md"], { cwd: root });
    execFileSync("git", ["commit", "--quiet", "-m", "main readme"], {
      cwd: root,
    });
    const result = await mergeJobBranch(root, "dispatch/clash");
    expect(result.ok).toBe(false);
    const status = await defaultGitRunner(root, ["status", "--porcelain"]);
    expect(status.stdout.trim()).toBe("");
  }, 30_000);
});
