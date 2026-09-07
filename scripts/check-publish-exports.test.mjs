import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  namedWorkspaceImports,
  parseSpecifiers,
  parseWorkspaceSpecifier,
  skippedDepSkewProblems,
  staticExportedNames,
} from "./check-publish-exports.mjs";

describe("namedWorkspaceImports", () => {
  it("reads a multiline named import and ignores type-only imports", () => {
    const source = `
import type { JobRecord } from "@repo-prism/dispatch";
import {
  formatDuration,
  primaryDurationMs,
} from "@repo-prism/shared";
export { ensureHub, type HubHandle } from "@repo-prism/dispatch-hub";
`;
    assert.deepEqual(namedWorkspaceImports(source), [
      { name: "formatDuration", from: "@repo-prism/shared" },
      { name: "primaryDurationMs", from: "@repo-prism/shared" },
      { name: "ensureHub", from: "@repo-prism/dispatch-hub" },
    ]);
  });

  it("drops type specifiers inside a value import list", () => {
    assert.deepEqual(parseSpecifiers("formatDuration as fmt, type JobRecord"), [
      "formatDuration",
    ]);
  });

  it("splits a subpath specifier", () => {
    assert.deepEqual(
      parseWorkspaceSpecifier("@repo-prism/host-session/protocol"),
      { folder: "host-session", subpath: "protocol" },
    );
  });
});

describe("staticExportedNames", () => {
  it("reads re-exported names from a barrel file", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-exports-test-"));
    try {
      const entry = join(dir, "index.js");
      writeFileSync(
        entry,
        'export { formatDuration, primaryDurationMs } from "./duration.js";\n',
      );
      assert.deepEqual([...staticExportedNames(entry)].toSorted(), [
        "formatDuration",
        "primaryDurationMs",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("skippedDepSkewProblems", () => {
  it("catches the 1.8.0 hub/shared skew", () => {
    const packagesByFolder = new Map([
      [
        "dispatch-hub",
        { name: "@repo-prism/dispatch-hub", version: "1.8.0", publish: true },
      ],
      [
        "shared",
        { name: "@repo-prism/shared", version: "1.1.1", publish: false },
      ],
    ]);
    const published = {
      shared: new Set(["primaryDurationMs"]),
    };
    const problems = skippedDepSkewProblems(
      [
        {
          file: "packages/dispatch-hub/dist/statusline.js",
          name: "formatDuration",
          from: "@repo-prism/shared",
        },
      ],
      packagesByFolder,
      (folder) => published[folder] ?? new Set(),
    );
    assert.equal(problems.length, 1);
    assert.match(problems[0] ?? "", /formatDuration/);
    assert.match(problems[0] ?? "", /Bump @repo-prism\/shared/);
  });

  it("allows the import when the dependency is also publishing", () => {
    const packagesByFolder = new Map([
      [
        "dispatch-hub",
        { name: "@repo-prism/dispatch-hub", version: "1.8.1", publish: true },
      ],
      [
        "shared",
        { name: "@repo-prism/shared", version: "1.2.0", publish: true },
      ],
    ]);
    const problems = skippedDepSkewProblems(
      [
        {
          file: "packages/dispatch-hub/dist/statusline.js",
          name: "formatDuration",
          from: "@repo-prism/shared",
        },
      ],
      packagesByFolder,
      () => {
        throw new Error("must not fetch npm for a package this run publishes");
      },
    );
    assert.deepEqual(problems, []);
  });
});
