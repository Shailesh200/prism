import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findGitRoot,
  isEditorSandboxPath,
  pathFromHint,
  resolveWorkspacePath,
  splitHostPaths,
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

  it("treats macOS Cursor container homes as sandbox", () => {
    expect(
      isEditorSandboxPath(
        "/Users/me/Library/Containers/com.todesktop.230313mzl4w4u92/Data",
      ),
    ).toBe(true);
    expect(isEditorSandboxPath("/Users/me/src/arcana-platform-website")).toBe(
      false,
    );
  });

  it("uses CURSOR_WORKSPACE when it is a git repo", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    expect(
      resolveWorkspacePath({
        cwd: tempDir(),
        env: { CURSOR_WORKSPACE: project },
      }),
    ).toEqual({ path: project, source: "CURSOR_WORKSPACE" });
  });

  it("prefers Cursor WORKSPACE_FOLDER_PATHS over a non-repo launch cwd", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    const editorHome = tempDir();

    expect(
      resolveWorkspacePath({
        cwd: editorHome,
        env: { WORKSPACE_FOLDER_PATHS: project },
      }),
    ).toEqual({ path: project, source: "WORKSPACE_FOLDER_PATHS" });
  });

  it("walks from a workspace folder up to its git root", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    const nested = join(project, "apps", "web");
    mkdirSync(nested, { recursive: true });

    expect(
      resolveWorkspacePath({
        cwd: tempDir(),
        env: { WORKSPACE_FOLDER_PATHS: nested },
      }),
    ).toEqual({ path: project, source: "WORKSPACE_FOLDER_PATHS" });
  });

  it("uses INIT_CWD only when it contains a git root and cwd does not", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    const npxCache = tempDir();

    expect(
      resolveWorkspacePath({
        cwd: npxCache,
        env: { INIT_CWD: project },
      }),
    ).toEqual({ path: project, source: "INIT_CWD" });
  });

  it("does not let a non-git INIT_CWD steal a cwd that is already a repo", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    const home = tempDir();

    expect(
      resolveWorkspacePath({
        cwd: project,
        env: { INIT_CWD: home },
      }),
    ).toEqual({ path: project, source: "git root" });
  });

  it("decodes file:// workspace folder URIs", () => {
    const project = tempDir();
    writeFileSync(join(project, ".git"), "gitdir: /somewhere");
    expect(pathFromHint(`file://${project}`, cwd)).toBe(project);
    expect(
      resolveWorkspacePath({
        cwd: tempDir(),
        env: { WORKSPACE_FOLDER_PATHS: `file://${project}` },
      }),
    ).toEqual({ path: project, source: "WORKSPACE_FOLDER_PATHS" });
  });

  it("splits host search paths on the OS delimiter", () => {
    expect(splitHostPaths("")).toEqual([]);
    expect(splitHostPaths("  ")).toEqual([]);
    expect(splitHostPaths("/only")).toEqual(["/only"]);
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
