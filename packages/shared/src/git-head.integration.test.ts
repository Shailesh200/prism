import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readGitHead } from "./git-head.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
  }).trim();

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "prism-head-"));
  git(dir, "init", "-q", "-b", "main");
  writeFileSync(join(dir, "a"), "a");
  git(dir, "add", "a");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "a");
  return dir;
}

describe("readGitHead (plan §2.4)", () => {
  it("HEAD-1 matches git rev-parse on a branch", () => {
    const dir = repo();
    expect(readGitHead(dir)).toEqual({
      sha: git(dir, "rev-parse", "HEAD"),
      branch: "main",
    });
  });
  it("HEAD-2 packed refs and detached HEAD", () => {
    const dir = repo();
    git(dir, "pack-refs", "--all");
    expect(readGitHead(dir)?.sha).toBe(git(dir, "rev-parse", "HEAD"));
    git(dir, "checkout", "-q", "--detach");
    expect(readGitHead(dir)).toEqual({
      sha: git(dir, "rev-parse", "HEAD"),
      branch: null,
    });
  });
  it("HEAD-3 worktree", () => {
    const dir = repo();
    const wt = join(mkdtempSync(join(tmpdir(), "prism-wt-")), "wt");
    git(dir, "worktree", "add", "-q", "-b", "side", wt);
    expect(readGitHead(wt)).toEqual({
      sha: git(wt, "rev-parse", "HEAD"),
      branch: "side",
    });
  });
  it("HEAD-4 not a checkout → null", () => {
    expect(readGitHead(mkdtempSync(join(tmpdir(), "prism-nogit-")))).toBeNull();
  });
});
