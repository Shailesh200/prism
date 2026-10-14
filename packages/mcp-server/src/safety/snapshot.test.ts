import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import { spawnSync, execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildHookSnapshot, writeHookSnapshot } from "./snapshot.js";

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "plugin",
  "hooks",
  "prism-hook.mjs",
);

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

  it("SNAP-ID-1 carries the index identity, bumps generation, and the hook honours it", async () => {
    const fixture = await createFixture({ name: "p1-identity" });
    fixtures.push(fixture);
    await fixture.write("src/a.ts", "export const a = 1;\n");
    fixture.commit("initial");
    const home = await mkdtemp(join(tmpdir(), "prism-snap-home-"));
    homes.push(home);
    const env = { ...process.env, PRISM_HOME: home };
    const opened = Prism.create().openRepository(fixture.root);
    if (!opened.ok) throw new Error(opened.error.message);
    open.push(opened.value);
    await opened.value.index();

    const first = await writeHookSnapshot(opened.value, env);
    const second = await writeHookSnapshot(opened.value, env);
    const head = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: fixture.root,
      encoding: "utf8",
    }).trim();
    expect(first).toMatchObject({
      schemaVersion: 2,
      headSha: head,
      generation: 1,
    });
    expect(second?.generation).toBe(2);
    expect(typeof second?.buildId).toBe("string");
    expect(typeof second?.indexedAt).toBe("string");

    const runHook = () =>
      spawnSync(process.execPath, [HOOK, "session"], {
        input: JSON.stringify({ cwd: fixture.root }),
        encoding: "utf8",
        env: { ...env, PRISM_DAEMON: "0" },
      }).stdout;
    expect(JSON.parse(runHook()).hookSpecificOutput?.additionalContext).toMatch(
      /^Prism · /,
    );
    // A new commit makes the snapshot stale; the hook goes quiet.
    await fixture.write("src/b.ts", "export const b = 2;\n");
    fixture.commit("second");
    expect(JSON.parse(runHook())).toEqual({});
  });
});
