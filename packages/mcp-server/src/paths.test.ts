import { describe, expect, it } from "vitest";
import {
  PrismErrorCode,
  type PrismError,
  type Result,
} from "@repo-prism/shared";
import { allWorkspaceRelative, toWorkspaceRelative } from "./paths.js";

const root = "/repos/app";

function expectRejected(
  result: Result<string | string[], PrismError>,
  contains: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe(PrismErrorCode.INVALID_PATH);
  expect(result.error.message).toContain(contains);
}

describe("path inputs from agents (M-027)", () => {
  it("passes a plain relative path through", () => {
    const result = toWorkspaceRelative(root, "src/index.ts");
    expect(result.ok && result.value).toBe("src/index.ts");
  });

  it("normalises redundant segments", () => {
    const result = toWorkspaceRelative(root, "./src/../src/index.ts");
    expect(result.ok && result.value).toBe("src/index.ts");
  });

  it("accepts an absolute path inside the workspace", () => {
    // An agent reading a stack trace legitimately holds absolute paths.
    const result = toWorkspaceRelative(root, "/repos/app/src/index.ts");
    expect(result.ok && result.value).toBe("src/index.ts");
  });

  it("returns '.' for the workspace root itself", () => {
    const result = toWorkspaceRelative(root, "/repos/app");
    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe(".");
  });

  it("rejects an escape via ..", () => {
    expectRejected(
      toWorkspaceRelative(root, "../secrets/.env"),
      "outside the workspace",
    );
  });

  it("rejects a deep escape that lands somewhere plausible", () => {
    expectRejected(
      toWorkspaceRelative(root, "src/../../other-checkout/src/index.ts"),
      "outside the workspace",
    );
  });

  it("rejects an absolute path elsewhere on the machine", () => {
    expectRejected(toWorkspaceRelative(root, "/etc/passwd"), "/etc/passwd");
  });

  it("rejects a sibling directory sharing the root's prefix", () => {
    // /repos/app-secrets starts with /repos/app but is a different repository.
    expectRejected(
      toWorkspaceRelative(root, "/repos/app-secrets/.env"),
      "outside the workspace",
    );
  });

  it("rejects an empty or whitespace-only path", () => {
    expectRejected(toWorkspaceRelative(root, ""), "empty");
    expectRejected(toWorkspaceRelative(root, "   "), "empty");
  });

  it("echoes the offending path back so the failure is diagnosable", () => {
    const result = toWorkspaceRelative(root, "../../../etc/shadow");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.details).toMatchObject({ workspaceRoot: root });
  });

  describe("lists", () => {
    it("resolves every path", () => {
      const result = allWorkspaceRelative(root, [
        "src/a.ts",
        "/repos/app/b.ts",
      ]);
      expect(result.ok && result.value).toEqual(["src/a.ts", "b.ts"]);
    });

    it("fails the whole call on the first bad path", () => {
      // Partial success would leave the agent believing it reviewed everything.
      const result = allWorkspaceRelative(root, [
        "src/a.ts",
        "../escape.ts",
        "src/c.ts",
      ]);
      expectRejected(result, "outside the workspace");
    });
  });
});
