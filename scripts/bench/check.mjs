/**
 * Compare a benchmark result against the committed budgets (M-035 Phase 1.3).
 *
 *   bun run bench:check                    small scale, runs the benchmark first
 *   bun run bench:check -- --scale medium
 *   bun run bench:check -- --in .bench/results/medium.json
 *
 * Small scale by default because this is meant to be runnable on a whim: it is
 * about ten seconds end to end, which is the difference between a check people
 * run and a check people mean to run.
 *
 * Exit codes: 0 within budget, 1 over budget, 2 could not run the comparison.
 */

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const scale = arg("scale", "small");
const explicitIn = arg("in", null);
const resultPath = join(repoRoot, explicitIn ?? `.bench/results/${scale}.json`);

const budgets = JSON.parse(await readFile(join(here, "budgets.json"), "utf8"));
const budget = budgets.scales[scale];
if (!budget) {
  console.error(
    `bench:check: no budget for scale "${scale}" — have ${Object.keys(budgets.scales).join(", ")}`,
  );
  process.exit(2);
}

// Without --in, measure now. Comparing against a result file of unknown age is
// how a green check ends up describing code from three weeks ago.
if (!explicitIn) {
  const reps = arg("reps", "3");
  const run = spawnSync(
    process.execPath,
    [join(here, "run.mjs"), "--scale", scale, "--reps", reps],
    { stdio: "inherit" },
  );
  if (run.status !== 0) {
    console.error("bench:check: benchmark run failed");
    process.exit(2);
  }
}

let result;
try {
  result = JSON.parse(await readFile(resultPath, "utf8"));
} catch (cause) {
  console.error(
    `bench:check: cannot read ${relative(repoRoot, resultPath)} — run \`bun run bench --scale ${scale}\` first.`,
    cause.message,
  );
  process.exit(2);
}

if (result.scale !== scale) {
  console.error(
    `bench:check: ${relative(repoRoot, resultPath)} was recorded at scale "${result.scale}", not "${scale}"`,
  );
  process.exit(2);
}

const rows = [];
let over = 0;

for (const [name, limitMs] of Object.entries(budget.operations)) {
  const measured = result.operations?.[name]?.medianMs;
  if (measured === undefined) {
    rows.push({ name, measured: null, limitMs, status: "missing" });
    over += 1;
    continue;
  }
  const status = measured > limitMs ? "over" : "ok";
  if (status === "over") over += 1;
  rows.push({ name, measured, limitMs, status, pct: measured / limitMs });
}

const rssLimit = budget.peakRssBytes;
const rssMeasured = result.peakRssBytes ?? 0;
const rssOver = rssMeasured > rssLimit;
if (rssOver) over += 1;

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

console.log(
  `\nbench:check: ${scale} against budget (recorded ${result.recordedAt ?? "unknown"})\n`,
);
for (const row of rows) {
  const mark = row.status === "ok" ? "ok  " : "OVER";
  const measured =
    row.measured === null ? "not measured" : `${row.measured} ms`;
  const share =
    row.pct === undefined ? "" : ` (${Math.round(row.pct * 100)}% of budget)`;
  console.log(
    `  ${mark}  ${row.name.padEnd(20)} ${measured.padStart(12)} / ${String(row.limitMs).padStart(6)} ms${share}`,
  );
}
console.log(
  `  ${rssOver ? "OVER" : "ok  "}  ${"peak RSS".padEnd(20)} ${mb(rssMeasured).padStart(12)} / ${mb(rssLimit)}`,
);

if (over > 0) {
  console.error(
    `\nbench:check: ${over} over budget. Either the change made something ` +
      `algorithmically more expensive, or the budget needs raising with a ` +
      `note in plans/architecture/08_PERFORMANCE.md saying why.`,
  );
  process.exit(1);
}

console.log(`\nbench:check: within budget.`);
