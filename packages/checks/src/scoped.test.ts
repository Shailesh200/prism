import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectTestRunner,
  packageRootFor,
  resolveScopedPlan,
  runCheckSteps,
} from "./scoped.js";
import type { VerifyRunner } from "./verify.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

async function repo(
  pkg: Record<string, unknown>,
  bins: readonly string[] = [],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "prism-scoped-"));
  temps.push(dir);
  await writeFile(join(dir, "package.json"), JSON.stringify(pkg));
  for (const bin of bins) {
    await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
    const path = join(dir, "node_modules", ".bin", bin);
    await writeFile(path, "#!/bin/sh\nexit 0\n");
    await chmod(path, 0o755);
  }
  return dir;
}

describe("detectTestRunner", () => {
  it("uses the installed vitest binary", async () => {
    const dir = await repo(
      { scripts: { test: "vitest run" }, devDependencies: { vitest: "3" } },
      ["vitest"],
    );
    const runner = detectTestRunner(dir);
    expect(runner?.id).toBe("vitest");
    expect(runner?.argv[0]).toBe(join(dir, "node_modules", ".bin", "vitest"));
    expect(runner?.argv[1]).toBe("run");
  });

  it("uses jest when that is the runner", async () => {
    const dir = await repo(
      { scripts: { test: "jest" }, devDependencies: { jest: "29" } },
      ["jest"],
    );
    expect(detectTestRunner(dir)?.id).toBe("jest");
  });

  it("returns null when the runner is declared but not installed", async () => {
    const dir = await repo({
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "3" },
    });
    expect(detectTestRunner(dir)).toBeNull();
  });

  it("recognises bun test from the script", async () => {
    const dir = await repo({ scripts: { test: "bun test" } });
    expect(detectTestRunner(dir)?.argv).toEqual(["bun", "test"]);
  });
});

describe("resolveScopedPlan", () => {
  it("narrows the test step to the affected files", async () => {
    const dir = await repo(
      {
        scripts: { typecheck: "tsc --noEmit", test: "vitest run" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("scoped");
    expect(scoped.plan.steps.map((s) => s.name)).toEqual(["typecheck", "test"]);
    const test = scoped.plan.steps.find((s) => s.name === "test");
    expect(test?.kind === "argv" && test.argv.slice(-1)).toEqual([
      "src/a.test.ts",
    ]);
  });

  it("drops the test step when the change reaches no tests", async () => {
    const dir = await repo({
      scripts: { typecheck: "tsc --noEmit", test: "vitest run" },
    });
    const scoped = await resolveScopedPlan(dir, []);
    expect(scoped.testMode).toBe("none");
    expect(scoped.plan.steps.map((s) => s.name)).toEqual(["typecheck"]);
  });

  it("keeps the repo's own test script when the runner is unknown", async () => {
    const dir = await repo({ scripts: { test: "node test.js" } });
    const scoped = await resolveScopedPlan(dir, ["test/a.test.js"]);
    expect(scoped.testMode).toBe("full-script");
    expect(scoped.plan.steps).toEqual([
      { name: "test", kind: "package-script", script: "test" },
    ]);
  });
});

describe("packageRootFor", () => {
  it("finds the nearest package with check scripts", async () => {
    const root = await repo({ name: "root", private: true });
    await mkdir(join(root, "packages", "lib", "src"), { recursive: true });
    await writeFile(
      join(root, "packages", "lib", "package.json"),
      JSON.stringify({ scripts: { test: "vitest" } }),
    );
    await mkdir(join(root, "packages", "docs"), { recursive: true });
    await writeFile(
      join(root, "packages", "docs", "package.json"),
      JSON.stringify({ scripts: { build: "vite build" } }),
    );
    expect(packageRootFor(root, "packages/lib/src/a.ts")).toBe("packages/lib");
    expect(packageRootFor(root, "packages/docs/index.md")).toBe("");
    expect(packageRootFor(root, "README.md")).toBe("");
  });
});

describe("resolveVerifyPlan never runs a fixer", () => {
  it("skips a lint script that rewrites files", async () => {
    const dir = await repo({
      scripts: { lint: "eslint --fix --max-warnings 0", typecheck: "tsc" },
    });
    const scoped = await resolveScopedPlan(dir, []);
    expect(scoped.plan.steps.map((s) => s.name)).toEqual(["typecheck"]);
  });
});

describe("runCheckSteps", () => {
  it("reports every step instead of stopping at the first failure", async () => {
    const run: VerifyRunner = async (_cwd, step) =>
      step.name === "typecheck"
        ? { ok: false, output: "src/a.ts(1,1): error TS2322: nope" }
        : { ok: true, output: "" };
    let t = 0;
    const results = await runCheckSteps(
      "/repo",
      [
        { name: "typecheck", kind: "package-script", script: "typecheck" },
        { name: "test", kind: "argv", argv: ["vitest", "run"] },
      ],
      run,
      () => (t += 10),
    );
    expect(results.map((r) => [r.name, r.status])).toEqual([
      ["typecheck", "failed"],
      ["test", "passed"],
    ]);
    expect(results[0]?.detail).toMatch(/TS2322/);
    expect(results[0]?.durationMs).toBe(10);
  });

  it("marks a missing binary absent, not failed", async () => {
    const run: VerifyRunner = async () => ({
      ok: false,
      absent: true,
      output: "error: check binary is not available",
    });
    const [result] = await runCheckSteps(
      "/repo",
      [{ name: "lint", kind: "argv", argv: ["oxlint"] }],
      run,
    );
    expect(result?.status).toBe("absent");
  });
});
