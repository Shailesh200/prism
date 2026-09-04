/**
 * Agent orientation benchmark (M-063).
 *
 * Compares naive repo exploration (no Prism) vs structural Prism calls on
 * three intelligence fixtures. Publishes JSON for reproducible runs.
 *
 *   bun run bench:orientation
 *   bun run bench:orientation -- --out plans/notes/benchmarks-sample.json
 *
 * Token estimates use bytes ÷ 4 (common LLM heuristic). Per-call context is
 * bytesRead / toolCalls (and the same ratio in tokens). Real agent runs vary
 * by model and prompting; this harness measures deterministic proxy costs.
 */

import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

type ScenarioId =
  | "orient"
  | "safe_edit"
  | "health"
  | "find"
  | "test_impact"
  | "cycles";

type FixtureSpec = {
  id: string;
  root: string;
  editTarget: string;
  symbol: string;
};

type StepMetric = {
  step: string;
  bytesRead: number;
};

type RunMetrics = {
  toolCalls: number;
  bytesRead: number;
  estimatedTokens: number;
  /** bytesRead / toolCalls — context dumped into the window per hop. */
  bytesPerCall: number;
  /** estimatedTokens / toolCalls. */
  tokensPerCall: number;
  elapsedMs: number;
  steps: StepMetric[];
};

type ScenarioResult = {
  scenario: ScenarioId;
  label: string;
  withoutPrism: RunMetrics;
  withPrism: RunMetrics;
  savings: {
    toolCallsPct: number;
    bytesPct: number;
    tokensPct: number;
    timePct: number;
  };
};

type BenchReport = {
  recordedAt: string;
  methodology: {
    tokenEstimate: string;
    withoutPrism: string;
    withPrism: string;
  };
  machine: {
    platform: string;
    arch: string;
    node: string;
  };
  fixtures: Array<{
    id: string;
    root: string;
    editTarget: string;
    scenarios: ScenarioResult[];
  }>;
  totals: {
    withoutPrism: RunMetrics;
    withPrism: RunMetrics;
    savings: ScenarioResult["savings"];
  };
};

const FIXTURES: FixtureSpec[] = [
  {
    id: "m012-features",
    root: join(repoRoot, "packages/intelligence/fixtures/m012-features"),
    editTarget: "packages/auth/src/index.ts",
    symbol: "login",
  },
  {
    id: "m013-mono",
    root: join(repoRoot, "packages/intelligence/fixtures/m013-mono"),
    editTarget: "apps/api/main.ts",
    symbol: "boot",
  },
  {
    id: "m044-backend",
    root: join(repoRoot, "packages/intelligence/fixtures/m044-backend"),
    editTarget: "express/auth.ts",
    symbol: "requireAuth",
  },
  {
    id: "m049-soft",
    root: join(repoRoot, "packages/intelligence/fixtures/m049-soft"),
    editTarget: "src/util.ts",
    symbol: "util",
  },
  {
    id: "m010-cycles",
    root: join(repoRoot, "packages/intelligence/fixtures/m010-cycles"),
    editTarget: "b.ts",
    symbol: "b",
  },
];

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "orient", label: "What is this repository?" },
  { id: "safe_edit", label: "Is this edit safe?" },
  { id: "health", label: "Is this codebase healthy?" },
  { id: "find", label: "Where does this symbol live?" },
  { id: "test_impact", label: "Which tests should I run?" },
  { id: "cycles", label: "Are there import cycles?" },
];

async function loadCore() {
  const entry = join(repoRoot, "packages", "core", "dist", "index.js");
  try {
    return await import(pathToFileURL(entry).href);
  } catch (cause) {
    throw new Error(
      `bench:orientation: cannot load @repo-prism/core from ${entry}. Run \`bun run build\` first.`,
      { cause },
    );
  }
}

function estimateTokens(bytes: number): number {
  return Math.round(bytes / 4);
}

function perCall(
  toolCalls: number,
  bytesRead: number,
  estimatedTokens: number,
): {
  bytesPerCall: number;
  tokensPerCall: number;
} {
  const n = Math.max(toolCalls, 1);
  return {
    bytesPerCall: Math.round(bytesRead / n),
    tokensPerCall: Math.round(estimatedTokens / n),
  };
}

function finishRun(
  toolCalls: number,
  bytesRead: number,
  elapsedMs: number,
  steps: StepMetric[],
): RunMetrics {
  const estimatedTokens = estimateTokens(bytesRead);
  return {
    toolCalls,
    bytesRead,
    estimatedTokens,
    elapsedMs,
    steps,
    ...perCall(toolCalls, bytesRead, estimatedTokens),
  };
}

function pctSaved(without: number, withPrism: number): number {
  if (without === 0) return 0;
  return Math.round(((without - withPrism) / without) * 100);
}

function aggregate(metrics: RunMetrics[]): RunMetrics {
  const summed = metrics.reduce(
    (acc, m) => ({
      toolCalls: acc.toolCalls + m.toolCalls,
      bytesRead: acc.bytesRead + m.bytesRead,
      elapsedMs: acc.elapsedMs + m.elapsedMs,
      steps: [...acc.steps, ...m.steps],
    }),
    {
      toolCalls: 0,
      bytesRead: 0,
      elapsedMs: 0,
      steps: [] as StepMetric[],
    },
  );
  return finishRun(
    summed.toolCalls,
    summed.bytesRead,
    summed.elapsedMs,
    summed.steps,
  );
}

function savings(
  without: RunMetrics,
  withPrism: RunMetrics,
): ScenarioResult["savings"] {
  return {
    toolCallsPct: pctSaved(without.toolCalls, withPrism.toolCalls),
    bytesPct: pctSaved(without.bytesRead, withPrism.bytesRead),
    tokensPct: pctSaved(without.estimatedTokens, withPrism.estimatedTokens),
    timePct: pctSaved(without.elapsedMs, withPrism.elapsedMs),
  };
}

async function readBytes(path: string): Promise<number> {
  try {
    const data = await readFile(path);
    return data.byteLength;
  } catch {
    return 0;
  }
}

async function listDir(root: string): Promise<string[]> {
  try {
    return (await readdir(root)).map((name) => join(root, name));
  } catch {
    return [];
  }
}

async function collectSourceFiles(root: string, limit = 40): Promise<string[]> {
  const out: string[] = [];
  const queue = [root];
  while (queue.length > 0 && out.length < limit) {
    const dir = queue.shift()!;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(
      () => [],
    )) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) queue.push(path);
      else if (/\.(ts|tsx|js|jsx|json|md)$/i.test(entry.name)) out.push(path);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Naive agent: read manifests, skim tree, grep imports by scanning files. */
async function withoutPrismOrient(root: string): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const readStep = async (step: string, path: string) => {
    toolCalls += 1;
    const bytes = await readBytes(path);
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  await readStep("read package.json", join(root, "package.json"));
  await readStep("read README", join(root, "README.md"));

  toolCalls += 1;
  const rootEntries = await listDir(root);
  bytesRead += rootEntries.length * 32;
  steps.push({ step: "list root", bytesRead: rootEntries.length * 32 });

  for (const sub of ["packages", "src", "apps"]) {
    toolCalls += 1;
    const entries = await listDir(join(root, sub));
    bytesRead += entries.length * 24;
    steps.push({ step: `list ${sub}/`, bytesRead: entries.length * 24 });
  }

  const candidates = await collectSourceFiles(root, 8);
  for (const file of candidates) {
    await readStep(`read ${relative(root, file)}`, file);
  }

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

/** Naive agent: read target + scan repo for import references. */
async function withoutPrismSafeEdit(
  root: string,
  target: string,
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const readStep = async (step: string, path: string) => {
    toolCalls += 1;
    const bytes = await readBytes(path);
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  const targetPath = join(root, target);
  await readStep("read edit target", targetPath);

  const targetBase = target.replace(/\.[^.]+$/, "");
  const files = await collectSourceFiles(root, 30);
  toolCalls += 1;
  steps.push({ step: "glob source files", bytesRead: files.length * 16 });
  bytesRead += files.length * 16;

  const importNeedle = targetBase.split("/").pop() ?? target;
  for (const file of files) {
    if (file === targetPath) continue;
    toolCalls += 1;
    const text = await readFile(file, "utf8").catch(() => "");
    const hit = text.includes(importNeedle);
    const bytes = hit ? text.length : Math.min(text.length, 512);
    bytesRead += bytes;
    steps.push({
      step: hit
        ? `scan import hit ${relative(root, file)}`
        : `scan ${relative(root, file)}`,
      bytesRead: bytes,
    });
  }

  await readStep("read package.json", join(root, "package.json"));

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

type WorkspaceHandle = {
  index: () => Promise<unknown>;
  getDna: () => Promise<unknown>;
  getOverviewModel: (o: object) => Promise<unknown>;
  blastRadius: (o: object) => Promise<unknown>;
  getHealth: () => Promise<unknown>;
  getEngineeringHealth: () => Promise<unknown>;
  findSymbol: (q: object) => unknown;
  testImpact: (o: object) => Promise<unknown>;
  getCycles: () => unknown;
  close?: () => void;
};

function openWorkspace(
  root: string,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
): WorkspaceHandle {
  const opened = Prism.create().openRepository(root) as {
    ok: boolean;
    value?: WorkspaceHandle;
    error?: { message: string };
  };
  if (!opened.ok || !opened.value) {
    throw new Error(opened.error?.message ?? "openRepository failed");
  }
  return opened.value;
}

async function withPrismCalls(
  root: string,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
  calls: Array<{
    step: string;
    run: (ws: WorkspaceHandle) => unknown | Promise<unknown>;
  }>,
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;
  const workspace = openWorkspace(root, Prism);

  for (const call of calls) {
    toolCalls += 1;
    const result = await call.run(workspace);
    const json = JSON.stringify(result ?? {});
    const bytes = Buffer.byteLength(json, "utf8");
    bytesRead += bytes;
    steps.push({ step: call.step, bytesRead: bytes });
  }

  workspace.close?.();
  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

/** Naive agent: skim CI/lint/test config the way an agent hunts for health. */
async function withoutPrismHealth(root: string): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const readStep = async (step: string, path: string) => {
    toolCalls += 1;
    const bytes = await readBytes(path);
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  await readStep("read package.json", join(root, "package.json"));
  for (const name of [
    "README.md",
    "tsconfig.json",
    "vitest.config.ts",
    "eslint.config.js",
    ".github/workflows/ci.yml",
  ]) {
    await readStep(`read ${name}`, join(root, name));
  }

  toolCalls += 1;
  const files = await collectSourceFiles(root, 12);
  bytesRead += files.length * 16;
  steps.push({ step: "glob source files", bytesRead: files.length * 16 });
  for (const file of files) {
    await readStep(`skim ${relative(root, file)}`, file);
  }

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

/** Naive agent: grep every source file for a symbol name. */
async function withoutPrismFind(
  root: string,
  symbol: string,
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const files = await collectSourceFiles(root, 40);
  toolCalls += 1;
  bytesRead += files.length * 16;
  steps.push({ step: "glob source files", bytesRead: files.length * 16 });

  for (const file of files) {
    toolCalls += 1;
    const text = await readFile(file, "utf8").catch(() => "");
    const hit = text.includes(symbol);
    const bytes = hit ? text.length : Math.min(text.length, 256);
    bytesRead += bytes;
    steps.push({
      step: hit
        ? `grep hit ${relative(root, file)}`
        : `grep ${relative(root, file)}`,
      bytesRead: bytes,
    });
  }

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

/** Naive agent: find test files and scan them for the edit target. */
async function withoutPrismTestImpact(
  root: string,
  target: string,
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const readStep = async (step: string, path: string) => {
    toolCalls += 1;
    const bytes = await readBytes(path);
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  await readStep("read edit target", join(root, target));
  await readStep("read package.json", join(root, "package.json"));

  const files = await collectSourceFiles(root, 40);
  toolCalls += 1;
  bytesRead += files.length * 16;
  steps.push({ step: "glob source files", bytesRead: files.length * 16 });

  const needle =
    target
      .replace(/\.[^.]+$/, "")
      .split("/")
      .pop() ?? target;
  for (const file of files) {
    const rel = relative(root, file);
    const looksTest = /\.(test|spec)\.|\/tests?\//i.test(rel);
    if (!looksTest && !rel.includes(needle)) continue;
    toolCalls += 1;
    const text = await readFile(file, "utf8").catch(() => "");
    bytesRead += text.length;
    steps.push({ step: `read ${rel}`, bytesRead: text.length });
  }

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

/** Naive agent: read every file's imports to hunt for cycles. */
async function withoutPrismCycles(root: string): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const files = await collectSourceFiles(root, 40);
  toolCalls += 1;
  bytesRead += files.length * 16;
  steps.push({ step: "glob source files", bytesRead: files.length * 16 });

  for (const file of files) {
    toolCalls += 1;
    const text = await readFile(file, "utf8").catch(() => "");
    bytesRead += text.length;
    steps.push({
      step: `read imports ${relative(root, file)}`,
      bytesRead: text.length,
    });
  }

  const elapsedMs = Math.round(performance.now() - started);
  return finishRun(toolCalls, bytesRead, elapsedMs, steps);
}

async function runScenario(
  fixture: FixtureSpec,
  scenario: ScenarioId,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
): Promise<{ without: RunMetrics; with: RunMetrics }> {
  switch (scenario) {
    case "orient":
      return {
        without: await withoutPrismOrient(fixture.root),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          { step: "repository_dna", run: (ws) => ws.getDna() },
          {
            step: "repository_overview",
            run: (ws) => ws.getOverviewModel({}),
          },
        ]),
      };
    case "safe_edit":
      return {
        without: await withoutPrismSafeEdit(fixture.root, fixture.editTarget),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          {
            step: "blast_radius",
            run: (ws) =>
              ws.blastRadius({ kind: "file", id: fixture.editTarget }),
          },
        ]),
      };
    case "health":
      return {
        without: await withoutPrismHealth(fixture.root),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          { step: "repository_health", run: (ws) => ws.getHealth() },
          {
            step: "engineering_health",
            run: (ws) => ws.getEngineeringHealth(),
          },
        ]),
      };
    case "find":
      return {
        without: await withoutPrismFind(fixture.root, fixture.symbol),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          {
            step: "find_symbol",
            run: (ws) => ws.findSymbol({ name: fixture.symbol }),
          },
        ]),
      };
    case "test_impact":
      return {
        without: await withoutPrismTestImpact(fixture.root, fixture.editTarget),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          {
            step: "test_impact",
            run: (ws) =>
              ws.testImpact({ kind: "file", id: fixture.editTarget }),
          },
        ]),
      };
    case "cycles":
      return {
        without: await withoutPrismCycles(fixture.root),
        with: await withPrismCalls(fixture.root, Prism, [
          { step: "index (once)", run: (ws) => ws.index() },
          { step: "dependency_cycles", run: (ws) => ws.getCycles() },
        ]),
      };
  }
}

function formatMetrics(label: string, m: RunMetrics): string {
  return [
    `  ${label}`,
    `    tool calls: ${m.toolCalls}`,
    `    bytes read: ${m.bytesRead.toLocaleString()} (${m.bytesPerCall.toLocaleString()} / call)`,
    `    est. tokens: ${m.estimatedTokens.toLocaleString()} (${m.tokensPerCall.toLocaleString()} / call)`,
    `    elapsed: ${m.elapsedMs} ms`,
  ].join("\n");
}

async function main() {
  const outPath = join(
    repoRoot,
    arg("out", "plans/notes/benchmarks-latest.json"),
  );

  const { Prism } = await loadCore();
  const fixtureResults: BenchReport["fixtures"] = [];
  const allWithout: RunMetrics[] = [];
  const allWith: RunMetrics[] = [];

  for (const fixture of FIXTURES) {
    try {
      await stat(fixture.root);
    } catch {
      throw new Error(`bench:orientation: missing fixture ${fixture.root}`);
    }

    const scenarios: ScenarioResult[] = [];
    for (const scenario of SCENARIOS) {
      process.stderr.write(
        `bench:orientation: ${fixture.id} — ${scenario.id}\n`,
      );
      const { without, with: withPrism } = await runScenario(
        fixture,
        scenario.id,
        Prism,
      );
      allWithout.push(without);
      allWith.push(withPrism);
      scenarios.push({
        scenario: scenario.id,
        label: scenario.label,
        withoutPrism: without,
        withPrism,
        savings: savings(without, withPrism),
      });
    }

    fixtureResults.push({
      id: fixture.id,
      root: relative(repoRoot, fixture.root),
      editTarget: fixture.editTarget,
      scenarios,
    });
  }

  const totalWithout = aggregate(allWithout);
  const totalWith = aggregate(allWith);

  const report: BenchReport = {
    recordedAt: new Date().toISOString(),
    methodology: {
      tokenEstimate:
        "estimatedTokens = bytesRead / 4; tokensPerCall = estimatedTokens / toolCalls",
      withoutPrism:
        "Simulated naive agent: list dirs, read manifests, scan/grep files",
      withPrism:
        "Core SDK calls matching MCP tools (repository_dna, repository_overview, blast_radius, repository_health, find_symbol, test_impact, dependency_cycles)",
    },
    machine: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
    },
    fixtures: fixtureResults,
    totals: {
      withoutPrism: totalWithout,
      withPrism: totalWith,
      savings: savings(totalWithout, totalWith),
    },
  };

  await mkdir(join(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const publicPath = join(
    repoRoot,
    arg("public", "apps/website/data/benchmarks-sample.json"),
  );
  const slimMetrics = ({
    steps: _steps,
    ...rest
  }: RunMetrics): Omit<RunMetrics, "steps"> => rest;
  const publicReport = {
    ...report,
    fixtures: report.fixtures.map((fixture) => ({
      ...fixture,
      scenarios: fixture.scenarios.map((scenario) => ({
        ...scenario,
        withoutPrism: slimMetrics(scenario.withoutPrism),
        withPrism: slimMetrics(scenario.withPrism),
      })),
    })),
    totals: {
      ...report.totals,
      withoutPrism: slimMetrics(report.totals.withoutPrism),
      withPrism: slimMetrics(report.totals.withPrism),
    },
  };
  await mkdir(join(publicPath, ".."), { recursive: true });
  await writeFile(
    publicPath,
    `${JSON.stringify(publicReport, null, 2)}\n`,
    "utf8",
  );

  console.log("\nbench:orientation — agent orientation savings\n");
  for (const fixture of fixtureResults) {
    console.log(`${fixture.id} (${fixture.editTarget})`);
    for (const s of fixture.scenarios) {
      console.log(`  ${s.label}`);
      console.log(formatMetrics("without Prism", s.withoutPrism));
      console.log(formatMetrics("with Prism", s.withPrism));
      console.log(
        `    savings: ${s.savings.toolCallsPct}% calls · ${s.savings.tokensPct}% tokens · ${s.withoutPrism.tokensPerCall}→${s.withPrism.tokensPerCall} tok/call · ${s.savings.timePct}% time\n`,
      );
    }
  }

  console.log("Totals");
  console.log(formatMetrics("without Prism", totalWithout));
  console.log(formatMetrics("with Prism", totalWith));
  console.log(
    `\n  savings: ${report.totals.savings.toolCallsPct}% calls · ${report.totals.savings.tokensPct}% tokens · ${totalWithout.tokensPerCall}→${totalWith.tokensPerCall} tok/call · ${report.totals.savings.timePct}% time`,
  );
  console.log(
    `\nbench:orientation: wrote ${relative(repoRoot, outPath)} and ${relative(repoRoot, publicPath)}`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
