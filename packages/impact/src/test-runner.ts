import type { TestRunner } from "@repo-prism/shared";

/** The parts of a package.json that identify its test runner. */
export type PackageManifest = {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

const SCRIPT_PATTERNS: ReadonlyArray<readonly [TestRunner, RegExp]> = [
  ["vitest", /\bvitest\b/],
  // Vite+ (`vp test`) runs vitest; without this hono's `test:bun` won (round 2).
  ["vitest", /\bvp\s+test\b/],
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

function quote(arg: string): string {
  return /^[\w./@+:=-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}

export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** One package that can run tests: its directory and what its manifest says. */
export type TestPackage = {
  /** Repo-relative directory; `""` is the repository root. */
  readonly dir: string;
  readonly runner?: TestRunner;
  readonly hasTestScript: boolean;
  /** A `typecheck` script in its manifest (plan P11 proofs). */
  readonly hasTypecheckScript?: boolean;
  /** A `tsconfig.json` next to its manifest. */
  readonly hasTsconfig?: boolean;
};

/** A ready command for the tests one package owns (plan P10). Never executed. */
export type TestRun = {
  /** Repo-relative directory to run it from (`.` for the root). */
  readonly cwd: string;
  readonly command: string;
  readonly argv: readonly string[];
  /** `files`: exactly the reached tests. `script`: the package's whole test script (runner unknown). */
  readonly scope: "files" | "script";
  readonly runner?: TestRunner;
  readonly tests: readonly string[];
};

function execPrefix(pm: PackageManager): string[] {
  switch (pm) {
    case "npm":
      return ["npx"];
    case "pnpm":
      return ["pnpm", "exec"];
    // `yarn <bin>` runs a dependency's binary under Yarn 1 and Berry (PnP too).
    case "yarn":
      return ["yarn"];
    case "bun":
      return ["bunx"];
  }
}

function runnerArgv(
  runner: TestRunner,
  pm: PackageManager,
  files: readonly string[],
): string[] {
  switch (runner) {
    case "vitest":
      return [...execPrefix(pm), "vitest", "run", ...files];
    // Paths, not patterns: jest otherwise treats each argument as a regex.
    case "jest":
      return [...execPrefix(pm), "jest", "--runTestsByPath", ...files];
    case "mocha":
      return [...execPrefix(pm), "mocha", ...files];
    // `bun test` reads a bare argument as a name filter; `./` makes it a path.
    case "bun":
      return [
        "bun",
        "test",
        ...files.map((f) => (f.startsWith(".") ? f : `./${f}`)),
      ];
    case "node:test":
      return ["node", "--test", ...files];
  }
}

function scriptArgv(pm: PackageManager): string[] {
  return pm === "yarn" ? ["yarn", "test"] : [pm, "run", "test"];
}

function within(dir: string, path: string): boolean {
  return dir === "" || path === dir || path.startsWith(`${dir}/`);
}

/**
 * Ready commands for `tests` (plan P10): grouped by the package that runs
 * them, each from that package's directory with its own runner and the
 * repository's package manager. A test's runner comes from its nearest
 * package with a known runner (a hoisted root vitest covers its packages);
 * when none is known, the nearest package with a `test` script runs its whole
 * script. Tests no package can run are left out, with the reason.
 */
export function testRunPlan(
  tests: readonly string[],
  packages: readonly TestPackage[],
  pm: PackageManager,
): {
  readonly runs: readonly TestRun[];
  readonly unrunnable: readonly string[];
} {
  // Deepest directory first, so "nearest" is the first match.
  const byDepth = [...packages].sort(
    (a, b) => b.dir.length - a.dir.length || a.dir.localeCompare(b.dir),
  );
  const groups = new Map<
    string,
    { pkg: TestPackage; scope: TestRun["scope"]; tests: string[] }
  >();
  const unrunnable: string[] = [];
  for (const test of tests) {
    const owners = byDepth.filter((pkg) => within(pkg.dir, test));
    const withRunner = owners.find((pkg) => pkg.runner);
    const withScript = owners.find((pkg) => pkg.hasTestScript);
    const pkg = withRunner ?? withScript;
    if (!pkg) {
      unrunnable.push(test);
      continue;
    }
    const scope = withRunner ? "files" : "script";
    const key = `${scope}\0${pkg.dir}`;
    const group = groups.get(key) ?? { pkg, scope, tests: [] };
    group.tests.push(test);
    groups.set(key, group);
  }
  const runs = [...groups.values()]
    .sort((a, b) => a.pkg.dir.localeCompare(b.pkg.dir))
    .map(({ pkg, scope, tests: owned }): TestRun => {
      const relative = owned.map((t) =>
        pkg.dir ? t.slice(pkg.dir.length + 1) : t,
      );
      const argv =
        scope === "files" && pkg.runner
          ? runnerArgv(pkg.runner, pm, relative)
          : scriptArgv(pm);
      return {
        cwd: pkg.dir || ".",
        command: argv.map(quote).join(" "),
        argv,
        scope,
        ...(scope === "files" && pkg.runner ? { runner: pkg.runner } : {}),
        tests: owned,
      };
    });
  return { runs, unrunnable };
}

/** A ready type-check command for some changed files (plan P11). Never executed. */
export type TypecheckRun = {
  /** Repo-relative directory to run it from (`.` for the root). */
  readonly cwd: string;
  readonly command: string;
  readonly argv: readonly string[];
  /** Whether it is the package's own `typecheck` script. */
  readonly script: boolean;
  readonly files: readonly string[];
};

const JS_FILE = /\.(?:m|c)?jsx?$/;

/**
 * The cheapest type-check for each file's package: its `typecheck` script,
 * else `tsc --noEmit -p .` over its tsconfig, else `tsc --noEmit` on the TS
 * files and `node --check` on each JS file (one file per `node --check`).
 */
export function typecheckPlan(
  files: readonly string[],
  packages: readonly TestPackage[],
  pm: PackageManager,
): readonly TypecheckRun[] {
  const byDepth = [...packages].sort(
    (a, b) => b.dir.length - a.dir.length || a.dir.localeCompare(b.dir),
  );
  const groups = new Map<string, { pkg: TestPackage; files: string[] }>();
  for (const file of files) {
    const pkg = byDepth.find((p) => within(p.dir, file)) ?? {
      dir: "",
      hasTestScript: false,
    };
    const group = groups.get(pkg.dir) ?? { pkg, files: [] };
    group.files.push(file);
    groups.set(pkg.dir, group);
  }
  const runs: TypecheckRun[] = [];
  const push = (
    pkg: TestPackage,
    argv: string[],
    owned: readonly string[],
    script = false,
  ) =>
    runs.push({
      cwd: pkg.dir || ".",
      command: argv.map(quote).join(" "),
      argv,
      script,
      files: [...owned],
    });
  for (const { pkg, files: owned } of [...groups.values()].sort((a, b) =>
    a.pkg.dir.localeCompare(b.pkg.dir),
  )) {
    if (pkg.hasTypecheckScript) {
      push(
        pkg,
        pm === "yarn" ? ["yarn", "typecheck"] : [pm, "run", "typecheck"],
        owned,
        true,
      );
      continue;
    }
    if (pkg.hasTsconfig) {
      push(pkg, [...execPrefix(pm), "tsc", "--noEmit", "-p", "."], owned);
      continue;
    }
    const rel = (f: string) => (pkg.dir ? f.slice(pkg.dir.length + 1) : f);
    const ts = owned.filter((f) => !JS_FILE.test(f));
    if (ts.length > 0) {
      push(pkg, [...execPrefix(pm), "tsc", "--noEmit", ...ts.map(rel)], ts);
    }
    for (const js of owned.filter((f) => JS_FILE.test(f))) {
      push(pkg, ["node", "--check", rel(js)], [js]);
    }
  }
  return runs;
}
