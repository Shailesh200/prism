import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Prism } from "@repo-prism/core";
import type { VerifyRunner, VerifyStep } from "@repo-prism/checks";
import { createFixture, type Fixture } from "@repo-prism/test-support";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildChangeReceipt,
  receiptFeedback,
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

/** A runner that sees the working tree, the way a real test run would. */
function treeRunner(
  root: string,
  fail: (step: VerifyStep, money: string) => string | null,
): { run: VerifyRunner; steps: VerifyStep[] } {
  const steps: VerifyStep[] = [];
  return {
    steps,
    run: async (_cwd, step) => {
      steps.push(step);
      const path = join(root, "src", "money.ts");
      const money = existsSync(path) ? readFileSync(path, "utf8") : "";
      const failure = fail(step, money);
      return failure
        ? { ok: false, output: failure }
        : { ok: true, output: "" };
    },
  };
}

describe("buildChangeReceipt", () => {
  it("is clean when nothing changed", async () => {
    const fixture = await repo();
    const workspace = await open(fixture.root);
    const receipt = await buildChangeReceipt(workspace, { runChecks: false });
    expect(receipt.ok && receipt.value.verdict).toBe("clean");
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
    expect(text).toMatch(/^Prism · failed \(1 check\)/);
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
    expect(receipt.value.verdict).toBe("unproven");
    expect(receipt.value.notProven).toEqual([
      { path: "src/money.ts", reason: "its tests were already failing" },
    ]);
    expect(receiptFeedback(receipt.value)).toBeNull();
    expect(renderReceipt(receipt.value)).toMatch(/Already failing\s+test/);
  });

  it("blocks when the session breaks a second test next to one already failing", async () => {
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
    expect(receipt.ok && receipt.value.verdict).toBe("failed");
    expect(
      receipt.ok && receipt.value.checks.find((c) => c.name === "test")?.cause,
    ).toBe("caused");
  });

  it("restores the working tree byte for byte after the baseline run", async () => {
    const fixture = await repo();
    const edited =
      "export function formatMoney(n: number): string { return `USD ${n}`; }\n";
    await fixture.write("src/money.ts", edited);
    await fixture.write("src/new-helper.ts", "export const fresh = 1;\n");
    const workspace = await open(fixture.root);
    const seenDuringBaseline: string[] = [];
    const { run } = treeRunner(fixture.root, (step, money) => {
      if (step.name !== "test") return null;
      if (!money.includes("USD")) {
        seenDuringBaseline.push(
          existsSync(join(fixture.root, "src", "new-helper.ts"))
            ? "helper present"
            : "helper absent",
        );
        return null;
      }
      return "FAIL src/money.test.ts";
    });
    const receipt = await buildChangeReceipt(workspace, { run });
    expect(receipt.ok && receipt.value.verdict).toBe("failed");
    expect(seenDuringBaseline).toEqual(["helper absent"]);
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

    expect(receipt.value.verdict).toBe("unproven");
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
    expect(receipt.ok && renderReceipt(receipt.value)).toMatch(
      /checks not run/,
    );
  });
});
