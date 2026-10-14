import type { TestRunner } from "@repo-prism/shared";

/** The parts of a package.json that identify its test runner. */
export type PackageManifest = {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

const SCRIPT_PATTERNS: ReadonlyArray<readonly [TestRunner, RegExp]> = [
  ["vitest", /\bvitest\b/],
  ["jest", /\bjest\b/],
  ["mocha", /\bmocha\b/],
  ["bun", /\bbun\s+test\b/],
  ["node:test", /\bnode\s+(?:[^|&;]*\s)?--test\b/],
];

const DEP_RUNNERS: ReadonlyArray<readonly [TestRunner, string]> = [
  ["vitest", "vitest"],
  ["jest", "jest"],
  ["mocha", "mocha"],
];

/**
 * Detect the test runner (plan §4.3). The `test` script decides first, then
 * any script, then a runner dependency. Returns undefined when unknown —
 * callers report `unknownRunner` rather than guessing.
 */
export function detectTestRunner(
  manifest: PackageManifest | undefined,
): TestRunner | undefined {
  if (!manifest) return undefined;
  const scripts = manifest.scripts ?? {};
  const ordered = [
    scripts.test,
    ...Object.entries(scripts)
      .filter(([k]) => k !== "test")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v),
  ].filter((v): v is string => typeof v === "string");
  for (const script of ordered) {
    for (const [runner, re] of SCRIPT_PATTERNS)
      if (re.test(script)) return runner;
  }
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const [runner, dep] of DEP_RUNNERS) if (dep in deps) return runner;
  return undefined;
}

function quote(path: string): string {
  return /^[\w./@+-]+$/.test(path)
    ? path
    : `'${path.replaceAll("'", "'\\''")}'`;
}

/** A shell command that runs exactly `paths` with `runner`. Never executed. */
export function runCommandFor(
  runner: TestRunner,
  paths: readonly string[],
): string | undefined {
  if (paths.length === 0) return undefined;
  const args = paths.map(quote).join(" ");
  switch (runner) {
    case "vitest":
      return `npx vitest run ${args}`;
    case "jest":
      return `npx jest ${args}`;
    case "mocha":
      return `npx mocha ${args}`;
    case "bun":
      return `bun test ${args}`;
    case "node:test":
      return `node --test ${args}`;
  }
}
