import { describe, expect, it } from "vitest";
import { parseJestListTests } from "./local-runners.js";

const ROOT = "/repo";

/**
 * M-052: `jest --listTests` output was parsed by accepting every line that
 * wasn't JSON, so npm warnings and npx failure messages became entries in the
 * suite tree. A user with no jest installed saw five "test files" named after
 * error text.
 */
describe("parseJestListTests", () => {
  it("returns the test files jest listed, relative to the root", () => {
    const raw = [
      "/repo/src/a.test.ts",
      "/repo/src/nested/b.spec.tsx",
      "/repo/src/c.test.mjs",
    ].join("\n");

    expect(parseJestListTests(raw, ROOT)).toEqual({
      files: [
        { path: "src/a.test.ts", tests: [] },
        { path: "src/c.test.mjs", tests: [] },
        { path: "src/nested/b.spec.tsx", tests: [] },
      ],
    });
  });

  it("ignores npm and npx noise on stderr", () => {
    const raw = [
      "(node:16297) ExperimentalWarning: CommonJS module /x/debug/src/node.js is loading ES Module /x/supports-color/index.js using require().",
      "(Use `node --trace-warnings ...` to show where the warning was created)",
      "npm error A complete log of this run can be found in: /Users/me/.npm/_logs/x-debug-0.log",
      'npm error npx canceled due to missing packages and no YES option: ["jest@29.7.0"]',
      "Support for loading ES Module in require() is an experimental feature and might change at any time",
      "/repo/src/real.test.ts",
    ].join("\n");

    expect(parseJestListTests(raw, ROOT)).toEqual({
      files: [{ path: "src/real.test.ts", tests: [] }],
    });
  });

  it("returns nothing when the output is only noise", () => {
    const raw = [
      "npm warn exec The following package was not found",
      "Done in 1.42s",
    ].join("\n");

    expect(parseJestListTests(raw, ROOT).files).toEqual([]);
  });

  it("skips JSON blobs and blank lines", () => {
    const raw = ['{"foo":1}', "", "   ", "[1,2]", "/repo/a.test.js"].join("\n");

    expect(parseJestListTests(raw, ROOT)).toEqual({
      files: [{ path: "a.test.js", tests: [] }],
    });
  });

  it("de-duplicates a path listed twice", () => {
    const raw = ["/repo/a.test.ts", "/repo/a.test.ts"].join("\n");

    expect(parseJestListTests(raw, ROOT).files).toHaveLength(1);
  });

  it("normalises Windows separators", () => {
    expect(
      parseJestListTests("C:\\repo\\src\\a.test.ts", "C:\\repo").files,
    ).toEqual([{ path: "src/a.test.ts", tests: [] }]);
  });

  it("keeps a relative path jest printed outside the root", () => {
    expect(parseJestListTests("src/a.test.ts", ROOT).files).toEqual([
      { path: "src/a.test.ts", tests: [] },
    ]);
  });
});
