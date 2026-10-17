import { existsSync, mkdirSync, readFileSync, symlinkSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prism } from "@repo-prism/core";
import type { VerifyRunner, VerifyStep } from "@repo-prism/checks";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildChangeReceipt,
  buildStructuralReceipt,
  folderExistedAtHead,
  packagesWithoutDependencies,
  receiptFeedback,
  receiptVerdict,
  renderReceipt,
} from "./receipt.js";

const fixtures: Fixture[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.cleanup()));
});

async function repo(): Promise<Fixture> {
  const fixture = await createFixture({ name: "m079-receipt" });
  fixtures.push(fixture);
  await fixture.write(
    "package.json",
    JSON.stringify({
      name: "receipt-fixture",
      version: "0.0.0",
      scripts: { typecheck: "tsc --noEmit", test: "node run-tests.js" },
    }),
  );
  await fixture.write(
    "src/money.ts",
    "export function formatMoney(n: number): string { return `$${n}`; }\n",
  );
  await fixture.write(
    "src/money.test.ts",
    'import { formatMoney } from "./money.js";\nexport const t = formatMoney(1);\n',
  );
  await fixture.write(
    "src/lonely.ts",
    "export function lonely(): number { return 1; }\n",
  );
  fixture.commit("initial");
  return fixture;
}

async function open(root: string) {
  const opened = Prism.create().openRepository(root);
  if (!opened.ok) throw new Error(opened.error.message);
  return opened.value;
}

function recordingRunner(fail: (step: VerifyStep) => string | null): {
  run: VerifyRunner;
  steps: VerifyStep[];
} {
  const steps: VerifyStep[] = [];
  return {
    steps,
    run: async (_cwd, step) => {
      steps.push(step);
      const failure = fail(step);
      return failure
        ? { ok: false, output: failure }
        : { ok: true, output: "" };
    },
  };
}

/**
 * A runner that sees the tree it runs in (the live folder, or the baseline's
 * throwaway copy), the way a real test run would.
 */
function treeRunner(
  _root: string,
  fail: (step: VerifyStep, money: string, cwd: string) => string | null,
): { run: VerifyRunner; steps: VerifyStep[] } {
  const steps: VerifyStep[] = [];
  return {
    steps,
    run: async (cwd, step) => {
      steps.push(step);
      const path = join(cwd, "src", "money.ts");
      const money = existsSync(path) ? readFileSync(path, "utf8") : "";
      const failure = fail(step, money, cwd);
      return failure
        ? { ok: false, output: failure }
        : { ok: true, output: "" };
    },
  };
}

describe("buildChangeReceipt", () => {
  it("is proven with nothing to show when nothing changed", async () => {
    const fixture = await repo();
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, { runChecks: false });
    expect(receipt.ok && receipt.value.verdict).toBe("proven");
    expect(receipt.ok && renderReceipt(receipt.value)).toBe(
      "Prism · nothing changed",
    );
  });

  it("runs the repo's own checks and reports a failing test back to the agent", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run, steps } = treeRunner(fixture.root, (step, money) =>
      step.name === "test" && money.includes("USD")
        ? "FAIL src/money.test.ts: expected $1"
        : null,
    );
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;

    expect(receipt.value.verdict).toBe("failed");
    expect(receipt.value.touched.files).toEqual(["src/money.ts"]);
    expect(receipt.value.testFiles).toEqual(["src/money.test.ts"]);
    // The second test run is the baseline, with the session's edit put back.
    expect(steps.map((s) => s.name)).toEqual(["typecheck", "test", "test"]);
    expect(
      receipt.value.checks.map((c) => [c.name, c.status, c.cause]),
    ).toEqual([
      ["typecheck", "passed", undefined],
      ["test", "failed", "caused"],
    ]);

    const feedback = receiptFeedback(receipt.value);
    expect(feedback).toMatch(/test: FAIL src\/money\.test\.ts/);
    const text = renderReceipt(receipt.value);
    expect(text).toMatch(/^Prism · NO-SHIP \(1 check failed\)/);
    expect(text).toMatch(/Failed\s+test ✗/);
  });

  it("does not block on a test that was already failing before the session", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = treeRunner(fixture.root, (step) =>
      step.name === "test"
        ? " FAIL  src/money.test.ts > formats\n      Tests  1 failed (1)"
        : null,
    );
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.checks.find((c) => c.name === "test")?.cause).toBe(
      "already-failing",
    );
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("already_failing");
    expect(receipt.value.notProven).toEqual([
      { path: "src/money.ts", reason: "its tests were already failing" },
    ]);
    expect(receiptFeedback(receipt.value)).toBeNull();
    expect(renderReceipt(receipt.value)).toMatch(/Already failing\s+test/);
  });

  it("a different failure at the baseline is NOT PROVEN (can't tell if new), never NO-SHIP", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = treeRunner(fixture.root, (step, money) => {
      if (step.name !== "test") return null;
      const lines = [" FAIL  src/old.test.ts > broken"];
      if (money.includes("USD"))
        lines.push(" FAIL  src/money.test.ts > formats");
      return lines.join("\n");
    });
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    // It failed at the baseline too, differently: only a pass there proves
    // the change caused it (Arc), so Prism can't tell.
    expect(receipt.value.checks.find((c) => c.name === "test")?.cause).toBe(
      "unknown",
    );
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("baseline_unknown");
    expect(receiptFeedback(receipt.value)).toBeNull();
    const text = renderReceipt(receipt.value);
    expect(text.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (can't tell if this failure is new)",
    );
    expect(text).not.toMatch(/NO-SHIP|caused|fixing/i);
  });

  it("an already-failing test reads NOT PROVEN (tests already failing)", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = treeRunner(fixture.root, (step) =>
      step.name === "test" ? " FAIL  src/money.test.ts > formats" : null,
    );
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    const text = renderReceipt(receipt.value);
    expect(text.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (tests already failing)",
    );
    expect(text).not.toMatch(/NO-SHIP|caused|fixing/i);
  });

  it("no baseline (turned off): a failure is NOT PROVEN (can't tell if new), never NO-SHIP", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = treeRunner(fixture.root, (step) =>
      step.name === "test" ? " FAIL  src/money.test.ts > formats" : null,
    );
    const receipt = await buildChangeReceipt(workspace, {
      run,
      baseline: false,
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.checks.find((c) => c.name === "test")?.cause).toBe(
      "unknown",
    );
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("baseline_unknown");
  });

  it("a baseline run that times out: NOT PROVEN (can't tell if new), never NO-SHIP", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, {
      run: async (cwd, step) => {
        if (step.name !== "test") return { ok: true, output: "" };
        // The live run fails; the baseline copy's run times out.
        return cwd === fixture.root
          ? { ok: false, output: " FAIL  src/money.test.ts > formats" }
          : { ok: false, timedOut: true, output: "timed out after 60000ms" };
      },
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.checks.find((c) => c.name === "test")?.cause).toBe(
      "unknown",
    );
    expect(receipt.value.reason).toBe("baseline_unknown");
    expect(renderReceipt(receipt.value)).not.toMatch(/NO-SHIP|caused|fixing/i);
  });

  it("J-09: a change no test reaches is NOT PROVEN (no tests reach this change), never SHIP", async () => {
    const fixture = await repo();
    await fixture.write("src/settings.json", '{"currency":"USD"}\n');
    fixture.commit("settings");
    await fixture.write("src/settings.json", '{"currency":"EUR"}\n');
    const workspace = await open(fixture.root);
    const { run } = recordingRunner(() => null);
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.verdict).not.toBe("proven");
    const text = renderReceipt(receipt.value);
    expect(text).not.toMatch(/Prism · SHIP/);
    expect(text.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (no tests reach this change)",
    );
  });

  it("J-02 mono-downstream: a break in workspace package B, called from A, is never 'already failing'", async () => {
    const fixture = await createFixture({ name: "receipt-mono" });
    fixtures.push(fixture);
    await fixture.write(".gitignore", "node_modules/\n");
    await fixture.write(
      "package.json",
      JSON.stringify({ name: "mono", private: true, version: "0.0.0" }),
    );
    await fixture.write("pnpm-workspace.yaml", "packages:\n  - packages/*\n");
    await fixture.write("pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
    await fixture.write(
      "packages/b/package.json",
      JSON.stringify({ name: "@m/b", version: "0.0.0", main: "src/b.ts" }),
    );
    await fixture.write(
      "packages/b/src/b.ts",
      "export function total(xs: number[]): number { return xs.reduce((a, x) => a + x, 0); }\n",
    );
    await fixture.write(
      "packages/a/package.json",
      JSON.stringify({
        name: "@m/a",
        version: "0.0.0",
        scripts: { test: "vitest run" },
        dependencies: { "@m/b": "workspace:*" },
      }),
    );
    await fixture.write(
      "packages/a/src/sum.ts",
      'import { total } from "@m/b";\nexport const sum = (xs: number[]) => total(xs);\n',
    );
    await fixture.write(
      "packages/a/src/sum.test.ts",
      'import { sum } from "./sum";\nimport { total } from "@m/b";\nexport const t = [sum([1]), total([1])];\n',
    );
    fixture.commit("initial");
    // pnpm links the workspace package into A's node_modules.
    mkdirSync(join(fixture.root, "packages/a/node_modules/@m"), {
      recursive: true,
    });
    symlinkSync(
      "../../../b",
      join(fixture.root, "packages/a/node_modules/@m/b"),
      "dir",
    );
    // The session breaks B.
    await fixture.write(
      "packages/b/src/b.ts",
      "export function total(xs: number[]): number { return xs.length; }\n",
    );
    const workspace = await open(fixture.root);
    const steps: string[] = [];
    // A's tests load B through node_modules, as Node would.
    const run: VerifyRunner = async (cwd, step) => {
      steps.push(step.name);
      if (step.name !== "test") return { ok: true, output: "" };
      const b = join(cwd, "node_modules/@m/b/src/b.ts");
      const broken =
        existsSync(b) && readFileSync(b, "utf8").includes("length");
      return broken
        ? { ok: false, output: " FAIL  src/sum.test.ts > sums" }
        : { ok: true, output: "" };
    };
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.testFiles).toContain("packages/a/src/sum.test.ts");
    const test = receipt.value.checks.find((c) => c.name.endsWith("test"));
    expect(test).toMatchObject({ status: "failed", cause: "unknown" });
    // The baseline was refused: it would have loaded the live, broken B.
    expect(steps.filter((s) => s === "test")).toHaveLength(1);
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("baseline_unknown");
    const text = renderReceipt(receipt.value);
    expect(text.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (can't tell if this failure is new)",
    );
    expect(text).not.toMatch(/already failing|SHIP —|Prism · SHIP/i);
  });

  it("es-toolkit regression: Yarn PnP refuses the baseline, so a lint failure is NOT PROVEN (can't tell if new)", async () => {
    const fixture = await createFixture({ name: "receipt-pnp" });
    fixtures.push(fixture);
    await fixture.write(
      "package.json",
      JSON.stringify({
        name: "es-toolkit-like",
        version: "0.0.0",
        packageManager: "yarn@4.9.1",
        scripts: { lint: "eslint .", test: "vitest run" },
        devDependencies: { eslint: "9", vitest: "3" },
      }),
    );
    await fixture.write(".yarnrc.yml", "nodeLinker: pnp\n");
    await fixture.write(".pnp.cjs", "// Yarn Plug'n'Play map\n");
    await fixture.write("yarn.lock", "");
    await fixture.write(
      "src/array/chunk.ts",
      "export function chunk<T>(xs: T[]): T[][] { return [xs]; }\n",
    );
    await fixture.write(
      "src/array/chunk.spec.ts",
      'import { chunk } from "./chunk";\nexport const t = chunk([1]);\n',
    );
    fixture.commit("initial");
    await fixture.write(
      "src/array/chunk.ts",
      "export function chunk<T>(xs: T[], n = 1): T[][] { return [xs.slice(0, n)]; }\n",
    );
    const workspace = await open(fixture.root);
    const { run, steps } = recordingRunner((step) =>
      step.name === "lint"
        ? "  ╭─[src/compat/old.ts:3:4] error: no-unused-vars"
        : null,
    );
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    // No baseline run: PnP can't be used from a copy.
    expect(steps.filter((s) => s.name === "lint")).toHaveLength(1);
    expect(receipt.value.checks.find((c) => c.name === "lint")).toMatchObject({
      status: "failed",
      cause: "unknown",
    });
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("baseline_unknown");
    expect(receiptFeedback(receipt.value)).toBeNull();
    const text = renderReceipt(receipt.value);
    expect(text.split("\n")[0]).toBe(
      "Prism · NOT PROVEN (can't tell if this failure is new)",
    );
    expect(text).not.toMatch(/NO-SHIP|caused|fixing/i);
  });

  it("runs the baseline in a copy and leaves the working tree as it was", async () => {
    const fixture = await repo();
    const edited =
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n";
    await fixture.write("src/money.ts", edited);
    await fixture.write("src/new-helper.ts", "export const fresh = 1;\n");
    const workspace = await open(fixture.root);
    const seenDuringBaseline: string[] = [];
    const { run } = treeRunner(fixture.root, (step, money, cwd) => {
      if (step.name !== "test") return null;
      if (!money.includes("USD")) {
        seenDuringBaseline.push(
          existsSync(join(cwd, "src", "new-helper.ts"))
            ? "helper present"
            : "helper absent",
          cwd === fixture.root ? "live folder" : "copy",
          readFileSync(join(fixture.root, "src", "money.ts"), "utf8") === edited
            ? "live untouched"
            : "live reverted",
        );
        return null;
      }
      return "FAIL src/money.test.ts";
    });
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok && receipt.value.verdict).toBe("failed");
    expect(seenDuringBaseline).toEqual([
      "helper absent",
      "copy",
      "live untouched",
    ]);
    expect(readFileSync(join(fixture.root, "src", "money.ts"), "utf8")).toBe(
      edited,
    );
    expect(
      readFileSync(join(fixture.root, "src", "new-helper.ts"), "utf8"),
    ).toBe("export const fresh = 1;\n");
  });

  it("leaves out files that were already changed when the session began", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/lonely.ts",
      "export function lonely(): number { return 3; }\n",
    );
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = recordingRunner(() => null);
    const receipt = await buildChangeReceipt(workspace, {
      run,
      preExistingChanges: ["src/lonely.ts"],
      sessionId: "s-1",
    });
    expect(receipt.ok && receipt.value.touched.files).toEqual(["src/money.ts"]);
    expect(receipt.ok && receipt.value.verdict).toBe("proven");
    expect(receipt.ok && receipt.value.sessionId).toBe("s-1");
  });

  it("says not proven when a changed source file has no test reaching it", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/lonely.ts",
      "export function lonely(): number { return 2; }\n",
    );
    const workspace = await open(fixture.root);
    const { run, steps } = recordingRunner(() => null);
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;

    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("untested");
    expect(receipt.value.testMode).toBe("none");
    expect(steps.map((s) => s.name)).toEqual(["typecheck"]);
    expect(receipt.value.notProven).toEqual([
      { path: "src/lonely.ts", reason: "no test reaches it" },
    ]);
    expect(receiptFeedback(receipt.value)).toBeNull();
    expect(renderReceipt(receipt.value)).toMatch(
      /Not proven\s+src\/lonely\.ts — no test reaches it/,
    );
  });

  it("is proven when every changed file is reached by a passing test", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `$${n}.00`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run } = recordingRunner(() => null);
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok && receipt.value.verdict).toBe("proven");
  });

  it("runs each package's own checks in a monorepo", async () => {
    const fixture = await createFixture({ name: "m079-receipt-mono" });
    fixtures.push(fixture);
    await fixture.write(
      "package.json",
      JSON.stringify({
        name: "mono",
        private: true,
        workspaces: ["packages/*"],
      }),
    );
    await fixture.write(
      "packages/lib/package.json",
      JSON.stringify({ name: "lib", scripts: { test: "node t.js" } }),
    );
    await fixture.write(
      "packages/lib/src/sum.ts",
      "export function sum(a: number, b: number): number { return a + b; }\n",
    );
    await fixture.write(
      "packages/lib/src/sum.test.ts",
      'import { sum } from "./sum.js";\nexport const t = sum(1, 2);\n',
    );
    fixture.commit("initial");
    await fixture.write(
      "packages/lib/src/sum.ts",
      "export function sum(a: number, b: number): number { return a - b; }\n",
    );
    const workspace = await open(fixture.root);
    const seen: { cwd: string; step: VerifyStep }[] = [];
    const receipt = await buildChangeReceipt(workspace, {
      run: async (cwd, step) => {
        seen.push({ cwd, step });
        return { ok: true, output: "" };
      },
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(seen.map((s) => s.cwd.endsWith("packages/lib"))).toEqual([true]);
    expect(receipt.value.checks.map((c) => c.name)).toEqual([
      "packages/lib: test",
    ]);
    expect(receipt.value.verdict).toBe("proven");
  });

  it("can analyse without running anything", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `€${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run, steps } = recordingRunner(() => null);
    const receipt = await buildChangeReceipt(workspace, {
      run,
      runChecks: false,
    });
    expect(steps).toHaveLength(0);
    expect(receipt.ok && receipt.value.testMode).toBe("skipped");
    expect(receipt.ok && receipt.value.verdict).toBe("not_proven");
    expect(receipt.ok && receipt.value.reason).toBe("skipped_offline");
    expect(receipt.ok && renderReceipt(receipt.value)).toMatch(
      /checks not run/,
    );
  });

  it("lists every changed file: untracked, unindexed and deleted ones too (website round)", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `€${n}`; }\n",
    );
    await fixture.write("src/fresh.ts", "export const fresh = 1;\n");
    await fixture.write("src/site.css", "body { color: red; }\n");
    await fixture.write("notes.md", "# notes\n");
    await rm(join(fixture.root, "src", "lonely.ts"));
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, { runChecks: false });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect([...receipt.value.touched.files].sort()).toEqual([
      "notes.md",
      "src/fresh.ts",
      "src/lonely.ts",
      "src/money.ts",
      "src/site.css",
    ]);
    expect(receipt.value.touched.totalFiles).toBe(5);
    expect(receipt.value.touched.truncated).toBe(false);
  });

  it("RE-2: says no_node_modules at once when dependencies are not installed", async () => {
    const fixture = await repo();
    await fixture.write(
      "package.json",
      JSON.stringify({
        name: "receipt-fixture",
        scripts: { test: "vitest run" },
        devDependencies: { vitest: "^3.0.0" },
      }),
    );
    fixture.commit("deps");
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `£${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const { run, steps } = recordingRunner(() => null);
    const structural = await buildStructuralReceipt(workspace, { run });
    expect(structural.ok).toBe(true);
    if (!structural.ok) return;
    expect(structural.value.plan).toBeNull();
    expect(structural.value.receipt.verdict).toBe("not_proven");
    expect(structural.value.receipt.reason).toBe("no_node_modules");
    expect(steps).toHaveLength(0);
  });

  it("RE-4: a check that runs past its limit reads timeout, never a hang", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/money.ts",
      "export function formatMoney(n: number): string { return `¥${n}`; }\n",
    );
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, {
      run: async (_cwd, step) =>
        step.name === "test"
          ? { ok: false, timedOut: true, output: "timed out after 60000ms" }
          : { ok: true, output: "" },
      baseline: false,
    });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.checks.find((c) => c.name === "test")?.status).toBe(
      "timeout",
    );
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("timeout");
  });

  it("RE-6: lists an unsupported-language file and says unsupported_language", async () => {
    const fixture = await repo();
    await fixture.write("scripts/tool.py", "print('hi')\n");
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, { runChecks: false });
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.unsupported).toEqual(["scripts/tool.py"]);
    expect(receipt.value.verdict).toBe("not_proven");
    expect(receipt.value.reason).toBe("unsupported_language");
    expect(renderReceipt(receipt.value)).toMatch(
      /Not analysed\s+scripts\/tool\.py/,
    );
  });

  it("RE-3: the same session and the same diff give the same id; an edit changes it", async () => {
    const fixture = await repo();
    await fixture.write(
      "src/lonely.ts",
      "export function lonely(): number { return 5; }\n",
    );
    const workspace = await open(fixture.root);
    const a = await buildStructuralReceipt(workspace, { sessionId: "s-9" });
    const b = await buildStructuralReceipt(workspace, { sessionId: "s-9" });
    const other = await buildStructuralReceipt(workspace, { sessionId: "s-8" });
    expect(a.ok && b.ok && a.value.receipt.id).toBe(
      b.ok ? b.value.receipt.id : "",
    );
    expect(other.ok && other.value.receipt.id).not.toBe(
      a.ok ? a.value.receipt.id : "",
    );
    await fixture.write(
      "src/lonely.ts",
      "export function lonely(): number { return 6; }\n",
    );
    const c = await buildStructuralReceipt(workspace, { sessionId: "s-9" });
    expect(c.ok && c.value.receipt.diffHash).not.toBe(
      a.ok ? a.value.receipt.diffHash : "",
    );
  });
});

describe("receiptVerdict", () => {
  const base = {
    checks: [],
    checksState: "done" as const,
    testMode: "scoped" as const,
    supportedChanged: 1,
    unsupported: 0,
    selectedTests: 1,
    sourcesWithoutTests: 0,
    missingDependencies: false,
  };
  const passed = {
    name: "test",
    status: "passed" as const,
    detail: "",
    durationMs: 1,
  };

  it("never answers without a verdict, and names a reason for every not_proven", () => {
    const cases = [
      [{ ...base, checks: [passed] }, "proven", undefined],
      [
        {
          ...base,
          checks: [
            { ...passed, status: "failed" as const, cause: "caused" as const },
          ],
        },
        "failed",
        undefined,
      ],
      [
        { ...base, checksState: "pending" as const },
        "not_proven",
        "still_running",
      ],
      [{ ...base, missingDependencies: true }, "not_proven", "no_node_modules"],
      [
        { ...base, checksState: "skipped" as const },
        "not_proven",
        "skipped_offline",
      ],
      [{ ...base, checks: [] }, "not_proven", "unknown_runner"],
      [
        { ...base, selectedTests: 0, sourcesWithoutTests: 1 },
        "not_proven",
        "untested",
      ],
      [
        { ...base, supportedChanged: 0, unsupported: 2, selectedTests: 0 },
        "not_proven",
        "unsupported_language",
      ],
      [{ ...base, selectedTests: 0, supportedChanged: 0 }, "proven", undefined],
      [
        {
          ...base,
          checks: [
            passed,
            { ...passed, status: "failed" as const, cause: "unknown" as const },
          ],
        },
        "not_proven",
        "baseline_unknown",
      ],
      [
        {
          ...base,
          checks: [
            {
              ...passed,
              status: "failed" as const,
              cause: "already-failing" as const,
            },
          ],
        },
        "not_proven",
        "already_failing",
      ],
      // J-09: a change no test ran on is never proven (SHIP).
      [
        { ...base, selectedTests: 0, sourcesWithoutTests: 0, checks: [] },
        "not_proven",
        "untested",
      ],
      [
        {
          ...base,
          selectedTests: 0,
          checks: [{ ...passed, name: "typecheck" }],
        },
        "not_proven",
        "untested",
      ],
      // A caused failure beside an unknown one is still NO-SHIP.
      [
        {
          ...base,
          checks: [
            { ...passed, status: "failed" as const, cause: "unknown" as const },
            { ...passed, status: "failed" as const, cause: "caused" as const },
          ],
        },
        "failed",
        undefined,
      ],
    ] as const;
    for (const [input, verdict, reason] of cases) {
      const out = receiptVerdict(input);
      expect([out.verdict, out.reason]).toEqual([verdict, reason]);
    }
  });
});

describe("packagesWithoutDependencies", () => {
  it("treats a Yarn Plug'n'Play map as installed dependencies", async () => {
    const root = await mkdtemp(join(tmpdir(), "prism-pnp-"));
    await writeFile(
      join(root, "package.json"),
      JSON.stringify({ name: "x", devDependencies: { vitest: "1" } }),
    );
    expect(packagesWithoutDependencies(root, ["src/a.ts"])).toEqual([""]);
    await writeFile(join(root, ".pnp.cjs"), "");
    expect(packagesWithoutDependencies(root, ["src/a.ts"])).toEqual([]);
    await rm(root, { recursive: true, force: true });
  });
});

describe("folderExistedAtHead (B3 high-blast false alarm)", () => {
  it("is false for a config in a folder this change adds, true otherwise", async () => {
    const fixture = await createFixture({ name: "receipt-new-folder" });
    try {
      await fixture.write("package.json", JSON.stringify({ name: "root" }));
      await fixture.write("src/a.ts", "export const a = 1;\n");
      fixture.commit("initial");
      await fixture.write(
        "benchmarks/fetch/package.json",
        JSON.stringify({ name: "bench" }),
      );
      expect(
        folderExistedAtHead(fixture.root, "benchmarks/fetch/package.json"),
      ).toBe(false);
      expect(folderExistedAtHead(fixture.root, "src/tsconfig.json")).toBe(true);
      expect(folderExistedAtHead(fixture.root, "package.json")).toBe(true);
    } finally {
      await fixture.cleanup();
    }
  });
});
