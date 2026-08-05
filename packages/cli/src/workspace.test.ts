import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findGitRoot, resolveWorkspace } from "./workspace.js";

describe("workspace resolution (M-028)", () => {
  const cwd = "/tmp/somewhere";

  it("prefers --workspace over everything", () => {
    expect(
      resolveWorkspace({ flag: "/repos/a", environment: "/repos/b", cwd }),
    ).toEqual({ path: "/repos/a", source: "--workspace" });
  });

  it("falls back to PRISM_WORKSPACE", () => {
    expect(resolveWorkspace({ environment: "/repos/b", cwd })).toEqual({
      path: "/repos/b",
      source: "PRISM_WORKSPACE",
    });
  });

  it("treats blank values as absent", () => {
    const resolved = resolveWorkspace({ flag: "  ", environment: "", cwd });
    expect(resolved.source).not.toBe("--workspace");
    expect(resolved.source).not.toBe("PRISM_WORKSPACE");
  });

  it("resolves relative paths against cwd", () => {
    expect(resolveWorkspace({ flag: "./repo", cwd }).path).toBe(
      "/tmp/somewhere/repo",
    );
  });

  describe("git-root discovery", () => {
    it("finds the repository root from a nested directory", async () => {
      // The behaviour users actually rely on: running `prism health` three
      // directories deep should analyse the repository, not the directory.
      const root = await mkdtemp(join(tmpdir(), "prism-cli-git-"));
      await mkdir(join(root, ".git"), { recursive: true });
      const nested = join(root, "packages", "app", "src");
      await mkdir(nested, { recursive: true });

      const resolved = resolveWorkspace({ cwd: nested });
      expect(resolved.source).toBe("git root");
      expect(resolved.path).toBe(root);
    });

    it("treats a .git file as a root, for worktrees and submodules", async () => {
      const root = await mkdtemp(join(tmpdir(), "prism-cli-worktree-"));
      await writeFile(
        join(root, ".git"),
        "gitdir: /elsewhere/.git/worktrees/x",
      );
      const nested = join(root, "src");
      await mkdir(nested, { recursive: true });

      expect(resolveWorkspace({ cwd: nested }).path).toBe(root);
    });

    it("falls back to cwd outside a repository", async () => {
      const plain = await mkdtemp(join(tmpdir(), "prism-cli-plain-"));
      // A temp dir can sit under a repository on some machines; only assert
      // the fallback when it genuinely has no git ancestor.
      if (findGitRoot(plain) !== undefined) return;

      expect(resolveWorkspace({ cwd: plain })).toEqual({
        path: plain,
        source: "cwd",
      });
    });

    it("stops at the filesystem root rather than looping", () => {
      expect(() => findGitRoot("/")).not.toThrow();
    });
  });
});
