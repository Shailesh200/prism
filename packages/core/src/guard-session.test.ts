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
});
