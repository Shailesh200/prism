import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";
import {
  grepFiles,
  ignoreRules,
  inGitWorkTree,
  walkRepoFiles,
} from "./repo-grep.mjs";

const scripts = dirname(fileURLToPath(import.meta.url));
const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A copy with no .git: the two lint scripts, their inputs and some files. */
function noGitCopy(files) {
  const root = mkdtempSync(join(tmpdir(), "prism-nogit-"));
  temps.push(root);
  mkdirSync(join(root, "scripts"));
  for (const name of [
    "repo-grep.mjs",
    "check-deleted-names.mjs",
    "check-no-published-refs.mjs",
    "deleted-names.json",
  ]) {
    copyFileSync(join(scripts, name), join(root, "scripts", name));
  }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const run = (root, script) =>
  spawnSync(process.execPath, [join(root, "scripts", script)], {
    cwd: root,
    encoding: "utf8",
  });

describe("repo-grep without git (round 4 fresh-copy QA)", () => {
  it("skips .gitignore'd names, suffixes and binaries", () => {
    const root = noGitCopy({
      ".gitignore": "node_modules/\ndist/\n*.log\n.env.*\napps/site/.next/\n",
      "src/a.ts": "hello\n",
      "node_modules/x/index.js": "hello\n",
      "pkg/dist/out.js": "hello\n",
      "debug.log": "hello\n",
      ".env.local": "hello\n",
      "apps/site/.next/page.js": "hello\n",
      "bin.dat": "hel\u0000lo\n",
    });
    assert.equal(inGitWorkTree(root), false);
    const files = walkRepoFiles(root, ignoreRules(root));
    assert.ok(files.includes("src/a.ts"));
    for (const gone of [
      "node_modules/x/index.js",
      "pkg/dist/out.js",
      "debug.log",
      ".env.local",
      "apps/site/.next/page.js",
      "bin.dat",
    ]) {
      assert.ok(!files.includes(gone), gone);
    }
    assert.deepEqual(
      grepFiles(root, ["src/a.ts"], (l) => l === "hello"),
      ["src/a.ts:1:hello"],
    );
  });

  it("deleted-names scans the files, as a whole word, and skips the changelogs", () => {
    const { names } = JSON.parse(
      readFileSync(join(scripts, "deleted-names.json"), "utf8"),
    );
    const name = names[0];
    const clean = noGitCopy({
      "src/a.ts": `const x${name}y = 1;\n`,
      "CHANGELOG.md": `${name} was removed\n`,
    });
    const ok = run(clean, "check-deleted-names.mjs");
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stderr, /not a git checkout/);

    const dirty = noGitCopy({ "src/a.ts": `use(${name});\n` });
    const bad = run(dirty, "check-deleted-names.mjs");
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /^src\/a\.ts:1:/m);
  });

  it("no-published-refs scans its paths only", () => {
    const ref = "npx -y @repo-prism/cli@latest";
    const clean = noGitCopy({ "src/readme.md": `${ref}\n` });
    const ok = run(clean, "check-no-published-refs.mjs");
    assert.equal(ok.status, 0, ok.stderr);

    const dirty = noGitCopy({ "docs/x.md": `${ref}\n` });
    const bad = run(dirty, "check-no-published-refs.mjs");
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /docs\/x\.md:1:/);
  });
});
