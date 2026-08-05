import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findGitRoot,
  resolveWorkspacePath,
  workspaceArgFrom,
} from "./workspace-resolution.js";

describe("workspace resolution (M-026)", () => {
  const cwd = "/tmp/launch-dir";
  const temps: string[] = [];

  afterEach(() => {
    for (const dir of temps.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "prism-mcp-ws-"));
    temps.push(dir);
    return dir;
  }

  it("prefers the argument over the environment and cwd", () => {
    const resolved = resolveWorkspacePath({
      argument: "/repos/alpha",
      environment: "/repos/beta",
      cwd,
    });
    expect(resolved).toEqual({ path: "/repos/alpha", source: "argument" });
  });

  it("falls back to the environment when no argument is given", () => {
    const resolved = resolveWorkspacePath({
      environment: "/repos/beta",
      cwd,
    });
    expect(resolved).toEqual({ path: "/repos/beta", source: "environment" });
  });

  it("uses the nearest git root when launched inside a repository", () => {
    const root = tempDir();
    writeFileSync(join(root, ".git"), "gitdir: /somewhere");
    const nested = join(root, "packages", "app");
    mkdirSync(nested, { recursive: true });

    expect(findGitRoot(nested)).toBe(root);
    expect(resolveWorkspacePath({ cwd: nested })).toEqual({
      path: root,
      source: "git root",
    });
  });

  it("falls back to cwd when there is no git root", () => {
    const plain = tempDir();
    expect(resolveWorkspacePath({ cwd: plain })).toEqual({
      path: plain,
      source: "cwd",
    });
  });

  it("treats blank and whitespace-only values as absent", () => {
    expect(
      resolveWorkspacePath({ argument: "  ", environment: "", cwd }),
    ).toEqual({ path: cwd, source: "cwd" });
  });

  it("resolves relative paths against cwd rather than rejecting them", () => {
    expect(resolveWorkspacePath({ argument: "./repo", cwd }).path).toBe(
      "/tmp/launch-dir/repo",
    );
    expect(resolveWorkspacePath({ argument: "..", cwd }).path).toBe("/tmp");
  });

  describe("argument parsing", () => {
    it("reads --workspace, -w and --workspace=", () => {
      expect(workspaceArgFrom(["--workspace", "/a"])).toBe("/a");
      expect(workspaceArgFrom(["-w", "/b"])).toBe("/b");
      expect(workspaceArgFrom(["--workspace=/c"])).toBe("/c");
    });

    it("accepts a bare positional path", () => {
      expect(workspaceArgFrom(["/d"])).toBe("/d");
    });

    it("ignores unknown flags rather than refusing to start", () => {
      expect(workspaceArgFrom(["--verbose", "--workspace", "/e"])).toBe("/e");
      expect(workspaceArgFrom(["--verbose"])).toBeUndefined();
    });

    it("returns undefined when there is nothing to read", () => {
      expect(workspaceArgFrom([])).toBeUndefined();
      expect(workspaceArgFrom(["--workspace"])).toBeUndefined();
    });
  });
});
