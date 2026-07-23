import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TestingReportSchema } from "@prism/shared";
import { buildTestingReport, ingestCoverageFromWorkspace } from "./report.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function tempRoot(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

function write(root: string, rel: string, body: string): void {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

describe("buildTestingReport (M-046)", () => {
  it("detects vitest + unit suites and scores without coverage", () => {
    const root = tempRoot("prism-test-rpt-");
    write(
      root,
      "package.json",
      JSON.stringify({
        name: "demo",
        devDependencies: { vitest: "3.0.0" },
        scripts: { test: "vitest run" },
      }),
    );
    write(root, "vitest.config.ts", "export default {}");
    write(root, "src/math.ts", "export const add = (a:number,b:number)=>a+b");
    write(root, "src/math.test.ts", "import { expect, it } from 'vitest'");
    write(root, "src/util.test.ts", "import { expect, it } from 'vitest'");

    const report = buildTestingReport({ workspaceRoot: root });
    expect(TestingReportSchema.safeParse(report).success).toBe(true);
    expect(report.runners).toContain("vitest");
    expect(report.suites.some((s) => s.kind === "unit")).toBe(true);
    expect(report.coverage).toBeUndefined();
    expect(report.score).toBeGreaterThan(0);
    expect(report.summary).toMatch(/vitest/i);
    // Static scan can't know per-test outcomes → results defaults to [].
    expect(report.results).toEqual([]);
    expect(report.lastRunAt).toBeUndefined();
  });

  it("detects a broad set of canonical runner ids", () => {
    const root = tempRoot("prism-test-runners-");
    write(
      root,
      "package.json",
      JSON.stringify({
        name: "poly",
        devDependencies: {
          jest: "29.0.0",
          mocha: "10.0.0",
          ava: "6.0.0",
          jasmine: "5.0.0",
          cypress: "13.0.0",
          "@playwright/test": "1.40.0",
        },
        scripts: {
          test: "jest",
          "test:unit": "node --test",
        },
      }),
    );
    // Config-only + language-native signals.
    write(root, "cargo/Cargo.toml", '[package]\nname = "x"\n');
    write(root, "svc/go.mod", "module example.com/x\n");
    write(root, "svc/main_test.go", "package main\n");
    write(root, "tests/test_api.py", "def test_ok():\n    assert True\n");
    write(
      root,
      "src/native.test.mjs",
      "import { test } from 'node:test';\ntest('ok', () => {});\n",
    );

    const report = buildTestingReport({ workspaceRoot: root });
    expect(report.runners).toEqual(
      expect.arrayContaining([
        "ava",
        "cargo",
        "cypress",
        "go",
        "jasmine",
        "jest",
        "mocha",
        "node:test",
        "playwright",
        "pytest",
      ]),
    );
    // ids are canonical + lowercase.
    for (const id of report.runners) {
      expect(id).toBe(id.toLowerCase());
    }
  });

  it("classifies e2e + integration paths and parses lcov coverage", () => {
    const root = tempRoot("prism-test-cov-");
    write(
      root,
      "package.json",
      JSON.stringify({
        name: "demo",
        devDependencies: {
          vitest: "3.0.0",
          "@playwright/test": "1.40.0",
        },
      }),
    );
    write(root, "src/a.test.ts", "// unit");
    write(root, "integration/api.test.ts", "// integration");
    write(root, "e2e/login.spec.ts", "// e2e");
    write(
      root,
      "coverage/lcov.info",
      ["TN:", "SF:src/a.ts", "LF:10", "LH:8", "end_of_record"].join("\n"),
    );

    const report = buildTestingReport({ workspaceRoot: root });
    const kinds = new Set(report.suites.map((s) => s.kind));
    expect(kinds.has("unit")).toBe(true);
    expect(kinds.has("integration")).toBe(true);
    expect(kinds.has("e2e")).toBe(true);
    expect(report.coverage?.present).toBe(true);
    expect(report.coverage?.linePct).toBe(80);
    expect(report.coverage?.source).toBe("coverage/lcov.info");
    expect(report.score).toBeGreaterThanOrEqual(60);
  });

  it("ingestCoverageFromWorkspace re-reads coverage artifacts", () => {
    const root = tempRoot("prism-test-ingest-");
    write(root, "package.json", JSON.stringify({ name: "x" }));
    write(root, "src/a.test.ts", "// t");
    const before = ingestCoverageFromWorkspace(root);
    expect(before.coverage).toBeUndefined();

    write(
      root,
      "coverage/coverage-final.json",
      JSON.stringify({
        "/tmp/a.ts": { s: { "0": 1, "1": 0, "2": 1, "3": 1 } },
      }),
    );
    const after = ingestCoverageFromWorkspace(root);
    expect(after.coverage?.present).toBe(true);
    expect(after.coverage?.source).toBe("coverage/coverage-final.json");
    expect(after.coverage?.linePct).toBe(75);
  });
});
