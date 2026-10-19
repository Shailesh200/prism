/**
 * Plan P14 release rules (GATE-T1..T4), pure so they can be tested. gate.mjs
 * reports them warn-only, or as failures with `--release`.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DOC,
  PRIVATE_NAMES,
  RAW,
  REQUIRED_HOSTS,
  renderDoc,
  summarize,
} from "./b6-report.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function releaseChecks({ b1, raw, doc }) {
  const out = [];
  const push = (id, fail, before, after, rule) =>
    out.push({ id, status: fail ? "fail" : "pass", before, after, rule });
  const t = b1?.totals;
  if (!t)
    out.push({
      id: "GATE-T1.B1ratio",
      status: "fail",
      why: "B1-orientation.json missing",
    });
  else {
    const ratio = t.withPrism.estimatedTokens / t.withoutPrism.estimatedTokens;
    push(
      "GATE-T1.B1ratio",
      ratio > 1,
      "≤ 1.00",
      Number(ratio.toFixed(2)),
      "release",
    );
  }
  if (!raw)
    out.push({
      id: "GATE-T2.B6",
      status: "fail",
      why: "docs/benchmarks/2.x.json missing",
    });
  else {
    const sum = summarize(raw);
    if (sum.hosts.length === 0)
      out.push({ id: "GATE-T2.B6", status: "fail", why: "no B6 sessions" });
    for (const host of REQUIRED_HOSTS) {
      if (sum.hosts.includes(host)) continue;
      const why = (raw.notRun ?? []).find((n) => n.host === host)?.reason;
      out.push({
        id: `GATE-T2.${host.replace(/\s+/g, "")}.missing`,
        status: "fail",
        why: `no ${host} B6 sessions${why ? ` (${why})` : ""}`,
      });
    }
    for (const host of sum.hosts) {
      const h = sum.byHost[host];
      const tag = host.replace(/\s+/g, "");
      push(
        `GATE-T2.${tag}.n`,
        Math.min(h.A.runs, h.B.runs) < 10,
        "≥ 10/arm",
        Math.min(h.A.runs, h.B.runs),
        "release",
      );
      push(
        `GATE-T2.${tag}.tokens`,
        h.B.tokens.median > h.A.tokens.median,
        h.A.tokens.median,
        h.B.tokens.median,
        "with ≤ without (median)",
      );
      push(
        `GATE-T2.${tag}.cost`,
        h.B.costUsd.median > h.A.costUsd.median,
        h.A.costUsd.median,
        h.B.costUsd.median,
        "with ≤ without (median)",
      );
      push(
        `GATE-T2.${tag}.success`,
        h.B.success < h.A.success,
        h.A.success,
        h.B.success,
        "with not lower",
      );
    }
    const text = `${JSON.stringify(raw)}\n${doc ?? ""}`;
    const leak = PRIVATE_NAMES.find((re) => re.test(text));
    push(
      "GATE-T3.publicOnly",
      Boolean(leak),
      "no private names",
      leak ? String(leak) : "none",
      "release",
    );
    push(
      "GATE-T4.regenerates",
      doc !== renderDoc(raw),
      "byte-identical",
      doc === renderDoc(raw) ? "same" : "differs",
      "release",
    );
  }
  return out;
}

/**
 * CLI: `node scripts/bench/release-gate.mjs [--current DIR]` runs only the
 * release rules and exits 1 on any failure. DIR holds the release run's
 * B1-orientation.json (default docs/benchmarks); a missing file fails.
 */
const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const i = process.argv.indexOf("--current");
  const dir = resolve(
    i === -1 ? join(repoRoot, "docs/benchmarks") : process.argv[i + 1],
  );
  const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
  const b1Text = read(join(dir, "B1-orientation.json"));
  const rawText = read(RAW);
  const results = releaseChecks({
    b1: b1Text ? JSON.parse(b1Text) : null,
    raw: rawText ? JSON.parse(rawText) : null,
    doc: read(DOC),
  });
  for (const r of results) {
    const detail = r.why ? r.why : `${r.before} → ${r.after} (${r.rule})`;
    console.log(`${r.status.padEnd(7)} ${r.id.padEnd(28)} ${detail}`);
  }
  const failed = results.filter((r) => r.status === "fail");
  console.log(
    failed.length
      ? `release-gate: FAIL (${failed.length}). Prism does not ship until these pass.`
      : "release-gate: pass",
  );
  process.exit(failed.length ? 1 : 0);
}
