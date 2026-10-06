import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCustomLens,
  lensIdFromName,
  removeLens,
  updateLens,
  loadLenses,
  overrideLensReview,
  readLensStore,
  recordLensReviews,
  seedLenses,
  type LensSeedSource,
} from "./lens-store.js";
import { ok } from "./result.js";

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

async function setup(): Promise<{
  source: LensSeedSource;
  env: NodeJS.ProcessEnv;
}> {
  const root = await mkdtemp(join(tmpdir(), "prism-lens-repo-"));
  const home = await mkdtemp(join(tmpdir(), "prism-lens-home-"));
  dirs.push(root, home);
  const source: LensSeedSource = {
    rootPath: root,
    getIndex: () =>
      ok({
        files: [
          { path: "packages/core/package.json" },
          { path: "packages/core/src/a.ts" },
          { path: "packages/core/src/a.test.ts" },
          { path: "plans/adr/0001-first.md" },
          { path: "src/generated/types.ts" },
        ],
      }),
    getCycles: () => ok([]),
    getDna: async () =>
      ok({
        packageManager: "bun",
        frameworks: ["react"],
        testRunners: ["vitest"],
        languages: [{ id: "typescript", share: 0.9 }],
      }),
  };
  return { source, env: { PRISM_HOME: home } };
}

describe("lens facts ignore fixtures", () => {
  it("does not report a fixture's cycle, ADRs, or generated files as the repo's", async () => {
    const { source, env } = await setup();
    const withFixtures: LensSeedSource = {
      ...source,
      getIndex: () =>
        ok({
          files: [
            { path: "plans/adr/0001-first.md" },
            { path: "plans/adr/0002-second.md" },
            { path: "packages/x/fixtures/plans/adr/0001-fake.md" },
            { path: "packages/x/fixtures/plans/adr/0002-fake.md" },
            { path: "packages/x/fixtures/plans/adr/0003-fake.md" },
            { path: "packages/x/fixtures/src/generated/types.ts" },
            { path: "src/a.ts" },
          ],
        }),
      getCycles: () =>
        ok([
          ["file:packages/x/fixtures/a.ts", "file:packages/x/fixtures/b.ts"],
          ["file:src/lab-server.ts", "file:src/runner.ts"],
        ]),
    };
    const views = await loadLenses(withFixtures, env);
    const architect = views[0]!.facts.map((f) => f.text).join("\n");
    expect(architect).toMatch(
      /1 import cycle today: lab-server\.ts → runner\.ts → lab-server\.ts\./,
    );
    expect(architect).toMatch(/2 recorded decisions in plans\/adr\./);
    expect(architect).not.toMatch(/fixtures/);
    expect(architect).not.toMatch(/off-limits/);
  });

  it("refreshes seeded facts on every load and keeps history", async () => {
    const { source, env } = await setup();
    await loadLenses(source, env);
    await recordLensReviews(
      source.rootPath,
      "x",
      [],
      [{ lens: "qa", verdict: "pass" }],
      env,
    );
    const changed: LensSeedSource = {
      ...source,
      getCycles: () => ok([["file:src/a.ts", "file:src/b.ts"]]),
    };
    const views = await loadLenses(changed, env);
    expect(views[0]!.facts.map((f) => f.text).join("\n")).toMatch(
      /1 import cycle today/,
    );
    expect(views[1]!.history).toHaveLength(1);
  });
});

describe("lens store", () => {
  it("seeds Architect, QA, and Dev, each with its own cited facts", async () => {
    const { source, env } = await setup();
    const views = await loadLenses(source, env);
    expect(views.map((v) => v.definition.id)).toEqual([
      "architect",
      "qa",
      "dev",
    ]);
    for (const view of views) {
      expect(view.facts.length, view.definition.id).toBeGreaterThan(0);
      for (const fact of view.facts) {
        expect(fact.lens).toBe(view.definition.id);
        expect(fact.source).toBeTruthy();
      }
    }
    const architect = views[0]!.facts.map((f) => f.text).join("\n");
    expect(architect).toMatch(/No import cycles today\./);
    expect(architect).toMatch(/1 recorded decision in plans\/adr\./);
    expect(architect).toMatch(/1 generated or vendor file off-limits\./);
    const offLimit = views[0]!.facts.find((f) => /off-limits/.test(f.text));
    expect(offLimit?.source).toBe("src/generated/types.ts");
    expect(views[1]!.facts.map((f) => f.text).join("\n")).toMatch(/vitest/);
    expect(views[2]!.facts.map((f) => f.text).join("\n")).toMatch(/bun/);
  });

  it("re-seeding replaces seeded facts and keeps learned ones and history", async () => {
    const { source, env } = await setup();
    await seedLenses(source, env);
    const [review] = await recordLensReviews(
      source.rootPath,
      "add cache",
      [],
      [{ lens: "qa", verdict: "fail", reasoning: "no test reaches src/a.ts" }],
      env,
    );
    expect(review).toBeDefined();
    const learned = await overrideLensReview(
      source.rootPath,
      review!.id,
      "a.ts is covered by e2e",
      env,
    );
    expect(learned?.origin).toBe("learned");
    expect(learned?.lens).toBe("qa");

    await seedLenses(source, env);
    const store = await readLensStore(source.rootPath, env);
    expect(store.reviews).toHaveLength(1);
    expect(store.reviews[0]?.override?.note).toBe("a.ts is covered by e2e");
    expect(store.facts.filter((f) => f.origin === "learned")).toHaveLength(1);
    const seededCount = store.facts.filter((f) => f.origin === "seeded").length;
    await seedLenses(source, env);
    expect(
      (await readLensStore(source.rootPath, env)).facts.filter(
        (f) => f.origin === "seeded",
      ),
    ).toHaveLength(seededCount);
  });

  it("drops verdicts for a lens that does not exist", async () => {
    const { source, env } = await setup();
    await seedLenses(source, env);
    const recorded = await recordLensReviews(
      source.rootPath,
      "x",
      [],
      [{ lens: "security", verdict: "pass" }],
      env,
    );
    expect(recorded).toEqual([]);
  });

  it("keeps inherited lenses when a custom lens is added", async () => {
    const { source, env } = await setup();
    await seedLenses(source, env);
    expect(lensIdFromName("Security", new Set(["security"]))).toBe(
      "security-2",
    );
    const views = await addCustomLens(
      source.rootPath,
      {
        name: "Security",
        role: "Checks secrets and auth boundaries.",
        focus: "A new secret in source is a failure.",
        checklist: ["No new secret is committed."],
        evidence: ["off-limits"],
      },
      env,
    );
    expect(views.map((view) => view.definition.id)).toEqual([
      "architect",
      "qa",
      "dev",
      "security",
    ]);
    expect(
      views.find((view) => view.definition.id === "security")?.definition
        .seededDefault,
    ).toBe(false);
    await expect(
      addCustomLens(
        source.rootPath,
        {
          name: "security",
          role: "Again.",
          focus: "Again.",
          checklist: ["One."],
          evidence: ["blast"],
        },
        env,
      ),
    ).rejects.toThrow(/already exists/);
  });

  it("renames a lens in place and refuses to delete an inherited one", async () => {
    const { source, env } = await setup();
    await seedLenses(source, env);
    const renamed = await updateLens(
      source.rootPath,
      "qa",
      {
        name: "Proof",
        role: "Checks proof.",
        focus: "A claim needs a test.",
        checklist: ["A test reaches the change."],
        evidence: ["test-impact"],
      },
      env,
    );
    const proof = renamed.find((view) => view.definition.id === "qa");
    expect(proof?.definition.name).toBe("Proof");
    expect(proof?.definition.seededDefault).toBe(true);
    expect(proof?.facts.length).toBeGreaterThan(0);
    await expect(removeLens(source.rootPath, "qa", env)).rejects.toThrow(
      /Inherited lenses stay/,
    );

    await addCustomLens(
      source.rootPath,
      {
        name: "Security",
        role: "Checks secrets.",
        focus: "A new secret is a failure.",
        checklist: ["No new secret is committed."],
        evidence: ["off-limits"],
      },
      env,
    );
    const left = await removeLens(source.rootPath, "security", env);
    expect(left.map((view) => view.definition.id)).toEqual([
      "architect",
      "qa",
      "dev",
    ]);
  });
});
