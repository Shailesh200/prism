import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  baselineRefusal,
  liveTreeDependency,
  recoverBaseline,
  withBaselineCopy,
} from "./baseline.js";

const fixtures: Fixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});

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

/** `node_modules/<at>` as a symlink to `target` (relative, as installers write it). */
function link(root: string, at: string, target: string): void {
  mkdirSync(join(root, at, ".."), { recursive: true });
  symlinkSync(target, join(root, at), "dir");
}

describe("J-02: a dependency linked into the live tree refuses the baseline", () => {
  async function workspace(): Promise<Fixture> {
    const fixture = await repo();
    await fixture.write("packages/b/package.json", '{"name":"@m/b"}');
    await fixture.write("packages/b/src/b.ts", "export const b = 1;\n");
    // Installed packages that stay inside node_modules are fine.
    await fixture.write(
      "node_modules/.pnpm/lodash@4.17.21/node_modules/lodash/package.json",
      '{"name":"lodash"}',
    );
    link(
      fixture.root,
      "node_modules/lodash",
      ".pnpm/lodash@4.17.21/node_modules/lodash",
    );
    return fixture;
  }

  it("a plain pnpm repo keeps its baseline: links into node_modules/.pnpm are fine", async () => {
    const fixture = await workspace();
    expect(liveTreeDependency(fixture.root)).toBeNull();
    expect(baselineRefusal(fixture.root, ["src/a.ts"])).toBeNull();
    expect(
      await withBaselineCopy(fixture.root, ["src/a.ts"], async () => "ran"),
    ).toBe("ran");
  });

  const cases: [string, string, string][] = [
    ["a workspace symlink", "node_modules/b", "../packages/b"],
    ["a scoped workspace symlink", "node_modules/@m/b", "../../packages/b"],
    [
      "a pnpm .pnpm link",
      "node_modules/.pnpm/node_modules/@m/b",
      "../../../../packages/b",
    ],
    [
      "a pnpm store package's link",
      "node_modules/.pnpm/x@1.0.0/node_modules/@m/b",
      "../../../../../packages/b",
    ],
    ["a nested node_modules", "packages/a/node_modules/@m/b", "../../../b"],
  ];
  for (const [name, at, target] of cases) {
    it(`refuses ${name}`, async () => {
      const fixture = await workspace();
      link(fixture.root, at, target);
      expect(liveTreeDependency(fixture.root)).toBe(at);
      expect(baselineRefusal(fixture.root, ["src/a.ts"])).toBe(
        `${at} links into the live tree`,
      );
      expect(
        await withBaselineCopy(fixture.root, ["src/a.ts"], async () => "ran"),
      ).toBeNull();
    });
  }
});
