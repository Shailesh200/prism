#!/usr/bin/env node
/**
 * Prepare / test-impact / blast evaluation over mined tasks (B2 and B4).
 *
 * For each task: check out its parent in the scratch clone, index with the
 * LOCAL build (packages/core/dist), run prepareChange(task), and score
 *   top-1 / top-3   : firstFile at rank 1 / within the first 3 pack files
 *   recall@pack     : share of the commit's source files that are in the pack
 *   tokens          : estimated tokens of the whole Prepare response
 *   test P/R        : testImpact(firstFile) vs the commit's changed tests
 *   blast P/R       : blastRadius(firstFile) vs the commit's other source files
 * P is only counted when the label set is non-empty (labels are lower bounds).
 *
 *   node scripts/bench/golden/run-eval.mjs --clone DIR --tasks FILE [--tasks FILE…] --out FILE [--label B4]
 *     [--ids-from RESULT.json]   # only the task ids an earlier result scored (e.g. the B2 baseline)
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cpus, totalmem } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const all = (n) =>
  process.argv.flatMap((a, i) => (a === `--${n}` ? [process.argv[i + 1]] : []));
const arg = (n, f) => all(n)[0] ?? f;

const { Prism } = await import(
  pathToFileURL(join(repoRoot, "packages/core/dist/index.js")).href
);
const { buildPromptPack } = await import(
  pathToFileURL(join(repoRoot, "packages/shared/dist/index.js")).href
);
const clones = all("clone");
const taskFiles = all("tasks");
if (clones.length !== taskFiles.length)
  throw new Error("run-eval: pass one --clone per --tasks");
const out = arg("out");
const label = arg("label", "eval");
// Re-run exactly the tasks an earlier result scored, so the two compare.
const idsFrom = arg("ids-from");
const keep = idsFrom
  ? new Set(JSON.parse(readFileSync(idsFrom, "utf8")).rows.map((r) => r.id))
  : null;

const pct = (xs) =>
  xs.length
    ? Math.round((1000 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10
    : null;
const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = xs.toSorted((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
const unwrap = (r, what) => {
  if (!r || r.ok !== true)
    throw new Error(
      `${what}: ${r?.error?.code ?? "?"} ${r?.error?.message ?? JSON.stringify(r)}`,
    );
  return r.value;
};

const rows = [];
for (let k = 0; k < clones.length; k++) {
  const clone = resolve(clones[k]);
  const { repo, pinnedSha, tasks } = JSON.parse(
    readFileSync(taskFiles[k], "utf8"),
  );
  for (const t of tasks) {
    if (keep && !keep.has(t.id)) continue;
    execFileSync("git", [
      "-C",
      clone,
      "checkout",
      "-q",
      "-f",
      "--detach",
      t.parent,
    ]);
    const row = { id: t.id, repo, heldOut: t.heldOut };
    try {
      const ws = unwrap(Prism.create().openRepository(clone), "openRepository");
      const t0 = performance.now();
      unwrap(await ws.index(), "index");
      row.indexMs = Math.round(performance.now() - t0);
      const t1 = performance.now();
      const prep = unwrap(
        await ws.prepareChange({ task: t.task }),
        "prepareChange",
      );
      row.prepareMs = Math.round(performance.now() - t1);
      const ranked = prep.pack.files.map((f) => f.path);
      row.top1 = ranked[0] === t.firstFile ? 1 : 0;
      row.top3 = ranked.slice(0, 3).includes(t.firstFile) ? 1 : 0;
      row.recallAtPack =
        t.files.filter((f) => ranked.includes(f)).length / t.files.length;
      // Round 2: the block the prompt hook would inject (files Prism is sure
      // of, or nothing). Precision counts only when it speaks; a block whose
      // files are all off the fix misleads the agent (promptWrong).
      const block = buildPromptPack({ prep, prompt: t.task });
      row.promptSpoke = block.shown.length > 0 ? 1 : 0;
      if (block.shown.length > 0) {
        const shown = block.shown.map((f) => f.path);
        const hits = shown.filter((f) => t.files.includes(f)).length;
        row.promptPrecision = hits / shown.length;
        row.promptWrong = hits === 0 ? 1 : 0;
        row.promptFirst = shown.includes(t.firstFile) ? 1 : 0;
      }
      row.tokens = Math.ceil(
        Buffer.byteLength(JSON.stringify(prep), "utf8") / 4,
      );
      const ti = unwrap(
        await ws.testImpact({ kind: "file", id: t.firstFile }),
        "testImpact",
      );
      const predTests = new Set(ti.tests.map((x) => x.path));
      if (t.tests.length) {
        row.testRecall =
          t.tests.filter((x) => predTests.has(x)).length / t.tests.length;
        row.testPrecision = predTests.size
          ? t.tests.filter((x) => predTests.has(x)).length / predTests.size
          : 0;
      }
      const br = unwrap(
        await ws.blastRadius({ kind: "file", id: t.firstFile }),
        "blastRadius",
      );
      const predBlast = new Set(br.affectedFiles.map((x) => x.path));
      if (t.blast.length) {
        row.blastRecall =
          t.blast.filter((x) => predBlast.has(x)).length / t.blast.length;
        row.blastPrecision = predBlast.size
          ? t.blast.filter((x) => predBlast.has(x)).length / predBlast.size
          : 0;
      }
      ws.close?.();
    } catch (error) {
      row.error = String(error?.message ?? error).slice(0, 300);
    }
    rows.push(row);
    console.error(
      `${label} ${t.id} ${row.error ? `ERROR ${row.error}` : `top1=${row.top1} top3=${row.top3} recall=${row.recallAtPack?.toFixed(2)} block=${row.promptSpoke ? `${row.promptPrecision?.toFixed(2)}` : "quiet"} tok=${row.tokens}`}`,
    );
  }
  execFileSync("git", [
    "-C",
    clone,
    "checkout",
    "-q",
    "-f",
    "--detach",
    pinnedSha,
  ]);
}

function summarize(rs) {
  const ok = rs.filter((r) => !r.error);
  const col = (k) => ok.filter((r) => r[k] !== undefined).map((r) => r[k]);
  return {
    tasks: rs.length,
    errors: rs.length - ok.length,
    top1: pct(col("top1")),
    top3: pct(col("top3")),
    recallAtPack: pct(col("recallAtPack")),
    promptSpoke: pct(col("promptSpoke")),
    promptPrecision: pct(col("promptPrecision")),
    promptWrong: pct(col("promptWrong")),
    promptFirst: pct(col("promptFirst")),
    testPrecision: pct(col("testPrecision")),
    testRecall: pct(col("testRecall")),
    blastPrecision: pct(col("blastPrecision")),
    blastRecall: pct(col("blastRecall")),
    tokensP50: quantile(col("tokens"), 0.5),
    tokensP95: quantile(col("tokens"), 0.95),
    prepareMsP50: quantile(col("prepareMs"), 0.5),
    prepareMsP95: quantile(col("prepareMs"), 0.95),
    indexMsP50: quantile(col("indexMs"), 0.5),
  };
}
const repos = [...new Set(rows.map((r) => r.repo))];
const result = {
  benchmark: label,
  recordedAt: new Date().toISOString(),
  prismHead: execFileSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  machine: {
    node: process.version,
    cpus: cpus()[0]?.model,
    memGb: Math.round(totalmem() / 2 ** 30),
  },
  all: summarize(rows),
  open: summarize(rows.filter((r) => !r.heldOut)),
  heldOut: summarize(rows.filter((r) => r.heldOut)),
  perRepo: Object.fromEntries(
    repos.map((r) => [r, summarize(rows.filter((x) => x.repo === r))]),
  ),
  rows,
};
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  JSON.stringify(
    { all: result.all, heldOut: result.heldOut, perRepo: result.perRepo },
    null,
    2,
  ),
);
