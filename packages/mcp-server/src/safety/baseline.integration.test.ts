import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  baselineRefusal,
  recoverBaseline,
  withBaselineCopy,
} from "./baseline.js";

const fixtures: Fixture[] = [];
const temps: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
  for (const dir of temps.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `prism-m092-${name}-`));
  temps.push(dir);
  return dir;
}

type OldEntry = { path: string; existed: boolean; saved?: string };

/** What a pre-round-3 build left when killed mid-run: a manifest and saved bytes. */
function leaveOldRestore(dir: string, root: string, entries: OldEntry[]): void {
  mkdirSync(dir, { recursive: true });
  entries.forEach((entry, i) => {
    if (entry.saved !== undefined)
      writeFileSync(join(dir, String(i)), entry.saved);
  });
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      root,
      entries: entries.map(({ path, existed }) => ({ path, existed })),
    }),
  );
}

/** Byte-for-byte picture of the live folder (outside .git) and its git status. */
function liveState(root: string): string {
  const files = readdirSync(root, { recursive: true })
    .map(String)
    .filter((rel) => !rel.startsWith(".git") && !rel.startsWith("node_modules"))
    .filter((rel) => lstatSync(join(root, rel)).isFile())
    .sort()
    .map((rel) => `${rel}:${read(root, rel)}`);
  const status = execFileSync("git", ["status", "--porcelain", "-uall"], {
    cwd: root,
    encoding: "utf8",
  });
  return JSON.stringify({ files, status });
}

async function repo(): Promise<Fixture> {
  const fixture = await createFixture({ name: "m092-baseline" });
  fixtures.push(fixture);
  await fixture.write(".gitignore", "node_modules/\n.prism/\n");
  await fixture.write("src/a.ts", "export const a = 1;\n");
  await fixture.write("src/old.ts", "export const old = 1;\n");
  fixture.commit("initial");
  return fixture;
}

const read = (root: string, rel: string) =>
  readFileSync(join(root, rel), "utf8");

describe("withBaselineCopy", () => {
  it("runs on HEAD for session files in a copy, leaving the live folder alone", async () => {
    const fixture = await repo();
    await fixture.write("src/a.ts", "export const a = 2;\n");
    await fixture.write("src/b.ts", "export const b = 1;\n");
    // Changed before the session: the baseline keeps it.
    await fixture.write("src/old.ts", "export const old = 2;\n");
    const seen = await withBaselineCopy(
      fixture.root,
      ["src/a.ts", "src/b.ts"],
      async (copy) => ({
        copy,
        a: read(copy, "src/a.ts"),
        b: existsSync(join(copy, "src/b.ts")),
        old: read(copy, "src/old.ts"),
        liveA: read(fixture.root, "src/a.ts"),
      }),
    );
    expect(seen).toMatchObject({
      a: "export const a = 1;\n",
      b: false,
      old: "export const old = 2;\n",
      liveA: "export const a = 2;\n",
    });
    expect(seen!.copy.startsWith(fixture.root)).toBe(false);
    expect(existsSync(seen!.copy)).toBe(false);
    expect(read(fixture.root, "src/b.ts")).toBe("export const b = 1;\n");
  });

  it("never overwrites an edit made in the live folder while it runs", async () => {
    const fixture = await repo();
    await fixture.write("src/a.ts", "export const a = 2;\n");
    await withBaselineCopy(fixture.root, ["src/a.ts"], async () => {
      writeFileSync(join(fixture.root, "src/a.ts"), "export const a = 3;\n");
      return null;
    });
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 3;\n");
  });

  it("links installed node_modules folders and removes the copy when the callback throws", async () => {
    const fixture = await repo();
    mkdirSync(join(fixture.root, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(fixture.root, "node_modules", "dep", "index.js"), "1");
    await fixture.write("src/a.ts", "export const a = 2;\n");
    let copy = "";
    await expect(
      withBaselineCopy(fixture.root, ["src/a.ts"], async (c) => {
        copy = c;
        expect(lstatSync(join(c, "node_modules")).isSymbolicLink()).toBe(true);
        expect(read(c, "node_modules/dep/index.js")).toBe("1");
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(copy)).toBe(false);
    expect(existsSync(join(fixture.root, "node_modules", "dep"))).toBe(true);
  });

  it("puts back what an older build's interrupted live-folder run left reverted", async () => {
    const fixture = await repo();
    const dir = join(fixture.root, ".prism", "receipts", "baseline-restore");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "0"), "export const a = 9;\n");
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        root: fixture.root,
        entries: [{ path: "src/a.ts", existed: true }],
      }),
    );
    expect(recoverBaseline(fixture.root)).toBe(1);
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 9;\n");
    expect(existsSync(dir)).toBe(false);
  });

  it("finds an interrupted run under the pre-2.0 workspace key (a symlinked path)", async () => {
    const fixture = await repo();
    const home = tempDir("home");
    const env = { ...process.env, PRISM_HOME: home };
    // The repository opened through a symlink: before 2.0 the key hashed
    // the path as given; 2.0 resolves symlinks, so the key differs.
    const link = join(tempDir("link"), "repo");
    symlinkSync(fixture.root, link, "dir");
    const oldKey = createHash("sha256")
      .update(resolve(link))
      .digest("hex")
      .slice(0, 24);
    const dir = join(
      home,
      "workspaces",
      oldKey,
      "receipts",
      "baseline-restore",
    );
    leaveOldRestore(dir, link, [
      { path: "src/a.ts", existed: true, saved: "export const a = 9;\n" },
    ]);
    expect(recoverBaseline(link, env)).toBe(1);
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 9;\n");
    expect(existsSync(dir)).toBe(false);
  });

  it("never overwrites or deletes a file changed after the interrupted run", async () => {
    const fixture = await repo();
    const dir = join(fixture.root, ".prism", "receipts", "baseline-restore");
    leaveOldRestore(dir, fixture.root, [
      { path: "src/a.ts", existed: true, saved: "export const a = 9;\n" },
      // HEAD lacks it; the old run would have removed a file it created.
      { path: "src/new.ts", existed: false },
      // Still exactly as the old run left it: put back.
      { path: "src/old.ts", existed: true, saved: "export const old = 7;\n" },
    ]);
    // Edited after the interrupted run, by the user or the agent.
    await fixture.write("src/a.ts", "export const a = 5;\n");
    await fixture.write("src/new.ts", "export const mine = 1;\n");
    expect(recoverBaseline(fixture.root)).toBe(1);
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 5;\n");
    expect(read(fixture.root, "src/new.ts")).toBe("export const mine = 1;\n");
    expect(read(fixture.root, "src/old.ts")).toBe("export const old = 7;\n");
    // The saved bytes are kept aside, and the next run does not retry.
    expect(existsSync(dir)).toBe(false);
    const kept = readdirSync(dirname(dir)).filter((n) =>
      n.startsWith("baseline-restore-kept-"),
    );
    expect(kept).toHaveLength(1);
    expect(read(join(dirname(dir), kept[0]!), "0")).toBe(
      "export const a = 9;\n",
    );
    expect(recoverBaseline(fixture.root)).toBe(0);
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 5;\n");
  });

  it("sets aside an unreadable manifest and still takes the baseline", async () => {
    const fixture = await repo();
    const dir = join(fixture.root, ".prism", "receipts", "baseline-restore");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), '{"root":');
    await fixture.write("src/a.ts", "export const a = 2;\n");
    const seen = await withBaselineCopy(fixture.root, ["src/a.ts"], async (c) =>
      read(c, "src/a.ts"),
    );
    expect(seen).toBe("export const a = 1;\n");
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 2;\n");
    expect(existsSync(dir)).toBe(false);
  });

  it("finishes an older build's interrupted restore before it takes a baseline", async () => {
    const fixture = await repo();
    const dir = join(fixture.root, ".prism", "receipts", "baseline-restore");
    // Killed mid-run: src/a.ts is still reverted to HEAD in the live folder.
    leaveOldRestore(dir, fixture.root, [
      { path: "src/a.ts", existed: true, saved: "export const a = 9;\n" },
    ]);
    const seen = await withBaselineCopy(fixture.root, ["src/a.ts"], async (c) =>
      read(c, "src/a.ts"),
    );
    expect(seen).toBe("export const a = 1;\n");
    expect(read(fixture.root, "src/a.ts")).toBe("export const a = 9;\n");
    expect(existsSync(dir)).toBe(false);
  });

  it("leaves the live folder byte for byte as it was if a run is cut off at any point", async () => {
    const fixture = await repo();
    mkdirSync(join(fixture.root, "node_modules", "dep"), { recursive: true });
    writeFileSync(join(fixture.root, "node_modules", "dep", "index.js"), "1");
    await fixture.write("src/a.ts", "export const a = 2;\n");
    await fixture.write("src/b.ts", "export const b = 1;\n");
    await fixture.write("src/old.ts", "export const old = 2;\n");
    const before = liveState(fixture.root);
    // A kill or timeout can only land while the check runs in the copy:
    // at that moment the live folder must already be untouched, with no
    // restore state to depend on.
    await expect(
      withBaselineCopy(fixture.root, ["src/a.ts", "src/b.ts"], async (c) => {
        writeFileSync(join(c, "src/a.ts"), "scribbled by the check");
        expect(liveState(fixture.root)).toBe(before);
        expect(existsSync(join(fixture.root, ".prism"))).toBe(false);
        throw new Error("timed out");
      }),
    ).rejects.toThrow("timed out");
    expect(liveState(fixture.root)).toBe(before);
    // And the next run is clean.
    const again = await withBaselineCopy(
      fixture.root,
      ["src/a.ts"],
      async (c) => read(c, "src/a.ts"),
    );
    expect(again).toBe("export const a = 1;\n");
    expect(liveState(fixture.root)).toBe(before);
  });

  it("refuses paths outside the workspace and Yarn Plug'n'Play", async () => {
    const fixture = await repo();
    expect(baselineRefusal(fixture.root, ["../etc/passwd"])).toMatch(/outside/);
    expect(
      await withBaselineCopy(fixture.root, ["../x"], async () => "ran"),
    ).toBeNull();
    await fixture.write(".pnp.cjs", "");
    expect(baselineRefusal(fixture.root, ["src/a.ts"])).toMatch(/Plug'n'Play/);
  });
});
