import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prism, type PrismWorkspace } from "@repo-prism/core";
import {
  addCustomLens,
  loadLenses,
  readLensStore,
  recordLensReviews,
} from "@repo-prism/shared/lens-store";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import { briefsFor } from "./lenses.js";

const fixtures: Fixture[] = [];
const homes: string[] = [];
const open: PrismWorkspace[] = [];

afterEach(async () => {
  for (const ws of open.splice(0)) ws.close();
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
  await Promise.all(
    homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function indexedRepo(): Promise<{
  fixture: Fixture;
  workspace: PrismWorkspace;
  env: NodeJS.ProcessEnv;
}> {
  const fixture = await createFixture({ name: "m079-lenses" });
  fixtures.push(fixture);
  await fixture.write(
    "package.json",
    JSON.stringify({
      name: "lens-fixture",
      version: "0.0.0",
      devDependencies: { vitest: "3" },
    }),
  );
  await fixture.write(
    "src/money.ts",
    "export function money(n: number): string { return `$${n}`; }\n",
  );
  await fixture.write(
    "src/money.test.ts",
    'import { money } from "./money.js";\nexport const t = money(1);\n',
  );
  await fixture.write(
    "src/lonely.ts",
    "export function lonely(): number { return 1; }\n",
  );
  fixture.commit("initial");
  const home = await mkdtemp(join(tmpdir(), "prism-lenses-home-"));
  homes.push(home);
  const opened = Prism.create().openRepository(fixture.root);
  if (!opened.ok) throw new Error(opened.error.message);
  open.push(opened.value);
  const indexed = await opened.value.index();
  if (!indexed.ok) throw new Error(indexed.error.message);
  return {
    fixture,
    workspace: opened.value,
    env: { ...process.env, PRISM_HOME: home },
  };
}

describe("lens briefs", () => {
  it("picks one lens from the task when none is named", async () => {
    const { workspace, env } = await indexedRepo();
    const plan = await briefsFor(workspace, undefined, "review this PR", env);
    const bugs = await briefsFor(
      workspace,
      undefined,
      "find bugs in money",
      env,
    );
    const fix = await briefsFor(
      workspace,
      undefined,
      "fix the null check in money",
      env,
    );
    expect(plan.ok && plan.value.map((b) => b.lens.id)).toEqual(["architect"]);
    expect(bugs.ok && bugs.value.map((b) => b.lens.id)).toEqual(["qa"]);
    expect(fix.ok && fix.value.map((b) => b.lens.id)).toEqual(["dev"]);
    if (!plan.ok) return;
    expect(plan.value[0]!.instruction).toMatch(/Architect lens/);
  });

  it("gives each lens only its own facts", async () => {
    const { workspace, env } = await indexedRepo();
    const briefs = await briefsFor(
      workspace,
      ["architect", "qa", "dev"],
      "add a cache",
      env,
    );
    expect(briefs.ok).toBe(true);
    if (!briefs.ok) return;
    expect(briefs.value.map((b) => b.lens.id)).toEqual([
      "architect",
      "qa",
      "dev",
    ]);
    for (const brief of briefs.value) {
      for (const fact of brief.facts) expect(fact.lens).toBe(brief.lens.id);
    }
  });

  it("tells QA which changed file no test reaches", async () => {
    const { fixture, workspace, env } = await indexedRepo();
    await fixture.write(
      "src/lonely.ts",
      "export function lonely(): number { return 2; }\n",
    );
    await workspace.index();
    const briefs = await briefsFor(workspace, ["qa"], "change lonely", env);
    expect(briefs.ok).toBe(true);
    if (!briefs.ok) return;
    const evidence = briefs.value[0]!.evidence.join("\n");
    expect(evidence).toMatch(/Changed files \(1\): src\/lonely\.ts/);
    expect(evidence).toMatch(/tests: no test reaches src\/lonely\.ts/);
  });

  it("stores a custom lens and selects it when the task names it", async () => {
    const { workspace, env } = await indexedRepo();
    await loadLenses(workspace, env);
    const views = await addCustomLens(
      workspace.rootPath,
      {
        name: "Security",
        role: "Checks secrets and trust boundaries.",
        focus: "A credential in source is a failure.",
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
    const briefs = await briefsFor(
      workspace,
      undefined,
      "run the Security lens on the diff",
      env,
    );
    expect(briefs.ok).toBe(true);
    if (!briefs.ok) return;
    expect(briefs.value.map((brief) => brief.lens.id)).toEqual(["security"]);
    expect(briefs.value[0]!.lens.checklist).toEqual([
      "No new secret is committed.",
    ]);
    expect(briefs.value[0]!.lens.seededDefault).toBe(false);
    const recorded = await recordLensReviews(
      workspace.rootPath,
      "run the Security lens on the diff",
      briefs.value[0]!.evidence,
      [
        {
          lens: "security",
          verdict: "pass",
          reasoning: "No secret in the fixture.",
        },
      ],
      env,
    );
    expect(recorded).toHaveLength(1);
    const store = await readLensStore(workspace.rootPath, env);
    expect(store.reviews.some((row) => row.lens === "security")).toBe(true);
    expect(store.lenses.some((row) => row.id === "architect")).toBe(true);
  });

  it("says plainly when there is no change to review", async () => {
    const { workspace, env } = await indexedRepo();
    const briefs = await briefsFor(workspace, ["qa"], "nothing", env);
    expect(briefs.ok && briefs.value[0]!.evidence.join("\n")).toMatch(
      /Changed files: none/,
    );
    const views = await loadLenses(workspace, env);
    expect(
      views.find((v) => v.definition.id === "qa")?.facts.length,
    ).toBeGreaterThan(0);
  });
});
