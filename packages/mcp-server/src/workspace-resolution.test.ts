import { describe, expect, it } from "vitest";
import {
  resolveWorkspacePath,
  workspaceArgFrom,
} from "./workspace-resolution.js";

describe("workspace resolution (M-026)", () => {
  const cwd = "/tmp/launch-dir";

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

  it("falls back to cwd when nothing else is given", () => {
    expect(resolveWorkspacePath({ cwd })).toEqual({
      path: cwd,
      source: "cwd",
    });
  });

  it("treats blank and whitespace-only values as absent", () => {
    // An agent that sets PRISM_WORKSPACE="" means "unset", not "the root".
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
      // Refusing to start over an unrecognised flag is worse for the user than
      // starting: the server is launched by an agent, not typed by a human.
      expect(workspaceArgFrom(["--verbose", "--workspace", "/e"])).toBe("/e");
      expect(workspaceArgFrom(["--verbose"])).toBeUndefined();
    });

    it("returns undefined when there is nothing to read", () => {
      expect(workspaceArgFrom([])).toBeUndefined();
      expect(workspaceArgFrom(["--workspace"])).toBeUndefined();
    });
  });
});
