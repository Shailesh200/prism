/**
 * Benchmark harness (M-035 Phase 1.2).
 *
 * Measures the operations a user waits for, at a chosen scale, and writes the
 * result as JSON so `bench:check` can compare it against a budget.
 *
 *   bun run bench                      medium scale, 3 repetitions
 *   bun run bench -- --scale large     ~50,000 files
 *   bun run bench -- --reps 5
 *   bun run bench -- --out .bench/results/mine.json
 *
 * Deliberately *not* part of `verify:milestone`: it takes minutes, and a
 * verification suite people skip because it is slow verifies nothing.
 *
 * Reported figure is the **median** of the repetitions, not the mean. One
 * unlucky run where the OS decided to index Spotlight should not become the
 * number a budget is set from.
 */

import { mkdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generate, SCALES } from "./generate-fixture.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const scale = arg("scale", "medium");
const reps = Number(arg("reps", "3"));
const outPath = join(repoRoot, arg("out", `.bench/results/${scale}.json`));

if (!SCALES[scale]) {
  console.error(
    `bench: unknown scale "${scale}" — expected one of ${Object.keys(SCALES).join(", ")}`,
  );
  process.exit(1);
}

async function loadCore() {
  const entry = join(repoRoot, "packages", "core", "dist", "index.js");
  try {
    return await import(pathToFileURL(entry).href);
  } catch (cause) {
    throw new Error(
      `bench: cannot load @repo-prism/core from ${entry}. Run \`bun run build\` first.`,
      { cause },
    );
  }
}

function median(values) {
  const sorted = [...values].toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

async function directorySize(dir) {
  let total = 0;
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(path);
    else total += (await stat(path).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

/** Peak RSS across the whole run. Node gives no high-water mark, so sample. */
let peakRss = 0;
const rssTimer = setInterval(() => {
  peakRss = Math.max(peakRss, process.memoryUsage.rss());
}, 50);
rssTimer.unref();

async function time(fn) {
  const started = performance.now();
  const result = await fn();
  const elapsed = performance.now() - started;
  peakRss = Math.max(peakRss, process.memoryUsage.rss());

  // A benchmark that silently measures a failure is worse than no benchmark:
  // an operation that errors out early looks blisteringly fast.
  if (result && typeof result === "object" && result.ok === false) {
    throw new Error(
      `bench: operation failed — ${result.error?.code}: ${result.error?.message}`,
    );
  }
  return elapsed;
}

async function pickTarget(root) {
  const pkgDir = join(root, "packages", "pkg-3", "src");
  const entries = await readdir(pkgDir).catch(() => []);
  const file = entries.find(
    (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
  );
  if (!file) throw new Error("bench: fixture has no module to target");
  return relative(root, join(pkgDir, file));
}

console.log(`bench: preparing ${scale} fixture…`);
const { root, modules, packages } = await generate(scale, { quiet: true });
const target = await pickTarget(root);

const { Prism } = await loadCore();

const samples = {
  index_cold: [],
  index_warm: [],
  index_incremental: [],
  dependency_graph: [],
  cycles: [],
  repository_map: [],
  blast_radius: [],
  dna: [],
  health: [],
};

let indexSizeBytes = 0;

for (let rep = 0; rep < reps; rep += 1) {
  process.stderr.write(`bench: repetition ${rep + 1}/${reps}\n`);

  // Cold means cold. Leaving the cache behind would measure the warm path
  // twice and report it as two different numbers.
  await rm(join(root, ".prism"), { recursive: true, force: true });

  const cold = Prism.create().openRepository(root);
  if (!cold.ok) throw new Error(`bench: ${cold.error.message}`);
  const workspace = cold.value;

  samples.index_cold.push(await time(() => workspace.index()));
  indexSizeBytes = await directorySize(join(root, ".prism"));

  samples.index_warm.push(await time(() => workspace.index()));

  // `changedPaths` is the dirty-set path (ADR-0026) that watch mode uses. The
  // option name matters: pass an unrecognised one and this silently measures a
  // full warm index instead, which is a far less interesting number.
  await utimes(join(root, target), new Date(), new Date());
  samples.index_incremental.push(
    await time(() => workspace.reindex({ changedPaths: [target] })),
  );

  // These two read a graph that indexing already built, so what they measure
  // is the memoised path (M-035) — which is what a user actually waits for,
  // and near zero. Their budgets are set tight on purpose: if the memo ever
  // stops working, these are the numbers that jump.
  samples.dependency_graph.push(
    await time(() => workspace.getDependencyGraph()),
  );
  samples.cycles.push(await time(() => workspace.getCycles()));
  samples.repository_map.push(await time(() => workspace.getRepositoryMap()));
  samples.blast_radius.push(
    await time(() => workspace.blastRadius({ kind: "file", id: target })),
  );
  samples.dna.push(await time(() => workspace.getDna()));
  samples.health.push(await time(() => workspace.getHealth()));

  workspace.close?.();
}

const result = {
  scale,
  reps,
  recordedAt: new Date().toISOString(),
  fixture: { modules, packages, root: relative(repoRoot, root) },
  machine: {
    platform: process.platform,
    arch: process.arch,
    cpus: (await import("node:os")).cpus().length,
    node: process.version,
  },
  peakRssBytes: peakRss,
  indexSizeBytes,
  operations: Object.fromEntries(
    Object.entries(samples).map(([name, values]) => [
      name,
      {
        medianMs: Math.round(median(values)),
        minMs: Math.round(Math.min(...values)),
        maxMs: Math.round(Math.max(...values)),
      },
    ]),
  ),
};

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

console.log(
  `\nbench: ${scale} — ${modules} modules, ${packages} packages, ${reps} reps\n`,
);
for (const [name, stats] of Object.entries(result.operations)) {
  console.log(
    `  ${name.padEnd(20)} ${String(stats.medianMs).padStart(7)} ms   (${stats.minMs}–${stats.maxMs})`,
  );
}
console.log(
  `\n  ${"peak RSS".padEnd(20)} ${mb(peakRss).padStart(10)}\n  ${"index size".padEnd(20)} ${mb(indexSizeBytes).padStart(10)}`,
);
console.log(`\nbench: wrote ${relative(repoRoot, outPath)}`);
