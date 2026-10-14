import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  baselineRefusal,
  recoverBaseline,
  withBaselineTree,
} from "./baseline.js";

const fixtures: Fixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});

async function repo(): Promise<Fixture> {
  const fixture = await createFixture({ name: "m092-baseline" });
  fixtures.push(fixture);
  await fixture.write("src/a.ts", "export const a = 1;\n");
  fixture.commit("initial");
  return fixture;
}

describe("withBaselineTree", () => {
  it("shows HEAD during the callback and the session's bytes after", async () => {
    const fixture = await repo();
    await fixture.write("src/a.ts", "export const a = 2;\n");
    await fixture.write("src/b.ts", "export const b = 1;\n");
    const seen = await withBaselineTree(
      fixture.root,
      ["src/a.ts", "src/b.ts"],
      async () => ({
        a: readFileSync(join(fixture.root, "src/a.ts"), "utf8"),
        b: existsSync(join(fixture.root, "src/b.ts")),
      }),
    );
    expect(seen).toEqual({ a: "export const a = 1;\n", b: false });
    expect(readFileSync(join(fixture.root, "src/a.ts"), "utf8")).toBe(
      "export const a = 2;\n",
    );
    expect(readFileSync(join(fixture.root, "src/b.ts"), "utf8")).toBe(
      "export const b = 1;\n",
    );
  });

  it("restores even when the callback throws", async () => {
    const fixture = await repo();
    await fixture.write("src/a.ts", "export const a = 3;\n");
    await expect(
      withBaselineTree(fixture.root, ["src/a.ts"], async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(readFileSync(join(fixture.root, "src/a.ts"), "utf8")).toBe(
      "export const a = 3;\n",
    );
  });

  it("finishes a restore a killed run left behind", async () => {
    const fixture = await repo();
    await fixture.write("src/a.ts", "export const a = 4;\n");
    let leftBehind = false;
    await withBaselineTree(fixture.root, ["src/a.ts"], async () => {
      // Simulate a crash: copy the manifest aside before the finally runs.
      const dir = join(fixture.root, ".prism", "receipts", "baseline-restore");
      leftBehind = existsSync(join(dir, "manifest.json"));
      return null;
    });
    expect(leftBehind).toBe(true);
    expect(recoverBaseline(fixture.root)).toBe(0);
  });

  it("refuses paths outside the workspace", async () => {
    const fixture = await repo();
    expect(baselineRefusal(fixture.root, ["../etc/passwd"])).toMatch(/outside/);
    expect(
      await withBaselineTree(fixture.root, ["../x"], async () => "ran"),
    ).toBeNull();
  });
});
