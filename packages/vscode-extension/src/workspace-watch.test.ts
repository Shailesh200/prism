import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_REINDEX,
  resolveAutoReindexEnabled,
  toRepoRelativePath,
} from "./workspace-watch.js";

describe("workspace-watch (M-057 P-B1)", () => {
  it("defaults auto-reindex to on when nothing is stored", () => {
    expect(DEFAULT_AUTO_REINDEX).toBe(true);
    expect(resolveAutoReindexEnabled(undefined)).toBe(true);
  });

  it("honours an explicit off preference", () => {
    expect(resolveAutoReindexEnabled(false)).toBe(false);
    expect(resolveAutoReindexEnabled(true)).toBe(true);
  });

  it("normalises watched URIs to forward-slashed repo paths", () => {
    const asRelativePath = (uri: { fsPath: string }) =>
      uri.fsPath.replace(/\\/g, "/").replace(/^\/repo\//, "");
    expect(
      toRepoRelativePath(
        asRelativePath as never,
        {
          fsPath: "/repo/src\\a.ts",
        } as never,
      ),
    ).toBe("src/a.ts");
  });
});
