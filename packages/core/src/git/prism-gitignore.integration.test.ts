import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { addPrismToGitignore, checkPrismGitignore } from "./prism-gitignore.js";

/**
 * The sidebar warns when `.prism` is not excluded from git, because otherwise
 * the index cache and the consent record get committed. The distinction that
 * matters is between "not ignored" and "could not tell": only the first should
 * produce a warning.
 */

const made: string[] = [];

async function tempDir(withGit: boolean): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-gitignore-"));
  made.push(dir);
  if (withGit) execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

afterEach(async () => {
  await Promise.all(
    made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("reading the status", () => {
  it("says not ignored for a fresh repository", async () => {
    const status = await checkPrismGitignore(await tempDir(true));
    expect(status.ignored).toBe(false);
  });

  it("says ignored once .gitignore excludes it", async () => {
    const dir = await tempDir(true);
    await writeFile(join(dir, ".gitignore"), ".prism/\n");

    expect((await checkPrismGitignore(dir)).ignored).toBe(true);
  });

  it("recognises the pattern however it was written", async () => {
    for (const pattern of [".prism", "/.prism/", ".prism/**", "**/.prism"]) {
      const dir = await tempDir(true);
      await writeFile(join(dir, ".gitignore"), `${pattern}\n`);
      expect(
        (await checkPrismGitignore(dir)).ignored,
        `pattern ${pattern}`,
      ).toBe(true);
    }
  });

  it("answers 'cannot tell' rather than 'no' when there is no workspace", async () => {
    // A warning shown because no repository is open is a warning about
    // nothing, and it trains people to ignore the real one.
    expect((await checkPrismGitignore(null)).ignored).toBeNull();
  });

  it("still answers from .gitignore in a directory git does not manage", async () => {
    const dir = await tempDir(false);
    await writeFile(join(dir, ".gitignore"), ".prism/\n");

    expect((await checkPrismGitignore(dir)).ignored).toBe(true);
  });
});

describe("adding the entry", () => {
  it("creates .gitignore when there is none", async () => {
    const dir = await tempDir(true);

    const status = await addPrismToGitignore(dir);

    expect(status.ignored).toBe(true);
    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain(
      ".prism/",
    );
  });

  it("labels the entry so it does not look like stray noise in a diff", async () => {
    const dir = await tempDir(true);
    await addPrismToGitignore(dir);

    expect(await readFile(join(dir, ".gitignore"), "utf8")).toContain(
      "# Prism local cache",
    );
  });

  it("does not glue itself onto an unterminated last line", async () => {
    const dir = await tempDir(true);
    await writeFile(join(dir, ".gitignore"), "node_modules");

    await addPrismToGitignore(dir);

    const lines = (await readFile(join(dir, ".gitignore"), "utf8")).split("\n");
    // `node_modules.prism/` would silently stop ignoring node_modules.
    expect(lines).toContain("node_modules");
    expect(lines).toContain(".prism/");
  });

  it("is idempotent", async () => {
    const dir = await tempDir(true);
    await addPrismToGitignore(dir);
    await addPrismToGitignore(dir);

    const occurrences = (await readFile(join(dir, ".gitignore"), "utf8"))
      .split("\n")
      .filter((line) => line.trim() === ".prism/").length;
    expect(occurrences).toBe(1);
  });

  it("leaves existing entries alone", async () => {
    const dir = await tempDir(true);
    await writeFile(join(dir, ".gitignore"), "node_modules/\ndist/\n");

    await addPrismToGitignore(dir);

    const contents = await readFile(join(dir, ".gitignore"), "utf8");
    expect(contents).toContain("node_modules/");
    expect(contents).toContain("dist/");
    expect(contents).toContain(".prism/");
  });

  it("refuses without a workspace instead of writing somewhere arbitrary", async () => {
    expect((await addPrismToGitignore(null)).ignored).toBeNull();
  });
});
