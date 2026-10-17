import { describe, expect, it } from "vitest";
import type { TestRunner } from "@repo-prism/shared";
import {
  detectTestRunner,
  testRunPlan,
  typecheckPlan,
  type TestPackage,
} from "./test-runner.js";

describe("detectTestRunner (TI-RUN)", () => {
  it.each([
    ["vitest run", "vitest"],
    ["jest --ci", "jest"],
    ["bun test", "bun"],
    ["node --test test/", "node:test"],
    ["mocha 'test/**/*.js'", "mocha"],
  ] as const)("test script %s → %s", (script, runner) => {
    expect(detectTestRunner({ scripts: { test: script } })).toBe(runner);
  });

  it("prefers the test script over other scripts", () => {
    expect(detectTestRunner({ scripts: { test: "jest", e2e: "vitest" } })).toBe(
      "jest",
    );
  });

  it("reads Vite+ `vp test` as vitest, ahead of a bun side script (round 2)", () => {
    expect(
      detectTestRunner({
        scripts: {
          test: "tsc -p tsconfig.spec.json && vp test --run",
          "test:bun": "bun test runtime-tests/bun",
        },
      }),
    ).toBe("vitest");
  });

  it("falls back to a runner dependency", () => {
    expect(detectTestRunner({ devDependencies: { vitest: "^3" } })).toBe(
      "vitest",
    );
  });

  it("is undefined when unknown (no guessing)", () => {
    expect(detectTestRunner({ scripts: { test: "make check" } })).toBe(
      undefined,
    );
    expect(detectTestRunner(undefined)).toBe(undefined);
  });
});

describe("testRunPlan (plan P10)", () => {
  const root = (runner?: TestRunner): TestPackage => ({
    dir: "",
    ...(runner ? { runner } : {}),
    hasTestScript: true,
  });

  it("TRC-1 vitest: exactly the tests, quoted when odd", () => {
    const { runs } = testRunPlan(
      ["a.test.ts", "b c.test.ts"],
      [root("vitest")],
      "npm",
    );
    expect(runs.map((r) => [r.cwd, r.command])).toEqual([
      [".", "npx vitest run a.test.ts 'b c.test.ts'"],
    ]);
    expect(runs[0]?.argv).toEqual([
      "npx",
      "vitest",
      "run",
      "a.test.ts",
      "b c.test.ts",
    ]);
  });

  it("TRC-2 jest: paths, not patterns", () => {
    const { runs } = testRunPlan(["src/a.test.ts"], [root("jest")], "pnpm");
    expect(runs[0]?.command).toBe(
      "pnpm exec jest --runTestsByPath src/a.test.ts",
    );
  });

  it("TRC-3 bun: path arguments get ./ so bun reads them as files", () => {
    const { runs } = testRunPlan(["src/a.test.ts"], [root("bun")], "bun");
    expect(runs[0]?.command).toBe("bun test ./src/a.test.ts");
  });

  it("TRC-4 monorepo: one command per package, run from its directory", () => {
    const { runs } = testRunPlan(
      [
        "packages/a/src/x.test.ts",
        "packages/b/test/y.test.ts",
        "packages/a/src/z.test.ts",
      ],
      [
        { dir: "", hasTestScript: true },
        { dir: "packages/a", runner: "vitest", hasTestScript: true },
        { dir: "packages/b", runner: "jest", hasTestScript: true },
      ],
      "npm",
    );
    expect(runs.map((r) => [r.cwd, r.command])).toEqual([
      ["packages/a", "npx vitest run src/x.test.ts src/z.test.ts"],
      ["packages/b", "npx jest --runTestsByPath test/y.test.ts"],
    ]);
  });

  it("a hoisted root runner covers packages that declare none", () => {
    const { runs } = testRunPlan(
      ["packages/a/x.test.ts"],
      [root("vitest"), { dir: "packages/a", hasTestScript: false }],
      "npm",
    );
    expect(runs.map((r) => [r.cwd, r.command])).toEqual([
      [".", "npx vitest run packages/a/x.test.ts"],
    ]);
  });

  it("TRC-5 unknown runner: the package's test script, or nothing with the test listed", () => {
    const scripted = testRunPlan(["a.test.ts"], [root()], "npm");
    expect(scripted.runs.map((r) => [r.scope, r.command])).toEqual([
      ["script", "npm run test"],
    ]);
    const none = testRunPlan(
      ["a.test.ts"],
      [{ dir: "", hasTestScript: false }],
      "npm",
    );
    expect(none).toEqual({ runs: [], unrunnable: ["a.test.ts"] });
  });

  it("TRC-6 Yarn (PnP or not) runs the binary through yarn", () => {
    const { runs } = testRunPlan(["a.test.ts"], [root("vitest")], "yarn");
    expect(runs[0]?.command).toBe("yarn vitest run a.test.ts");
    expect(testRunPlan(["a.test.ts"], [root()], "yarn").runs[0]?.command).toBe(
      "yarn test",
    );
  });
});

describe("typecheckPlan (P11 NP-1)", () => {
  const pkg = (dir: string, extra: Partial<TestPackage> = {}): TestPackage => ({
    dir,
    hasTestScript: false,
    ...extra,
  });

  it("prefers the package typecheck script, then its tsconfig", () => {
    const runs = typecheckPlan(
      ["packages/a/src/x.ts", "packages/b/src/y.ts"],
      [
        pkg("packages/a", { hasTypecheckScript: true }),
        pkg("packages/b", { hasTsconfig: true }),
      ],
      "pnpm",
    );
    expect(runs.map((r) => [r.cwd, r.command, r.script])).toEqual([
      ["packages/a", "pnpm run typecheck", true],
      ["packages/b", "pnpm exec tsc --noEmit -p .", false],
    ]);
    expect(runs[0]?.files).toEqual(["packages/a/src/x.ts"]);
  });

  it("falls back to tsc on TS files and node --check per JS file", () => {
    const runs = typecheckPlan(
      ["src/a.ts", "lib/b.mjs", "lib/c.js"],
      [pkg("")],
      "npm",
    );
    expect(runs.map((r) => r.command)).toEqual([
      "npx tsc --noEmit src/a.ts",
      "node --check lib/b.mjs",
      "node --check lib/c.js",
    ]);
  });

  it("uses `yarn typecheck` under Yarn", () => {
    const runs = typecheckPlan(
      ["src/a.ts"],
      [pkg("", { hasTypecheckScript: true })],
      "yarn",
    );
    expect(runs[0]?.command).toBe("yarn typecheck");
    expect(runs[0]?.cwd).toBe(".");
  });
});
