import { describe, expect, it } from "vitest";
import {
  isRepoRelativePath,
  joinRepoPath,
  normalizeRepoPath,
} from "./paths.js";

describe("paths", () => {
  it("normalizes POSIX relative", () => {
    const r = normalizeRepoPath("./src//foo/../bar.ts");
    // .. rejected
    expect(r.ok).toBe(false);
  });

  it("accepts nested relative", () => {
    const r = normalizeRepoPath("src/./packages/core/index.ts");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("src/packages/core/index.ts");
  });

  it("rejects absolute and parent", () => {
    expect(normalizeRepoPath("/etc/passwd").ok).toBe(false);
    expect(normalizeRepoPath("../secret").ok).toBe(false);
  });

  it("converts backslashes", () => {
    const r = normalizeRepoPath("src\\foo\\bar.ts");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("src/foo/bar.ts");
  });

  it("joinRepoPath", () => {
    const r = joinRepoPath("src", "lib", "a.ts");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("src/lib/a.ts");
  });

  it("isRepoRelativePath", () => {
    expect(isRepoRelativePath("a/b.ts")).toBe(true);
    expect(isRepoRelativePath("/a")).toBe(false);
  });

  it("rejects NUL", () => {
    expect(normalizeRepoPath("a\0b").ok).toBe(false);
  });
});
