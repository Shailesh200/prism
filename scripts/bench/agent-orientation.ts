/**
 * Agent orientation benchmark (M-063).
 *
 * Compares naive repo exploration (no Prism) vs structural Prism calls on
 * three intelligence fixtures. Publishes JSON for reproducible runs.
 *
 *   bun run bench:orientation
 *   bun run bench:orientation -- --out plans/notes/benchmarks-sample.json
 *
 * Token estimates use bytes ÷ 4 (common LLM heuristic). Real agent runs vary
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

type ScenarioId = "orient" | "safe_edit";

type FixtureSpec = {
  id: string;
  root: string;
  editTarget: string;
};

type StepMetric = {
  step: string;
  bytesRead: number;
};

type RunMetrics = {
  toolCalls: number;
  bytesRead: number;
  estimatedTokens: number;
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
  },
  {
    id: "m013-mono",
    root: join(repoRoot, "packages/intelligence/fixtures/m013-mono"),
    editTarget: "apps/api/main.ts",
  },
  {
    id: "m044-backend",
    root: join(repoRoot, "packages/intelligence/fixtures/m044-backend"),
    editTarget: "express/auth.ts",
  },
];

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "orient", label: "What is this repository?" },
  { id: "safe_edit", label: "Is this edit safe?" },
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

function pctSaved(without: number, withPrism: number): number {
  if (without === 0) return 0;
  return Math.round(((without - withPrism) / without) * 100);
}

function aggregate(metrics: RunMetrics[]): RunMetrics {
  return metrics.reduce(
    (acc, m) => ({
      toolCalls: acc.toolCalls + m.toolCalls,
      bytesRead: acc.bytesRead + m.bytesRead,
      estimatedTokens: acc.estimatedTokens + m.estimatedTokens,
      elapsedMs: acc.elapsedMs + m.elapsedMs,
      steps: [...acc.steps, ...m.steps],
    }),
    {
      toolCalls: 0,
      bytesRead: 0,
      estimatedTokens: 0,
      elapsedMs: 0,
      steps: [] as StepMetric[],
    },
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
  return {
    toolCalls,
    bytesRead,
    estimatedTokens: estimateTokens(bytesRead),
    elapsedMs,
    steps,
  };
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
  return {
    toolCalls,
    bytesRead,
    estimatedTokens: estimateTokens(bytesRead),
    elapsedMs,
    steps,
  };
}

async function withPrismOrient(
  root: string,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const opened = Prism.create().openRepository(root) as {
    ok: boolean;
    value?: {
      index: () => Promise<unknown>;
      getDna: () => Promise<unknown>;
      getOverviewModel: (o: object) => Promise<unknown>;
      close?: () => void;
    };
    error?: { message: string };
  };
  if (!opened.ok || !opened.value) {
    throw new Error(opened.error?.message ?? "openRepository failed");
  }
  const workspace = opened.value;

  const record = async (step: string, fn: () => Promise<unknown>) => {
    toolCalls += 1;
    const result = await fn();
    const json = JSON.stringify(result ?? {});
    const bytes = Buffer.byteLength(json, "utf8");
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  await record("index (once)", () => workspace.index());
  await record("repository_dna", () => workspace.getDna());
  await record("repository_overview", () => workspace.getOverviewModel({}));

  workspace.close?.();

  const elapsedMs = Math.round(performance.now() - started);
  return {
    toolCalls,
    bytesRead,
    estimatedTokens: estimateTokens(bytesRead),
    elapsedMs,
    steps,
  };
}

async function withPrismSafeEdit(
  root: string,
  target: string,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
): Promise<RunMetrics> {
  const started = performance.now();
  const steps: StepMetric[] = [];
  let toolCalls = 0;
  let bytesRead = 0;

  const opened = Prism.create().openRepository(root) as {
    ok: boolean;
    value?: {
      index: () => Promise<unknown>;
      blastRadius: (o: object) => Promise<unknown>;
      close?: () => void;
    };
    error?: { message: string };
  };
  if (!opened.ok || !opened.value) {
    throw new Error(opened.error?.message ?? "openRepository failed");
  }
  const workspace = opened.value;

  const record = async (step: string, fn: () => Promise<unknown>) => {
    toolCalls += 1;
    const result = await fn();
    const json = JSON.stringify(result ?? {});
    const bytes = Buffer.byteLength(json, "utf8");
    bytesRead += bytes;
    steps.push({ step, bytesRead: bytes });
  };

  await record("index (once)", () => workspace.index());
  await record("blast_radius", () =>
    workspace.blastRadius({ kind: "file", id: target }),
  );

  workspace.close?.();

  const elapsedMs = Math.round(performance.now() - started);
  return {
    toolCalls,
    bytesRead,
    estimatedTokens: estimateTokens(bytesRead),
    elapsedMs,
    steps,
  };
}

async function runScenario(
  fixture: FixtureSpec,
  scenario: ScenarioId,
  Prism: { create: () => { openRepository: (p: string) => unknown } },
): Promise<{ without: RunMetrics; with: RunMetrics }> {
  if (scenario === "orient") {
    return {
      without: await withoutPrismOrient(fixture.root),
      with: await withPrismOrient(fixture.root, Prism),
    };
  }
  return {
    without: await withoutPrismSafeEdit(fixture.root, fixture.editTarget),
    with: await withPrismSafeEdit(fixture.root, fixture.editTarget, Prism),
  };
}

function formatMetrics(label: string, m: RunMetrics): string {
  return [
    `  ${label}`,
    `    tool calls: ${m.toolCalls}`,
    `    bytes read: ${m.bytesRead.toLocaleString()}`,
    `    est. tokens: ${m.estimatedTokens.toLocaleString()}`,
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
      tokenEstimate: "estimatedTokens = bytesRead / 4",
      withoutPrism:
        "Simulated naive agent: list dirs, read manifests, scan/grep files",
      withPrism:
        "Core SDK calls matching MCP tools (repository_dna, repository_overview, blast_radius)",
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

  console.log("\nbench:orientation — agent orientation savings\n");
  for (const fixture of fixtureResults) {
    console.log(`${fixture.id} (${fixture.editTarget})`);
    for (const s of fixture.scenarios) {
      console.log(`  ${s.label}`);
      console.log(formatMetrics("without Prism", s.withoutPrism));
      console.log(formatMetrics("with Prism", s.withPrism));
      console.log(
        `    savings: ${s.savings.toolCallsPct}% calls · ${s.savings.tokensPct}% tokens · ${s.savings.timePct}% time\n`,
      );
    }
  }

  console.log("Totals");
  console.log(formatMetrics("without Prism", totalWithout));
  console.log(formatMetrics("with Prism", totalWith));
  console.log(
    `\n  savings: ${report.totals.savings.toolCallsPct}% calls · ${report.totals.savings.tokensPct}% tokens · ${report.totals.savings.timePct}% time`,
  );
  console.log(`\nbench:orientation: wrote ${relative(repoRoot, outPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
