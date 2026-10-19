import { createFixture } from "@repo-prism/test-support";
import { describe, expect, it } from "vitest";
import { Prism } from "./prism.js";

const LEAF_COUNT = 18;

describe("workspace guardSession (M-072 Prism Guard)", () => {
  it("ranks the two heavily-imported hub files first and excludes preExistingChanges", async () => {
    const fixture = await createFixture({ name: "m072-guard" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "guard-fixture", version: "0.0.0" }),
      );
      await fixture.write("README.md", "# guard fixture\n");
      fixture.commit("initial");

      // Everything below stays uncommitted — this is the live "session" a
      // fresh index still has to pick up as dirty working-tree content.
      await fixture.write(
        "src/hubA.ts",
        "export function hubA(): number { return 1; }\n",
      );
      await fixture.write(
        "src/hubB.ts",
        "export function hubB(): number { return 2; }\n",
      );
      for (let i = 1; i <= LEAF_COUNT; i += 1) {
        await fixture.write(
          `src/leaf${i}.ts`,
          [
            'import { hubA } from "./hubA.js";',
            'import { hubB } from "./hubB.js";',
            `export function leaf${i}(): number {`,
            "  return hubA() + hubB();",
            "}",
            "",
          ].join("\n"),
        );
      }

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      // Simulate two leaves that were already dirty before a job started.
      const preExistingChanges = ["src/leaf17.ts", "src/leaf18.ts"];
      const result = await workspace.guardSession({ preExistingChanges });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const paths = result.value.files.map((f) => f.path);
      expect(paths).not.toContain("src/leaf17.ts");
      expect(paths).not.toContain("src/leaf18.ts");
      expect(result.value.excludedPreExisting.sort()).toEqual(
        preExistingChanges,
      );
      // 2 hubs + 16 remaining leaves (18 leaves minus the 2 excluded).
      expect(result.value.files).toHaveLength(18);

      const topTwo = result.value.files.slice(0, 2).map((f) => f.path);
      expect(topTwo.sort()).toEqual(["src/hubA.ts", "src/hubB.ts"]);
      expect(result.value.files[0]!.risk).toBeGreaterThan(
        result.value.files.at(-1)!.risk,
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("flags a file that crosses into a different package than the rest of the session", async () => {
    const fixture = await createFixture({ name: "m072-guard-boundary" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "root-fixture", version: "0.0.0" }),
      );
      await fixture.write(
        "packages/alpha/package.json",
        JSON.stringify({ name: "alpha-pkg", version: "0.0.0" }),
      );
      await fixture.write(
        "packages/beta/package.json",
        JSON.stringify({ name: "beta-pkg", version: "0.0.0" }),
      );
      await fixture.write("README.md", "# boundary fixture\n");
      // alpha imports beta, so beta is a boundary other code depends on.
      await fixture.write(
        "packages/beta/src/lib.ts",
        "export const lib = 1;\n",
      );
      await fixture.write(
        "packages/alpha/src/use.ts",
        'import { lib } from "../../beta/src/lib";\nexport const use = lib;\n',
      );
      fixture.commit("initial");

      await fixture.write(
        "packages/alpha/src/one.ts",
        "export function one(): number { return 1; }\n",
      );
      await fixture.write(
        "packages/alpha/src/two.ts",
        "export function two(): number { return 2; }\n",
      );
      await fixture.write(
        "packages/alpha/src/three.ts",
        "export function three(): number { return 3; }\n",
      );
      await fixture.write(
        "packages/beta/src/stray.ts",
        "export function stray(): number { return 4; }\n",
      );

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const workspace = opened.value;
      const indexed = await workspace.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      const result = await workspace.guardSession();
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const strayFile = result.value.files.find(
        (f) => f.path === "packages/beta/src/stray.ts",
      );
      const alphaFile = result.value.files.find(
        (f) => f.path === "packages/alpha/src/one.ts",
      );
      expect(strayFile?.flags.some((f) => f.kind === "boundary")).toBe(true);
      expect(alphaFile?.flags.some((f) => f.kind === "boundary")).toBe(false);
    } finally {
      await fixture.cleanup();
    }
  });

  it("does not flag a leaf package nothing imports, or docs (B3 false alarms)", async () => {
    const fixture = await createFixture({ name: "m072-guard-boundary-leaf" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "root-fixture", version: "0.0.0" }),
      );
      await fixture.write(
        "docs/package.json",
        JSON.stringify({ name: "docs", version: "0.0.0" }),
      );
      await fixture.write(
        "benchmarks/package.json",
        JSON.stringify({ name: "benchmarks", version: "0.0.0" }),
      );
      await fixture.write("src/base.ts", "export const base = 0;\n");
      fixture.commit("initial");

      await fixture.write("src/feature.ts", "export const feature = 1;\n");
      await fixture.write(
        "benchmarks/feature.bench.ts",
        "export const b = 1;\n",
      );
      for (const lang of ["a", "b", "c", "d"]) {
        await fixture.write(`docs/${lang}/feature.md`, "# feature\n");
      }

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const indexed = await opened.value.index();
      expect(indexed.ok).toBe(true);
      const result = await opened.value.guardSession();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      for (const file of result.value.files) {
        expect(file.flags.some((f) => f.kind === "boundary")).toBe(false);
      }
    } finally {
      await fixture.cleanup();
    }
  });

  it("still ranks source files when git also lists node_modules", async () => {
    const fixture = await createFixture({ name: "m072-guard-modules" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "guard-modules", version: "0.0.0" }),
      );
      await fixture.write(
        "src/hub.ts",
        "export function hub(): number { return 1; }\n",
      );
      fixture.commit("initial");
      await fixture.write("src/leaf.ts", 'import { hub } from "./hub.js";\n');

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const indexed = await opened.value.index();
      expect(indexed.ok).toBe(true);
      if (!indexed.ok) return;

      await fixture.write("node_modules/pkg/index.js", "module.exports = 1;\n");
      const result = await opened.value.guardSession();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.files.map((f) => f.path)).toEqual(["src/leaf.ts"]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("flags an export this change left without a return type in a JSR package (round 5, hono 6a0607a9)", async () => {
    const fixture = await createFixture({ name: "r5-slow-type" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "jsr-fixture", version: "0.0.0" }),
      );
      await fixture.write(
        "jsr.json",
        JSON.stringify({ name: "@x/y", exports: "./src/index.ts" }),
      );
      const before = [
        "export const tryDecode = (s: string): string => s;",
        "const tryDecodeURI = (s: string) => tryDecode(s);",
        "export const untyped = (s: string) => s;",
        "",
      ].join("\n");
      await fixture.write("src/url.ts", before);
      await fixture.write("src/index.ts", 'export * from "./url.js";\n');
      fixture.commit("initial");
      // The session: tryDecodeURI is now exported with no return type.
      await fixture.write(
        "src/url.ts",
        before.replace("const tryDecodeURI", "export const tryDecodeURI"),
      );

      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      expect((await opened.value.index()).ok).toBe(true);
      const result = await opened.value.guardSession();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const url = result.value.files.find((f) => f.path === "src/url.ts");
      const slow = url?.flags.filter((f) => f.kind === "slow-type") ?? [];
      // Only the new one: `untyped` was already slow at HEAD.
      expect(slow.map((f) => f.detail)).toEqual([
        'export "tryDecodeURI" has no return type; jsr publish rejects slow types. Write the type.',
      ]);
    } finally {
      await fixture.cleanup();
    }
  });

  it("reviews an explicit change set when the working tree is clean", async () => {
    const fixture = await createFixture({ name: "m072-guard-explicit" });
    try {
      await fixture.write(
        "package.json",
        JSON.stringify({ name: "explicit-fixture", version: "0.0.0" }),
      );
      await fixture.write("src/kept.ts", "export const kept = 1;\n");
      fixture.commit("initial");
      const opened = Prism.create().openRepository(fixture.root);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      expect((await opened.value.index()).ok).toBe(true);
      const clean = await opened.value.guardSession();
      expect(clean.ok && clean.value.files).toEqual([]);
      const named = await opened.value.guardSession({
        changedPaths: ["src/kept.ts"],
      });
      expect(named.ok).toBe(true);
      if (!named.ok) return;
      expect(named.value.files.map((file) => file.path)).toEqual([
        "src/kept.ts",
      ]);
    } finally {
      await fixture.cleanup();
    }
  });
});
