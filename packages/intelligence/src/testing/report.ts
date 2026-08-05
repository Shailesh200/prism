import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  TestingCoverage,
  TestingReport,
  TestingSuite,
  TestingSuiteKind,
} from "@repo-prism/shared";

export type BuildTestingReportInput = {
  workspaceRoot: string;
  /** Optional pre-listed repo-relative paths (skips FS walk when provided). */
  files?: readonly string[];
};

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".prism",
  "coverage",
  "vendor",
  ".turbo",
]);

/**
 * A test runner we can detect from local signals. `id` is a canonical,
 * lowercase identifier the UI uses to render a tool logo — keep it simple.
 */
type RunnerSpec = {
  id: string;
  /** npm dependency names (dependencies / devDependencies / peer). */
  deps: string[];
  /** Config filenames (basename-matched, so nested packages count too). */
  configs: string[];
  /** Matched against the lowercased `scripts` blob of package.json. */
  scriptRe: RegExp;
};

const RUNNERS: RunnerSpec[] = [
  {
    id: "vitest",
    deps: ["vitest", "@vitest/ui"],
    configs: [
      "vitest.config.ts",
      "vitest.config.mts",
      "vitest.config.js",
      "vitest.config.mjs",
      "vitest.config.cjs",
      "vite.config.ts",
      "vite.config.mts",
      "vite.config.js",
      "vite.config.mjs",
    ],
    scriptRe: /\bvitest\b/,
  },
  {
    id: "jest",
    deps: ["jest", "@jest/core", "ts-jest", "babel-jest"],
    configs: [
      "jest.config.ts",
      "jest.config.js",
      "jest.config.mjs",
      "jest.config.cjs",
      "jest.config.json",
    ],
    scriptRe: /\bjest\b/,
  },
  {
    id: "mocha",
    deps: ["mocha"],
    configs: [
      ".mocharc.js",
      ".mocharc.cjs",
      ".mocharc.json",
      ".mocharc.jsonc",
      ".mocharc.yml",
      ".mocharc.yaml",
    ],
    scriptRe: /\bmocha\b/,
  },
  {
    id: "playwright",
    deps: ["@playwright/test", "playwright"],
    configs: [
      "playwright.config.ts",
      "playwright.config.js",
      "playwright.config.mjs",
      "playwright.config.cjs",
    ],
    scriptRe: /\bplaywright\b/,
  },
  {
    id: "cypress",
    deps: ["cypress"],
    configs: [
      "cypress.config.ts",
      "cypress.config.js",
      "cypress.config.mjs",
      "cypress.json",
    ],
    scriptRe: /\bcypress\b/,
  },
  {
    id: "ava",
    deps: ["ava"],
    configs: ["ava.config.js", "ava.config.cjs", "ava.config.mjs"],
    scriptRe: /\bava\b/,
  },
  {
    id: "jasmine",
    deps: ["jasmine", "jasmine-core"],
    configs: ["jasmine.json", "spec/support/jasmine.json"],
    scriptRe: /\bjasmine\b/,
  },
  {
    id: "node:test",
    deps: [],
    configs: [],
    scriptRe: /node(?:\.js)?\s+--test|node:test|(?:^|\s)--test\b/,
  },
  {
    id: "pytest",
    deps: [],
    configs: ["pytest.ini", "conftest.py"],
    scriptRe: /\bpytest\b/,
  },
  {
    id: "go",
    deps: [],
    configs: ["go.mod"],
    scriptRe: /\bgo\s+test\b/,
  },
  {
    id: "cargo",
    deps: [],
    configs: ["Cargo.toml"],
    scriptRe: /\bcargo\s+test\b/,
  },
];

/**
 * Build a typed TestingReport from local structure + optional coverage artifacts
 * (M-046 / ADR-0022).
 */
export function buildTestingReport(
  input: BuildTestingReportInput,
): TestingReport {
  const files = input.files
    ? [...input.files]
    : listRepoFiles(input.workspaceRoot);
  const runners = detectRunners(input.workspaceRoot, files);
  const suites = detectSuites(files);
  const coverage = parseCoverage(input.workspaceRoot);
  const score = scoreTesting(runners, suites, coverage);
  const summary = summarizeTesting(runners, suites, coverage, score);

  return {
    score,
    runners,
    suites,
    ...(coverage ? { coverage } : {}),
    // Static scan cannot know per-test outcomes; `results` stays empty until an
    // actual test run ingests them. `lastRunAt` is left unset for the same reason.
    results: [],
    summary,
  };
}

/** Re-read coverage artifacts after an external test run. */
export function ingestCoverageFromWorkspace(
  workspaceRoot: string,
  files?: readonly string[],
): TestingReport {
  return buildTestingReport({
    workspaceRoot,
    ...(files === undefined ? {} : { files }),
  });
}

function detectRunners(root: string, files: readonly string[]): string[] {
  const found = new Set<string>();
  const pkg = readPackageJson(root);
  let deps: Record<string, string> = {};
  let scriptBlob = "";

  if (pkg) {
    deps = {
      ...asRecord(pkg.dependencies),
      ...asRecord(pkg.devDependencies),
      ...asRecord(pkg.peerDependencies),
    };
    scriptBlob = Object.values(asRecord(pkg.scripts)).join("\n").toLowerCase();
    // AVA is commonly configured via a top-level "ava" key in package.json.
    if (pkg.ava && typeof pkg.ava === "object") found.add("ava");
  }

  for (const spec of RUNNERS) {
    if (spec.deps.some((k) => k in deps)) found.add(spec.id);
    else if (scriptBlob && spec.scriptRe.test(scriptBlob)) found.add(spec.id);
    else if (hasConfigFile(root, files, spec.configs)) found.add(spec.id);
  }

  // pyproject.toml only implies pytest when it actually references pytest.
  if (!found.has("pytest")) {
    const pyproject = files.find(
      (f) => (f.split("/").pop() ?? f) === "pyproject.toml",
    );
    if (
      (existsSync(join(root, "pyproject.toml")) &&
        fileMentions(root, "pyproject.toml", "pytest")) ||
      (pyproject !== undefined && fileMentions(root, pyproject, "pytest"))
    ) {
      found.add("pytest");
    }
  }

  // Language-native test sources strongly imply their toolchain test runner.
  if (files.some((f) => f.endsWith(".py") && /(^|\/)tests?\//i.test(f))) {
    found.add("pytest");
  }
  if (files.some((f) => f.endsWith("_test.go"))) found.add("go");

  // node:test is frequently used without a config or npm dep — look for an
  // explicit `node:test` import inside test files (bounded to test files).
  if (!found.has("node:test") && importsNodeTest(root, files)) {
    found.add("node:test");
  }

  return [...found].sort((a, b) => a.localeCompare(b));
}

function hasConfigFile(
  root: string,
  files: readonly string[],
  configs: readonly string[],
): boolean {
  for (const c of configs) {
    if (existsSync(join(root, c))) return true;
    if (files.includes(c)) return true;
    const base = c.split("/").pop() ?? c;
    if (files.some((f) => (f.split("/").pop() ?? f) === base)) return true;
  }
  return false;
}

const NODE_TEST_IMPORT =
  /(?:from\s+["']node:test["']|require\(\s*["']node:test["']\s*\))/;

function importsNodeTest(root: string, files: readonly string[]): boolean {
  for (const f of files) {
    if (!isTestFile(f)) continue;
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f)) continue;
    if (NODE_TEST_IMPORT.test(readFileSafe(join(root, f)))) return true;
  }
  return false;
}

function detectSuites(files: readonly string[]): TestingSuite[] {
  const buckets = new Map<
    string,
    { kind: TestingSuiteKind; files: string[] }
  >();

  for (const path of files) {
    if (!isTestFile(path)) continue;
    const kind = classifySuite(path);
    const group = suiteGroupPath(path, kind);
    const key = `${kind}:${group}`;
    const entry = buckets.get(key) ?? { kind, files: [] };
    entry.files.push(path);
    buckets.set(key, entry);
  }

  return [...buckets.entries()]
    .map(([, v]) => ({
      kind: v.kind,
      path: suiteGroupPath(v.files[0]!, v.kind),
      fileCount: v.files.length,
    }))
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        a.path.localeCompare(b.path) ||
        b.fileCount - a.fileCount,
    );
}

function isTestFile(path: string): boolean {
  return (
    /(^|\/)(__tests__|tests?|e2e|spec|integration)\//i.test(path) ||
    /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py)$/i.test(path) ||
    /\.test\.ts$/i.test(path)
  );
}

function classifySuite(path: string): TestingSuiteKind {
  if (/(^|\/)(e2e|cypress|playwright)(\/|$)/i.test(path)) return "e2e";
  if (/(^|\/)(integration|integrations)(\/|$)/i.test(path))
    return "integration";
  if (
    /(^|\/)(__tests__|tests?|unit|spec)(\/|$)/i.test(path) ||
    /\.(test|spec)\./i.test(path)
  ) {
    return "unit";
  }
  return "other";
}

function suiteGroupPath(path: string, kind: TestingSuiteKind): string {
  const parts = path.split("/");
  const markers = new Set([
    "__tests__",
    "test",
    "tests",
    "e2e",
    "spec",
    "integration",
    "integrations",
    "cypress",
    "playwright",
    "unit",
  ]);
  for (let i = 0; i < parts.length; i += 1) {
    if (markers.has(parts[i]!.toLowerCase())) {
      return parts.slice(0, i + 1).join("/");
    }
  }
  // File-level *.test.* — use parent directory
  if (parts.length > 1) return parts.slice(0, -1).join("/");
  return kind;
}

function parseCoverage(root: string): TestingCoverage | undefined {
  const lcovRel = "coverage/lcov.info";
  const jsonRel = "coverage/coverage-final.json";
  const lcovPath = join(root, lcovRel);
  const jsonPath = join(root, jsonRel);

  if (existsSync(lcovPath)) {
    const text = readFileSafe(lcovPath);
    const linePct = parseLcovLinePct(text);
    return {
      present: true,
      ...(linePct === undefined ? {} : { linePct }),
      source: lcovRel,
    };
  }

  if (existsSync(jsonPath)) {
    const text = readFileSafe(jsonPath);
    const linePct = parseIstanbulLinePct(text);
    return {
      present: true,
      ...(linePct === undefined ? {} : { linePct }),
      source: jsonRel,
    };
  }

  return undefined;
}

function parseLcovLinePct(text: string): number | undefined {
  if (!text) return undefined;
  let found = 0;
  let hit = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("LF:")) {
      found += Number(line.slice(3)) || 0;
    } else if (line.startsWith("LH:")) {
      hit += Number(line.slice(3)) || 0;
    }
  }
  if (found === 0) return undefined;
  return Number(((hit / found) * 100).toFixed(1));
}

function parseIstanbulLinePct(text: string): number | undefined {
  if (!text) return undefined;
  try {
    const json = JSON.parse(text) as Record<
      string,
      { s?: Record<string, number> }
    >;
    let found = 0;
    let hit = 0;
    for (const file of Object.values(json)) {
      const statements = file?.s;
      if (!statements) continue;
      for (const count of Object.values(statements)) {
        found += 1;
        if (count > 0) hit += 1;
      }
    }
    if (found === 0) return undefined;
    return Number(((hit / found) * 100).toFixed(1));
  } catch {
    return undefined;
  }
}

function scoreTesting(
  runners: readonly string[],
  suites: readonly TestingSuite[],
  coverage: TestingCoverage | undefined,
): number {
  const kinds = new Set(suites.map((s) => s.kind));
  const diversity = Math.min(60, kinds.size * 20);
  const runnerBonus = Math.min(10, runners.length * 5);
  let coverageScore = 0;
  if (coverage?.present) {
    coverageScore = 15;
    if (coverage.linePct !== undefined) {
      coverageScore += Math.min(15, (coverage.linePct / 100) * 15);
    }
  }
  const fileBonus =
    suites.length === 0
      ? 0
      : Math.min(10, suites.reduce((n, s) => n + s.fileCount, 0) >= 5 ? 10 : 5);
  return Math.round(
    Math.max(
      0,
      Math.min(100, diversity + runnerBonus + coverageScore + fileBonus),
    ),
  );
}

function summarizeTesting(
  runners: readonly string[],
  suites: readonly TestingSuite[],
  coverage: TestingCoverage | undefined,
  score: number,
): string {
  const parts: string[] = [];
  if (runners.length > 0) parts.push(runners.join(", "));
  else parts.push("no runners detected");

  const kinds = [...new Set(suites.map((s) => s.kind))];
  if (kinds.length > 0) parts.push(`suites: ${kinds.join("+")}`);
  else parts.push("no test suites found");

  if (coverage?.present) {
    parts.push(
      coverage.linePct !== undefined
        ? `coverage ${coverage.linePct}% (${coverage.source})`
        : `coverage present (${coverage.source})`,
    );
  } else {
    parts.push("no coverage artifact");
  }

  return `Score ${score}/100 — ${parts.join("; ")}`;
}

function readPackageJson(root: string): Record<string, unknown> | null {
  try {
    return JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function fileMentions(root: string, rel: string, needle: string): boolean {
  try {
    return readFileSync(join(root, rel), "utf8")
      .toLowerCase()
      .includes(needle.toLowerCase());
  } catch {
    return false;
  }
}

function readFileSafe(abs: string): string {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return "";
  }
}

function listRepoFiles(root: string, prefix = ""): string[] {
  const dir = join(root, prefix);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = prefix ? `${prefix}/${name}` : name;
    let st;
    try {
      st = statSync(join(root, rel));
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...listRepoFiles(root, rel));
    else if (st.isFile()) out.push(rel);
  }
  return out;
}
