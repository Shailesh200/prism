#!/usr/bin/env node
/**
 * Local regression gate (plan §9.7): compare a results directory against the
 * Phase 0 baseline (plans/notes/benchmarks/baseline). Exits 1 on any failure.
 *
 *   node scripts/bench/gate.mjs --current DIR [--baseline DIR]
 *
 * Rules (§9.7.2): top-3 or recall@pack drop > 1 pt; test-impact P or R drop
 * > 2 pts; replay catch rate drops at all or false-alarm rate rises; any hook
 * or freshness p95 rises > 15%; any budgets.json ceiling exceeded (bench:check
 * already enforces that, so it is reported, not re-derived); B1 tokens rise > 5%.
 * A file missing on either side is reported as "skipped", never as a pass.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? f : process.argv[i + 1];
};
const baseDir = resolve(arg("baseline", "plans/notes/benchmarks/baseline"));
const curDir = resolve(arg("current") ?? "");
if (!arg("current")) throw new Error("gate: --current DIR is required");

const load = (dir, file) =>
  existsSync(join(dir, file))
    ? JSON.parse(readFileSync(join(dir, file), "utf8"))
    : null;
const results = [];
const check = (id, file, pick, rule) => {
  const b = load(baseDir, file);
  const c = load(curDir, file);
  if (!b || !c)
    return results.push({
      id,
      status: "skipped",
      why: `${file} missing in ${!b ? "baseline" : "current"}`,
    });
  const before = pick(b);
  const after = pick(c);
  if (before == null || after == null)
    return results.push({ id, status: "skipped", why: "metric absent" });
  const fail = rule(before, after);
  results.push({
    id,
    status: fail ? "fail" : "pass",
    before,
    after,
    rule: rule.text,
  });
};
const drop = (pts) =>
  Object.assign((b, a) => b - a > pts, { text: `drop > ${pts} pt` });
const anyDrop = Object.assign((b, a) => a < b, { text: "any drop" });
const anyRise = Object.assign((b, a) => a > b, { text: "any rise" });
const riseBy = (frac) =>
  Object.assign((b, a) => a > b * (1 + frac), {
    text: `rise > ${frac * 100}%`,
  });

for (const file of ["B2-prepare-eval.json", "B4-golden.json"]) {
  const tag = file.split("-")[0];
  check(`${tag}.top3`, file, (r) => r.all.top3, drop(1));
  check(`${tag}.recallAtPack`, file, (r) => r.all.recallAtPack, drop(1));
  check(`${tag}.testPrecision`, file, (r) => r.all.testPrecision, drop(2));
  check(`${tag}.testRecall`, file, (r) => r.all.testRecall, drop(2));
}
check("B3.catchRate", "B3-replay.json", (r) => r.totals?.catchRate, anyDrop);
check(
  "B3.falseAlarmRate",
  "B3-replay.json",
  (r) => r.totals?.falseAlarmRate,
  anyRise,
);
for (const ev of ["prompt", "beforeEdit", "afterEdit", "stop"]) {
  check(
    `B8.${ev}.p95`,
    "B8-hook-latency.json",
    (r) => r.events?.[ev]?.p95,
    riseBy(0.15),
  );
}
check(
  "B5.editToVisible.p95",
  "B5-freshness.json",
  (r) => r.editToVisible?.p95,
  riseBy(0.15),
);
check(
  "B5.warmPrepare.p95",
  "B5-freshness.json",
  (r) => r.warmPrepare800?.p95,
  riseBy(0.15),
);
check(
  "B1.withPrismTokens",
  "B1-orientation.json",
  (r) => r.totals?.withPrism?.estimatedTokens,
  riseBy(0.05),
);
check(
  "B7.changeRecall",
  "B7-classifier.json",
  (r) => r.combined?.changeRecall,
  anyDrop,
);
check(
  "B7.questionFP",
  "B7-classifier.json",
  (r) => r.combined?.questionFalsePositive,
  anyRise,
);

// C-14 absolute budgets (owner-approved 2026-10-14): ceilings on the current
// run, independent of the baseline.
const ceiling = (id, file, pick, max, unit) => {
  const c = load(curDir, file);
  const after = c ? pick(c) : undefined;
  if (after == null)
    return results.push({ id, status: "skipped", why: "metric absent" });
  results.push({
    id,
    status: after > max ? "fail" : "pass",
    before: `≤ ${max}${unit}`,
    after,
    rule: "C-14 ceiling",
  });
};
ceiling(
  "C14.prompt.p95",
  "B8-hook-latency.json",
  (r) => r.events?.prompt?.p95,
  4500,
  " ms",
);
ceiling(
  "C14.stop.p95",
  "B8-hook-latency.json",
  (r) => r.events?.stop?.p95,
  2500,
  " ms",
);
ceiling(
  "C14.mediumRss",
  "B9-budgets.json",
  (r) => r.peakRssBytes,
  1717986918,
  " B",
);

for (const r of results) {
  const detail =
    r.status === "skipped" ? r.why : `${r.before} → ${r.after} (${r.rule})`;
  console.log(`${r.status.padEnd(7)} ${r.id.padEnd(24)} ${detail}`);
}
const failed = results.filter((r) => r.status === "fail");
console.log(
  `gate: ${failed.length ? `FAIL (${failed.length})` : "pass"}; ${results.filter((r) => r.status === "skipped").length} skipped`,
);
process.exit(failed.length ? 1 : 0);
