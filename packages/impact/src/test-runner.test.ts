import { describe, expect, it } from "vitest";
import { detectTestRunner, runCommandFor } from "./test-runner.js";

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

describe("runCommandFor", () => {
  it("lists exactly the given tests and quotes odd paths", () => {
    expect(runCommandFor("vitest", ["a.test.ts", "b c.test.ts"])).toBe(
      "npx vitest run a.test.ts 'b c.test.ts'",
    );
    expect(runCommandFor("node:test", ["t.test.mjs"])).toBe(
      "node --test t.test.mjs",
    );
  });
  it("is undefined with no tests", () => {
    expect(runCommandFor("jest", [])).toBe(undefined);
  });
});
