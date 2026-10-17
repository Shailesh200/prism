import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, describe, it } from "node:test";
import { entryTargets, missingEntryFiles } from "./publish-entries.mjs";

const dirs = [];
after(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function pkgDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "prism-publish-entries-"));
  dirs.push(dir);
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "");
  }
  return dir;
}

const cli = {
  name: "@repo-prism/cli",
  bin: { prism: "./dist/cli.js" },
  exports: {
    ".": { types: "./dist/index.d.ts", import: "./dist/index.js" },
  },
};

describe("missingEntryFiles", () => {
  it("fails a dist/ that holds only tsconfig.tsbuildinfo", () => {
    const dir = pkgDir(["dist/tsconfig.tsbuildinfo"]);
    assert.deepEqual(missingEntryFiles(dir, cli), [
      "./dist/cli.js",
      "./dist/index.d.ts",
      "./dist/index.js",
    ]);
  });

  it("passes when every main, bin and exports target exists", () => {
    const dir = pkgDir([
      "dist/cli.js",
      "dist/index.d.ts",
      "dist/index.js",
      "dist/tsconfig.tsbuildinfo",
    ]);
    assert.deepEqual(missingEntryFiles(dir, cli), []);
  });

  it("names the one missing subpath export", () => {
    const pkg = {
      main: "./dist/index.js",
      exports: {
        ".": "./dist/index.js",
        "./review": {
          types: "./dist/review.d.ts",
          import: "./dist/review.js",
        },
      },
    };
    const dir = pkgDir(["dist/index.js", "dist/review.d.ts"]);
    assert.deepEqual(missingEntryFiles(dir, pkg), ["./dist/review.js"]);
  });

  it("reads a string bin and a non-dist export (ui's tokens.css)", () => {
    const pkg = {
      bin: "./dist/bin.js",
      exports: { "./tokens.css": "./src/tokens.css" },
    };
    assert.deepEqual(missingEntryFiles(pkgDir(["src/tokens.css"]), pkg), [
      "./dist/bin.js",
    ]);
  });

  it("skips subpath patterns and null exports", () => {
    assert.deepEqual(
      entryTargets({ exports: { "./*": "./dist/*.js", "./x": null } }),
      [],
    );
  });
});
