import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import { buildHookSnapshot } from "./snapshot.js";

const fixtures: Fixture[] = [];
const homes: string[] = [];
const open: PrismWorkspace[] = [];

afterEach(async () => {
  for (const ws of open.splice(0)) ws.close();
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
  await Promise.all(
    homes.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("hook snapshot", () => {
  it("orients on the real repo and ignores fixture test data", async () => {
    const fixture = await createFixture({ name: "m079-snapshot" });
    fixtures.push(fixture);
    await fixture.write(
      "package.json",
      JSON.stringify({
        name: "snap",
        private: true,
        devDependencies: { vitest: "3" },
      }),
    );
    await fixture.write(
      "packages/lib/package.json",
      JSON.stringify({ name: "lib", scripts: { test: "vitest run" } }),
    );
    await fixture.write("packages/lib/src/a.ts", "export const a = 1;\n");
    await fixture.write(
      "packages/lib/src/generated/schema.ts",
      "export const schema = {};\n",
    );
    await fixture.write(
      "packages/lib/fixtures/demo/src/generated/types.ts",
      "export type T = 1;\n",
    );
    await fixture.write(
      "packages/lib/fixtures/demo/package.json",
      JSON.stringify({ name: "demo-fixture" }),
    );
    fixture.commit("initial");
    const home = await mkdtemp(join(tmpdir(), "prism-snap-home-"));
    homes.push(home);
    const opened = Prism.create().openRepository(fixture.root);
    if (!opened.ok) throw new Error(opened.error.message);
    open.push(opened.value);
    await opened.value.index();

    const snap = await buildHookSnapshot(opened.value, {
      ...process.env,
      PRISM_HOME: home,
    });
    expect(snap).not.toBeNull();
    if (!snap) return;
    expect(snap.offLimits.map((r) => r.path)).toEqual([
      "packages/lib/src/generated/schema.ts",
    ]);
    expect(snap.orientation).toMatch(/^Prism · /);
    expect(snap.orientation).toMatch(/Packages: packages\/lib\./);
    expect(snap.orientation).not.toMatch(
      /fixtures|demo-fixture|Repository DNA/,
    );
    expect(snap.orientation).toMatch(
      /Prism warns before you edit 1 generated or vendor path\./,
    );
  });
});
