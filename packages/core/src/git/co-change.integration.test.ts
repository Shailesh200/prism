import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Prism } from "../prism.js";
import { readGitSignals, readGitSignalsAsync } from "./git-signals.js";

let root: string;
const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
const write = (path: string, text: string): void => {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
};
const commitAll = (message: string): void => {
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", message);
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "prism-cochange-"));
  git(root, "init", "-q", "--initial-branch=main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  write("src/price.ts", "export const price = 1;\n");
  write("src/tax.ts", "export const tax = 1;\n");
  write("test/billing.test.ts", "test('x', () => {});\n");
  commitAll("one");
  for (const n of [2, 3]) {
    write("src/price.ts", `export const price = ${n};\n`);
    write("src/tax.ts", `export const tax = ${n};\n`);
    write("test/billing.test.ts", `test('x${n}', () => {});\n`);
    commitAll(`change ${n}`);
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("co-change through the workspace (P7)", () => {
  it("ranks a co-changed file and adds its co-changed test", async () => {
    const ws = Prism.create().openRepository(root);
    if (!ws.ok) throw new Error(ws.error.message);
    const indexed = await ws.value.index();
    expect(indexed.ok).toBe(true);
    const prep = await ws.value.prepareChange({ task: "change the price" });
    if (!prep.ok) throw new Error(prep.error.message);
    const tax = prep.value.pack.files.find((f) => f.path === "src/tax.ts");
    expect(tax?.why).toContain("changed with src/price.ts in 3 commits");
    const ti = await ws.value.testImpact({ kind: "file", id: "src/price.ts" });
    if (!ti.ok) throw new Error(ti.error.message);
    expect(ti.value.tests.map((t) => t.path)).toEqual(["test/billing.test.ts"]);
    expect(ti.value.tests[0]?.reason).toBe(
      "changed together with src/price.ts in 3 commits",
    );
    ws.value.close();
  });

  it("CC-3: a new commit refreshes git signals without a reindex", async () => {
    const ws = Prism.create().openRepository(root);
    if (!ws.ok) throw new Error(ws.error.message);
    expect((await ws.value.index()).ok).toBe(true);
    const before = ws.value.getGitActivity();
    if (!before.ok) throw new Error(before.error.message);
    write("src/price.ts", "export const price = 9;\n");
    commitAll("after index");
    const after = ws.value.getGitActivity();
    if (!after.ok) throw new Error(after.error.message);
    expect(after.value.recentCommits[0]?.message).toBe("after index");
    expect(before.value.recentCommits[0]?.message).toBe("change 3");
    ws.value.close();
  });

  it("CC-4: a shallow clone has no co-change and no error", () => {
    const shallow = mkdtempSync(join(tmpdir(), "prism-shallow-"));
    try {
      execFileSync("git", [
        "clone",
        "-q",
        "--depth",
        "2",
        `file://${root}`,
        shallow,
      ]);
      const signals = readGitSignals(shallow);
      expect(signals).not.toBeNull();
      expect(signals?.coChange).toBeUndefined();
      expect(readGitSignals(root)?.coChange).toBeDefined();
    } finally {
      rmSync(shallow, { recursive: true, force: true });
    }
  });
});

describe("readGitSignalsAsync (token fix 2)", () => {
  it("reads the same signals as the sync reader, off the event loop", async () => {
    const sync = readGitSignals(root);
    let ticks = 0;
    const timer = setInterval(() => (ticks += 1), 1);
    const later = await readGitSignalsAsync(root);
    clearInterval(timer);
    expect(later).not.toBeNull();
    expect(JSON.parse(JSON.stringify(later))).toEqual(
      JSON.parse(JSON.stringify(sync)),
    );
    // The event loop ran while git log did.
    expect(ticks).toBeGreaterThan(0);
  });
});
