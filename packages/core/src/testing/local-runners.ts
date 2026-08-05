/**
 * Local workspace test list/run helpers (M-046).
 * Reached through `PrismWorkspace.runWorkspaceTests` /
 * `listWorkspaceTests` — prefer package.json test, then vitest/jest. A
 * missing runner is detected by exit code *and* by npx's stderr, which does
 * not use a distinct code (M-052).
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TestingTestResult, TestingTestStatus } from "@repo-prism/shared";

export type LocalRunTestsOptions = {
  readonly coverage?: boolean;
  readonly path?: string;
  readonly testNamePattern?: string;
};

export type LocalTestListResult = {
  readonly files: readonly {
    readonly path: string;
    readonly tests: readonly {
      readonly name: string;
      readonly fullName?: string;
    }[];
  }[];
};

type CommandResult = {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
};

function runCommand(
  cmd: string,
  args: readonly string[],
  cwd: string,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      [...args],
      {
        cwd,
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
        env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
      },
      (error, stdout, stderr) => {
        const out = typeof stdout === "string" ? stdout : String(stdout ?? "");
        const err = typeof stderr === "string" ? stderr : String(stderr ?? "");
        if (error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          resolve({ code: -1, stdout: out, stderr: err || "ENOENT" });
          return;
        }
        const code =
          error && typeof (error as { code?: unknown }).code === "number"
            ? (error as { code: number }).code
            : error
              ? 1
              : 0;
        resolve({ code, stdout: out, stderr: err });
      },
    );
  });
}

function detectPackageManager(root: string): { cmd: string; args: string[] } {
  if (
    existsSync(join(root, "bun.lock")) ||
    existsSync(join(root, "bun.lockb"))
  ) {
    return { cmd: "bun", args: ["run", "test"] };
  }
  if (existsSync(join(root, "pnpm-lock.yaml"))) {
    return { cmd: "pnpm", args: ["test"] };
  }
  if (existsSync(join(root, "yarn.lock"))) {
    return { cmd: "yarn", args: ["test"] };
  }
  return { cmd: "npm", args: ["test", "--"] };
}

function hasPackageTestScript(root: string): boolean {
  try {
    const raw = readFileSync(join(root, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, unknown> };
    const test = pkg.scripts?.test;
    return typeof test === "string" && test.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * npx does not use a distinct exit code when the package it was asked to run
 * is not installed — with `--no-install` it exits 1 and explains itself on
 * stderr. Treating that as "the runner ran and the tests failed" is how a
 * repository with no test runner ended up showing a failing test (M-052).
 */
const MISSING_RUNNER_STDERR =
  /(npx canceled due to missing packages|could not determine executable to run|command not found|is not recognized as an internal or external command)/i;

function isMissingRunner(result: CommandResult): boolean {
  if (result.code === -1 || result.code === 127) return true;
  return MISSING_RUNNER_STDERR.test(result.stderr);
}

function relPath(absOrRel: string, root: string): string {
  let file = absOrRel;
  if (file.startsWith(root)) {
    file = file.slice(root.length).replace(/^[\\/]/, "");
  }
  return file.replace(/\\/g, "/");
}

function mapJestStatus(status: string | undefined): TestingTestStatus {
  switch (status) {
    case "passed":
      return "passing";
    case "failed":
      return "failing";
    case "pending":
    case "todo":
    case "skipped":
    case "disabled":
      return "skipped";
    default:
      return "unknown";
  }
}

function extractTestResultsJson(raw: string): unknown | null {
  const marker = '"testResults"';
  const markerIdx = raw.indexOf(marker);
  if (markerIdx < 0) {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  let start = markerIdx;
  while (start > 0 && raw[start] !== "{") start -= 1;
  for (
    let end = raw.lastIndexOf("}");
    end > start;
    end = raw.lastIndexOf("}", end - 1)
  ) {
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (
        parsed &&
        typeof parsed === "object" &&
        Array.isArray((parsed as { testResults?: unknown }).testResults)
      ) {
        return parsed;
      }
    } catch {
      // try tighter end
    }
  }
  return null;
}

function parseJestLikeResults(raw: string, root: string): TestingTestResult[] {
  const parsed = extractTestResultsJson(raw);
  if (!parsed || typeof parsed !== "object") return [];
  const testResults = (parsed as { testResults?: unknown }).testResults;
  if (!Array.isArray(testResults)) return [];

  const results: TestingTestResult[] = [];
  let idx = 0;
  for (const fileEntry of testResults) {
    if (!fileEntry || typeof fileEntry !== "object") continue;
    const entry = fileEntry as {
      name?: string;
      assertionResults?: Array<{
        fullName?: string;
        title?: string;
        status?: string;
        duration?: number;
        ancestorTitles?: string[];
      }>;
    };
    const file = relPath(entry.name ?? "unknown", root);
    for (const assertion of entry.assertionResults ?? []) {
      const name =
        assertion.fullName?.trim() || assertion.title?.trim() || `test-${idx}`;
      const suite = assertion.ancestorTitles?.filter(Boolean).join(" › ");
      results.push({
        id: `${file}:${idx}:${name}`,
        name,
        file,
        status: mapJestStatus(assertion.status),
        ...(suite ? { suite } : {}),
        ...(typeof assertion.duration === "number"
          ? { durationMs: assertion.duration }
          : {}),
      });
      idx += 1;
    }
  }
  return results;
}

function parseCommandResults(
  cmdResult: CommandResult,
  root: string,
): TestingTestResult[] {
  const fromOut = parseJestLikeResults(cmdResult.stdout, root);
  if (fromOut.length > 0) return fromOut;
  return parseJestLikeResults(cmdResult.stderr, root);
}

function summaryResult(
  status: TestingTestStatus,
  detail: string,
): TestingTestResult[] {
  return [
    {
      id: "summary",
      name: detail,
      file: ".",
      status,
    },
  ];
}

function appendFilterArgs(
  args: string[],
  kind: "vitest" | "jest",
  options: LocalRunTestsOptions,
): string[] {
  const out = [...args];
  if (options.path) out.push(options.path);
  if (options.testNamePattern) {
    if (kind === "vitest") out.push("-t", options.testNamePattern);
    else out.push("--testNamePattern", options.testNamePattern);
  }
  return out;
}

export type LocalRunTestsResult = {
  readonly results: TestingTestResult[];
  readonly ran: boolean;
};

/**
 * Run workspace tests. Prefer package.json `scripts.test`, then vitest/jest.
 * When PM yields no JSON but vitest/jest is preferred, fall through.
 */
export async function runLocalWorkspaceTests(
  root: string,
  runners: readonly string[],
  options: LocalRunTestsOptions = {},
): Promise<LocalRunTestsResult> {
  const coverage = options.coverage === true;
  const hasFilters = Boolean(options.path || options.testNamePattern);
  const prefersVitest = runners.includes("vitest");
  const prefersJest = runners.includes("jest");

  let results: TestingTestResult[] = [];
  let ran = false;
  let cmdResult: CommandResult | null = null;

  const tryPackageManager = async (): Promise<CommandResult | null> => {
    if (!hasPackageTestScript(root)) return null;
    const pm = detectPackageManager(root);
    const extra: string[] = [];
    if (prefersVitest || (!prefersJest && runners.length === 0)) {
      extra.push("--reporter=json");
    } else if (prefersJest) {
      extra.push("--json");
    } else {
      extra.push("--reporter=json");
    }
    if (coverage) extra.push("--coverage");
    if (options.path) extra.push(options.path);
    if (options.testNamePattern) extra.push("-t", options.testNamePattern);
    const args = [...pm.args];
    if (!args.includes("--")) args.push("--");
    args.push(...extra);
    const result = await runCommand(pm.cmd, args, root);
    if (isMissingRunner(result)) return null;
    return result;
  };

  const tryRunner = async (
    kind: "vitest" | "jest",
  ): Promise<CommandResult | null> => {
    const baseArgs =
      kind === "vitest"
        ? [
            "--no-install",
            "vitest",
            "run",
            "--reporter=json",
            ...(coverage ? ["--coverage"] : []),
          ]
        : [
            "--no-install",
            "jest",
            "--json",
            ...(coverage ? ["--coverage"] : []),
          ];
    const args = appendFilterArgs(baseArgs, kind, options);
    const result = await runCommand("npx", args, root);
    if (isMissingRunner(result)) return null;
    return result;
  };

  if (!hasFilters) {
    cmdResult = await tryPackageManager();
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      if (results.length > 0 || (!prefersVitest && !prefersJest)) {
        ran = true;
      }
    }
  }

  if (!ran && (prefersVitest || (!prefersJest && runners.length === 0))) {
    cmdResult = await tryRunner("vitest");
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }
  if (!ran && (prefersJest || runners.length === 0)) {
    cmdResult = await tryRunner("jest");
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }

  if (!ran && hasFilters) {
    cmdResult = await tryPackageManager();
    if (cmdResult) {
      results = parseCommandResults(cmdResult, root);
      ran = true;
    }
  }
  if (!ran && cmdResult) {
    results = parseCommandResults(cmdResult, root);
    ran = true;
  }

  if (!ran) return { results: [], ran: false };

  if (results.length === 0 && cmdResult) {
    results = summaryResult(
      cmdResult.code === 0 ? "passing" : "failing",
      cmdResult.code === 0
        ? "Tests finished with no parseable results."
        : `Tests failed (exit ${cmdResult.code}) with no parseable results.`,
    );
  }

  return { results, ran: true };
}

function parseVitestListJson(raw: string, root: string): LocalTestListResult {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) return { files: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return { files: [] };
  }
  if (!Array.isArray(parsed)) return { files: [] };

  type TestListItem = LocalTestListResult["files"][number]["tests"][number];
  const byFile = new Map<string, TestListItem[]>();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { name?: string; file?: string; fullName?: string };
    if (typeof row.file !== "string" || !row.file) continue;
    const path = relPath(row.file, root);
    const name =
      (typeof row.name === "string" && row.name.trim()) ||
      (typeof row.fullName === "string" && row.fullName.trim()) ||
      "unnamed";
    const fullName =
      typeof row.fullName === "string" && row.fullName.trim()
        ? row.fullName.trim()
        : name;
    const list = byFile.get(path) ?? [];
    list.push({ name, fullName });
    byFile.set(path, list);
  }

  const files = [...byFile.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, tests]) => ({ path, tests }));
  return { files };
}

/**
 * A jest `--listTests` line that is actually a test file: a path ending in a
 * source extension. Accepting every non-JSON line instead put npm warnings and
 * "npx canceled due to missing packages" into the suite tree as test files
 * (M-052).
 */
const TEST_FILE_LINE = /^[^\s].*\.[cm]?[jt]sx?$/;

export function parseJestListTests(
  raw: string,
  root: string,
): LocalTestListResult {
  const files: LocalTestListResult["files"][number][] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("{") || trimmed.startsWith("["))
      continue;
    if (!TEST_FILE_LINE.test(trimmed)) continue;
    const path = relPath(trimmed, root);
    if (seen.has(path)) continue;
    seen.add(path);
    files.push({ path, tests: [] });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files };
}

/** Discover tests via vitest `list --json` or jest `--listTests`. */
export async function listLocalWorkspaceTests(
  root: string,
  runners: readonly string[],
): Promise<LocalTestListResult> {
  const empty: LocalTestListResult = { files: [] };
  const prefersVitest = runners.includes("vitest");
  const prefersJest = runners.includes("jest");

  const tryVitestList = async (): Promise<LocalTestListResult | null> => {
    const result = await runCommand(
      "npx",
      ["--no-install", "vitest", "list", "--json"],
      root,
    );
    if (isMissingRunner(result)) return null;
    const parsed = parseVitestListJson(
      `${result.stdout}\n${result.stderr}`,
      root,
    );
    return parsed.files.length > 0 ? parsed : null;
  };

  const tryJestList = async (): Promise<LocalTestListResult | null> => {
    const result = await runCommand(
      "npx",
      ["--no-install", "jest", "--listTests"],
      root,
    );
    if (isMissingRunner(result)) return null;
    const parsed = parseJestListTests(result.stdout || result.stderr, root);
    return parsed.files.length > 0 ? parsed : null;
  };

  if (prefersVitest || (!prefersJest && runners.length === 0)) {
    const vitest = await tryVitestList();
    if (vitest) return vitest;
  }
  if (prefersJest || runners.length === 0) {
    const jest = await tryJestList();
    if (jest) return jest;
  }
  if (prefersJest) {
    const vitest = await tryVitestList();
    if (vitest) return vitest;
  }

  return empty;
}
