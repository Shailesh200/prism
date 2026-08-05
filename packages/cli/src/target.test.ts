import { describe, expect, it } from "vitest";
import {
  allWorkspaceRelative,
  resolveTarget,
  toWorkspaceRelative,
} from "./target.js";

const ROOT = "/repo";

function value<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error("expected ok");
  return result.value as T;
}

describe("toWorkspaceRelative", () => {
  it("passes a path already relative to the root", () => {
    expect(value(toWorkspaceRelative(ROOT, ROOT, "src/a.ts"))).toBe("src/a.ts");
  });

  it("resolves against the cwd, so a path typed in a subdirectory works", () => {
    // This is the case that makes the CLI usable: a user standing in
    // `packages/core` types `src/a.ts` and means `packages/core/src/a.ts`.
    expect(
      value(toWorkspaceRelative(ROOT, "/repo/packages/core", "src/a.ts")),
    ).toBe("packages/core/src/a.ts");
  });

  it("accepts an absolute path, because error messages contain those", () => {
    expect(
      value(toWorkspaceRelative(ROOT, "/elsewhere", "/repo/src/a.ts")),
    ).toBe("src/a.ts");
  });

  it("normalises ./ and ../ inside the workspace", () => {
    expect(
      value(toWorkspaceRelative(ROOT, "/repo/src", "./nested/../a.ts")),
    ).toBe("src/a.ts");
  });

  it("refuses a path that escapes the workspace", () => {
    // Silently clamping would analyse the wrong file and report "nothing
    // depends on this", which is the most dangerous wrong answer available.
    const result = toWorkspaceRelative(ROOT, ROOT, "../secrets.txt");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("PRISM_INVALID_PATH");
    expect(result.error.message).toContain("outside the workspace");
  });

  it("refuses an absolute path elsewhere on disk", () => {
    expect(toWorkspaceRelative(ROOT, ROOT, "/etc/passwd").ok).toBe(false);
  });

  it("refuses the workspace root itself, which names no file", () => {
    const result = toWorkspaceRelative(ROOT, ROOT, ".");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("workspace root");
  });

  it("refuses an empty path", () => {
    expect(toWorkspaceRelative(ROOT, ROOT, "   ").ok).toBe(false);
  });

  it("emits POSIX separators regardless of platform", () => {
    expect(value(toWorkspaceRelative(ROOT, ROOT, "src/a/b.ts"))).not.toContain(
      "\\",
    );
  });
});

describe("allWorkspaceRelative", () => {
  it("resolves every path", () => {
    expect(value(allWorkspaceRelative(ROOT, ROOT, ["a.ts", "b.ts"]))).toEqual([
      "a.ts",
      "b.ts",
    ]);
  });

  it("fails on the first bad path rather than dropping it silently", () => {
    const result = allWorkspaceRelative(ROOT, ROOT, ["a.ts", "../x.ts"]);
    expect(result.ok).toBe(false);
  });
});

describe("resolveTarget", () => {
  it("treats the argument as a file by default", () => {
    expect(value(resolveTarget(ROOT, ROOT, "src/a.ts"))).toEqual({
      kind: "file",
      id: "src/a.ts",
    });
  });

  it("treats it as a symbol name under --symbol, and does not path-check it", () => {
    expect(
      value(resolveTarget(ROOT, ROOT, "createWorkspace", { symbol: true })),
    ).toEqual({ kind: "symbol", id: "createWorkspace" });
  });

  it("resolves --in as a path when disambiguating a symbol", () => {
    expect(
      value(
        resolveTarget(ROOT, "/repo/packages/core", "createWorkspace", {
          symbol: true,
          in: "src/workspace.ts",
        }),
      ),
    ).toEqual({
      kind: "symbol",
      id: "createWorkspace",
      path: "packages/core/src/workspace.ts",
    });
  });

  it("refuses an --in outside the workspace", () => {
    expect(
      resolveTarget(ROOT, ROOT, "x", { symbol: true, in: "../elsewhere.ts" })
        .ok,
    ).toBe(false);
  });

  it("refuses a file target outside the workspace", () => {
    expect(resolveTarget(ROOT, ROOT, "../../etc/passwd").ok).toBe(false);
  });
});
