import { describe, expect, it } from "vitest";
import { isTestPath, isTypeDeclarationPath } from "./test-paths.js";

describe("isTestPath", () => {
  it.each([
    "src/foo.test.ts",
    "src/foo.spec.ts",
    "src/foo.test.tsx",
    "src/foo.spec.jsx",
    "src/foo.test.mts",
    "src/foo.test.cts",
    "src/foo.test.mjs",
    "src/foo.spec.cjs",
  ])("recognises the test filename %s", (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each([
    "src/__tests__/foo.ts",
    "src/__mocks__/foo.ts",
    "test/foo.ts",
    "tests/foo.ts",
    "e2e/foo.ts",
    "spec/foo.ts",
    "specs/foo.ts",
    "packages/core/tests/deep/foo.ts",
  ])("recognises the test directory %s", (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each([
    "tests/test_thing.py",
    "pkg/thing_test.go",
    "lib/thing_test.rb",
    "src/ThingTest.java",
    "src/ThingTest.kt",
  ])("recognises the non-TypeScript test file %s", (path) => {
    expect(isTestPath(path)).toBe(true);
  });

  it.each([
    "src/foo.ts",
    "src/testing.ts",
    "src/contest.ts",
    "src/latest.ts",
    "src/protest/foo.ts",
    "src/attestation.ts",
    "README.md",
  ])("does not treat %s as a test", (path) => {
    expect(isTestPath(path)).toBe(false);
  });

  it("normalises Windows separators", () => {
    expect(isTestPath("src\\__tests__\\foo.ts")).toBe(true);
    expect(isTestPath("src\\foo.test.ts")).toBe(true);
  });

  it("handles an empty path", () => {
    expect(isTestPath("")).toBe(false);
  });

  // The directory rule must match a path segment, not a substring, or
  // `src/latest/foo.ts` would be misread as test code.
  it("matches directories on segment boundaries", () => {
    expect(isTestPath("src/latest/foo.ts")).toBe(false);
    expect(isTestPath("src/mytests/foo.ts")).toBe(false);
    expect(isTestPath("src/test/foo.ts")).toBe(true);
  });
});

describe("isTypeDeclarationPath", () => {
  it.each(["src/foo.d.ts", "src/foo.d.mts", "src/foo.d.cts"])(
    "recognises %s",
    (path) => {
      expect(isTypeDeclarationPath(path)).toBe(true);
    },
  );

  it.each(["src/foo.ts", "src/foo.dts", "src/d.ts.txt"])(
    "does not treat %s as a declaration",
    (path) => {
      expect(isTypeDeclarationPath(path)).toBe(false);
    },
  );
});
