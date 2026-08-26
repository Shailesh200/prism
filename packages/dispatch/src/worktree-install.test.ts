import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  isPrismDispatchWorktree,
  linkWorktreeInstall,
} from "./worktree-install.js";

describe("linkWorktreeInstall", () => {
  let root = "";
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("refuses paths outside .prism/dispatch/worktrees", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-link-"));
    expect(isPrismDispatchWorktree(root, join(root, "elsewhere"))).toBe(false);
    const result = await linkWorktreeInstall({
      workspaceRoot: root,
      worktreePath: join(root, "elsewhere"),
    });
    expect(result.linked).toBe(false);
    expect(result.reason).toMatch(/not a Prism Dispatch worktree/);
  });

  it("replaces a real node_modules with a symlink to the host install", async () => {
    root = await mkdtemp(join(tmpdir(), "prism-link-"));
    const hostModules = join(root, "node_modules");
    const worktree = join(root, ".prism", "dispatch", "worktrees", "audit");
    const treeModules = join(worktree, "node_modules");
    await mkdir(hostModules);
    await writeFile(join(hostModules, "marker"), "host");
    await mkdir(treeModules, { recursive: true });
    await writeFile(join(treeModules, "junk"), "copy");

    const result = await linkWorktreeInstall({
      workspaceRoot: root,
      worktreePath: worktree,
    });
    expect(result.linked).toBe(true);
    const info = await stat(join(treeModules, "marker"));
    expect(info.isFile()).toBe(true);

    const again = await linkWorktreeInstall({
      workspaceRoot: root,
      worktreePath: worktree,
    });
    expect(again.linked).toBe(false);
    expect(again.reason).toMatch(/already linked/);
  });
});
