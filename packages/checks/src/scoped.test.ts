import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectTestRunner,
  isPlainRunnerScript,
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

  it("runs the whole test script when narrowing would drop a part of it (Hono)", async () => {
    const dir = await repo(
      {
        scripts: { test: "tsc --noEmit && vitest --run" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("full-script");
    expect(scoped.plan.steps).toEqual([
      { name: "test", kind: "package-script", script: "test" },
    ]);
  });

  it("checks the script the plan runs, not only `test`", async () => {
    const dir = await repo(
      {
        scripts: { "test:unit": "vitest run && node check.js" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("full-script");
    expect(scoped.plan.steps).toEqual([
      { name: "test", kind: "package-script", script: "test:unit" },
    ]);
  });
});

describe("resolveScopedPlan: scripts narrowing would change (J-03)", () => {
  for (const test of [
    "vitest --config vitest.other.config.ts",
    "vitest -c x.ts",
    "vitest --project unit",
    "vitest --workspace vitest.workspace.ts",
    "vitest --root packages/a",
    "vitest --dir src",
  ]) {
    it(`runs the whole script for \`${test}\``, async () => {
      const dir = await repo(
        { scripts: { test }, devDependencies: { vitest: "3" } },
        ["vitest"],
      );
      const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
      expect(scoped.testMode).toBe("full-script");
      expect(scoped.plan.steps).toEqual([
        { name: "test", kind: "package-script", script: "test" },
      ]);
    });
  }

  for (const test of [
    "jest --config jest.unit.config.js",
    "jest -c jest.unit.config.js",
    "jest --rootDir packages/a",
    "jest --projects packages/a",
    "jest --selectProjects unit",
  ]) {
    it(`runs the whole script for \`${test}\``, async () => {
      const dir = await repo(
        { scripts: { test }, devDependencies: { jest: "29" } },
        ["jest"],
      );
      const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
      expect(scoped.testMode).toBe("full-script");
      expect(scoped.plan.steps).toEqual([
        { name: "test", kind: "package-script", script: "test" },
      ]);
    });
  }

  it("still narrows `vitest --coverage` (coverage is dropped on purpose)", async () => {
    const dir = await repo(
      {
        scripts: { test: "vitest --coverage" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("scoped");
  });

  // Runs real `npm run test` through sh scripts: POSIX only. npm's cache (and
  // its _logs) go to a temp dir, never the real ~/.npm.
  it.skipIf(process.platform === "win32")(
    "a failing tsc in `tsc --noEmit && vitest --run` fails the test step, never SHIP",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "prism-scoped-chain-"));
      temps.push(dir);
      const npmCache = await mkdtemp(join(tmpdir(), "prism-npm-cache-"));
      temps.push(npmCache);
      await writeFile(
        join(dir, "package.json"),
        JSON.stringify({
          name: "chain",
          scripts: { test: "tsc --noEmit && vitest --run" },
          devDependencies: { vitest: "3", typescript: "5" },
        }),
      );
      await writeFile(join(dir, "package-lock.json"), "{}");
      const bin = join(dir, "node_modules", ".bin");
      await mkdir(bin, { recursive: true });
      const tool = async (name: string, body: string) => {
        await writeFile(join(bin, name), `#!/bin/sh\n${body}\n`);
        await chmod(join(bin, name), 0o755);
      };
      await tool(
        "tsc",
        "echo \"src/a.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\"; exit 2",
      );
      await tool("vitest", "echo 'Test Files  1 passed (1)'; exit 0");

      const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
      expect(scoped.testMode).toBe("full-script");
      const saved = process.env.npm_config_cache;
      process.env.npm_config_cache = npmCache;
      let results: Awaited<ReturnType<typeof runCheckSteps>>;
      try {
        results = await runCheckSteps(dir, scoped.plan.steps);
      } finally {
        if (saved === undefined) delete process.env.npm_config_cache;
        else process.env.npm_config_cache = saved;
      }
      const test = results.find((r) => r.name === "test");
      expect(test?.status).toBe("failed");
      expect(test?.detail).toMatch(/TS2322/);
      expect(results.every((r) => r.status === "passed")).toBe(false);
    },
  );
});

/** Flags off the safe list: each must keep the repo's full script. */
const UNSAFE_FLAG_SCRIPTS = [
  "vitest --typecheck",
  "vitest run --mode staging",
  "vitest --environment jsdom",
  "vitest --setupFiles ./setup.ts",
  "jest --env=jsdom",
  "jest --testEnvironment node",
  "bun test --preload ./setup.ts",
  "vitest '--config' x.ts",
  'vitest "--config=x.ts"',
  "jest --ci", // fails on a missing snapshot; a narrowed run would write it
  "vitest -u",
  "vitest run src/unit", // positional filter
  "vitest watch",
  "vitest run --reporter", // flag with no value
] as const;

describe("resolveScopedPlan: flags off the safe list and pre/post scripts", () => {
  for (const test of UNSAFE_FLAG_SCRIPTS) {
    it(`runs the whole script for \`${test}\``, async () => {
      const runner = test.startsWith("jest")
        ? "jest"
        : test.startsWith("bun")
          ? "bun"
          : "vitest";
      const dir = await repo(
        {
          scripts: { test },
          devDependencies: runner === "bun" ? {} : { [runner]: "3" },
        },
        runner === "bun" ? [] : [runner],
      );
      const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
      expect(scoped.testMode).toBe("full-script");
      expect(scoped.plan.steps).toEqual([
        { name: "test", kind: "package-script", script: "test" },
      ]);
    });
  }

  for (const hook of ["pretest", "posttest"]) {
    it(`runs the whole script when \`${hook}\` exists`, async () => {
      const dir = await repo(
        {
          scripts: { test: "vitest run", [hook]: "node check.js" },
          devDependencies: { vitest: "3" },
        },
        ["vitest"],
      );
      const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
      expect(scoped.testMode).toBe("full-script");
      expect(scoped.plan.steps).toEqual([
        { name: "test", kind: "package-script", script: "test" },
      ]);
    });
  }

  it("checks pre/post of the script the plan runs (`pretest:unit`)", async () => {
    const dir = await repo(
      {
        scripts: { "test:unit": "vitest run", "pretest:unit": "tsc -b" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("full-script");
  });

  it("a pre/post script for another name does not block narrowing", async () => {
    const dir = await repo(
      {
        scripts: { test: "vitest run", prebuild: "node gen.js" },
        devDependencies: { vitest: "3" },
      },
      ["vitest"],
    );
    const scoped = await resolveScopedPlan(dir, ["src/a.test.ts"]);
    expect(scoped.testMode).toBe("scoped");
  });
});

describe("isPlainRunnerScript", () => {
  it("accepts one runner command whose flags are all on the safe list", () => {
    for (const body of [
      "vitest",
      "vitest run",
      "vitest --run",
      "vitest run --coverage",
      "vitest --coverage",
      "vitest --coverage.enabled=true",
      "vitest run --reporter=dot",
      "vitest run --reporter verbose",
      "vitest --silent",
      "vitest run --color",
      "  jest ",
      "jest --coverage",
      "jest --silent --verbose",
      "jest --passWithNoTests --no-color",
      "bun test",
      "bun test --coverage",
    ]) {
      expect(isPlainRunnerScript(body), body).toBe(true);
    }
  });

  it("rejects anything narrowing would cut short", () => {
    for (const body of [
      "tsc --noEmit && vitest --run", // Hono: a step before the runner
      "vitest run; node after.js", // a step after it
      "vitest run || true", // exit code rewritten
      "jest | tee out.txt", // pipe
      "vitest run > out.txt", // redirect
      "vitest $(cat files.txt)", // substitution
      "TZ=UTC vitest run", // env prefix
      "cross-env CI=1 jest", // wrapper
      "node --experimental-vm-modules node_modules/jest/bin/jest.js",
      "npm run build && vitest",
      "mocha",
      "",
    ]) {
      expect(isPlainRunnerScript(body), body).toBe(false);
    }
  });

  it("rejects every chain form, so the whole script runs (J-03)", () => {
    for (const body of [
      "tsc --noEmit && vitest --run", // exactly Hono's script
      "tsc --noEmit || vitest run",
      "tsc --noEmit; vitest run",
      "vitest run | tee out.txt",
      "vitest run & tsc --noEmit",
      "vitest run\ntsc --noEmit",
      "npm-run-all typecheck test:unit",
      "run-s typecheck test:unit",
      "run-p typecheck test:unit",
      'concurrently "tsc --noEmit" "vitest run"',
      "pnpm -r test",
      "npx vitest run",
      "yarn vitest run",
    ]) {
      expect(isPlainRunnerScript(body), body).toBe(false);
    }
  });

  it("rejects a runner that picks its own config, project or root", () => {
    for (const body of [
      "vitest --config vitest.other.config.ts",
      "vitest run --config=vitest.other.config.ts",
      "vitest -c x.ts",
      "vitest run -c=x.ts",
      "vitest --project unit",
      "vitest run --project=unit",
      "vitest --workspace vitest.workspace.ts",
      "vitest --root packages/a",
      "vitest -r packages/a",
      "vitest --dir src",
      "jest --config jest.unit.config.js",
      "jest --config=jest.unit.config.js",
      "jest -c jest.unit.config.js",
      "jest --rootDir packages/a",
      "jest --projects packages/a packages/b",
      "jest --selectProjects unit",
    ]) {
      expect(isPlainRunnerScript(body), body).toBe(false);
    }
  });

  it("rejects any flag that is not on the safe list (Arc, #18)", () => {
    for (const body of UNSAFE_FLAG_SCRIPTS) {
      expect(isPlainRunnerScript(body), body).toBe(false);
    }
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
