import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readChangedPaths } from "./changed-paths.js";

let root: string;

function git(...args: string[]): void {
  execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
}

async function write(path: string, text: string): Promise<void> {
  const full = join(root, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, text, "utf8");
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "prism-changed-"));
  git("init", "--initial-branch=main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  await write("src/a.ts", "export const a = 1;\n");
  git("add", ".");
  git("commit", "-m", "first");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("readChangedPaths", () => {
  it("reports nothing on a clean tree", () => {
    expect(readChangedPaths(root)).toEqual({ base: "working tree", paths: [] });
  });

  it("reports an unstaged edit", async () => {
    await write("src/a.ts", "export const a = 2;\n");
    expect(readChangedPaths(root)?.paths).toEqual(["src/a.ts"]);
  });

  it("reports a staged edit", async () => {
    await write("src/a.ts", "export const a = 2;\n");
    git("add", "src/a.ts");
    expect(readChangedPaths(root)?.paths).toEqual(["src/a.ts"]);
  });

  it("reports a file that is both staged and edited again exactly once", async () => {
    await write("src/a.ts", "export const a = 2;\n");
    git("add", "src/a.ts");
    await write("src/a.ts", "export const a = 3;\n");
    expect(readChangedPaths(root)?.paths).toEqual(["src/a.ts"]);
  });

  it("includes untracked files, because a new file is a change", async () => {
    await write("src/new.ts", "export const b = 1;\n");
    expect(readChangedPaths(root)?.paths).toEqual(["src/new.ts"]);
  });

  it("includes untracked files in untracked directories", async () => {
    // `--untracked-files=all` rather than the default, which would collapse
    // this to the directory `src/deep/` and analyse a path that is not a file.
    await write("src/deep/nested/x.ts", "export const x = 1;\n");
    expect(readChangedPaths(root)?.paths).toEqual(["src/deep/nested/x.ts"]);
  });

  it("reports the destination of a rename, not the path that no longer exists", () => {
    git("mv", "src/a.ts", "src/b.ts");
    expect(readChangedPaths(root)?.paths).toEqual(["src/b.ts"]);
  });

  it("unquotes paths that git escapes", async () => {
    await write("src/with space.ts", "export const s = 1;\n");
    expect(readChangedPaths(root)?.paths).toEqual(["src/with space.ts"]);
  });

  it("diffs against a base revision when given one", async () => {
    await write("src/a.ts", "export const a = 2;\n");
    git("add", ".");
    git("commit", "-m", "second");
    const changed = readChangedPaths(root, { base: "HEAD~1" });
    expect(changed).toEqual({ base: "HEAD~1", paths: ["src/a.ts"] });
  });

  it("returns null outside a git work tree, rather than an empty list", async () => {
    const bare = await mkdtemp(join(tmpdir(), "prism-nogit-"));
    try {
      expect(readChangedPaths(bare)).toBeNull();
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });

  it("returns null for a base that does not exist", () => {
    expect(readChangedPaths(root, { base: "no-such-ref" })).toBeNull();
  });

  describe("a workspace nested inside a larger repository", () => {
    it("reports only what changed inside it, relative to it", async () => {
      // A fixture or a single package opened on its own. Git answers for the
      // whole repository wherever it is invoked, so unscoped output would name
      // files that are not in this workspace at all.
      await write("nested/pkg/a.ts", "export const a = 1;\n");
      await write("outside.ts", "export const o = 1;\n");
      git("add", ".");
      git("commit", "-m", "nested");

      await write("nested/pkg/a.ts", "export const a = 2;\n");
      await write("outside.ts", "export const o = 2;\n");

      const changed = readChangedPaths(join(root, "nested/pkg"));
      expect(changed?.paths).toEqual(["a.ts"]);
    });

    it("reports nothing when the change is elsewhere in the repository", async () => {
      await write("nested/pkg/a.ts", "export const a = 1;\n");
      git("add", ".");
      git("commit", "-m", "nested");

      await write("src/a.ts", "export const a = 9;\n");

      expect(readChangedPaths(join(root, "nested/pkg"))?.paths).toEqual([]);
    });
  });
});
