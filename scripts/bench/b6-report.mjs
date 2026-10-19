#!/usr/bin/env node
/**
 * B6 real-agent A/B summary and published proof (plan P14, P13).
 *
 *   node scripts/bench/b6-report.mjs publish [--runs FILE]… [--prism-home DIR] [--not-run "host: reason"]
 *                                                            raw runs → docs/benchmarks/2.x.{json,md}
 *   node scripts/bench/b6-report.mjs check                   GATE-T4: the .md regenerates byte-identical
 *
 * Arm A is the host alone; arm B is the host plus the local Prism pack. Medians,
 * not means: a few long sessions dominate a mean. Spread is the interquartile
 * range (p25–p75) plus min–max. The value-line calibration (P13) fits tokens a
 * file read costs without Prism on one half of the tasks and checks the
 * estimate against the measured delta on the other half (±25%).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const RAW = join(repoRoot, "docs/benchmarks/2.x.json");
export const DOC = join(repoRoot, "docs/benchmarks/2.x.md");
/** Names that must never appear in the published proof (GATE-T3). */
export const PRIVATE_NAMES = [/rentmaadi/i];
export const PUBLIC_REPOS = new Set(["es-toolkit", "hono"]);
/** Hosts plan P14 requires in the B6 proof; a missing one fails at release. */
export const REQUIRED_HOSTS = ["Claude Code", "opencode"];

export const tokensOf = (r) =>
  r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite;

export function quantile(values, q) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function spread(values) {
  return {
    median: quantile(values, 0.5),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

export function armSummary(rows) {
  return {
    runs: rows.length,
    success: rows.length
      ? rows.filter((r) => r.success).length / rows.length
      : 0,
    tokens: spread(rows.map(tokensOf)),
    costUsd: spread(rows.map((r) => r.usage.costUsd ?? 0)),
    seconds: spread(rows.map((r) => r.durationMs / 1000)),
  };
}

const median = (v) => quantile(v, 0.5);

/**
 * Per task: measured saving = median tokens(A) − median tokens(B); Prism's
 * inputs = median tokensIn and filesCovered over that task's B runs.
 */
export function perTask(rows) {
  const ids = [...new Set(rows.map((r) => r.task))].sort();
  return ids.map((id) => {
    const a = rows.filter((r) => r.task === id && r.arm === "A");
    const b = rows.filter((r) => r.task === id && r.arm === "B");
    const withValue = b.filter((r) => r.prism);
    return {
      task: id,
      measuredSaved:
        (median(a.map(tokensOf)) ?? 0) - (median(b.map(tokensOf)) ?? 0),
      tokensIn: median(withValue.map((r) => r.prism.tokensIn)) ?? 0,
      filesCovered: median(withValue.map((r) => r.prism.filesCovered)) ?? 0,
    };
  });
}

/**
 * Fit tokens-per-file on `fit` tasks (Σ(saved + tokensIn) / Σ files), then
 * compare Σ estimate with Σ measured on `hold` tasks. Pass: within ±25%.
 */
export function calibrate(tasks) {
  const fit = tasks.filter((_, i) => i % 2 === 0);
  const hold = tasks.filter((_, i) => i % 2 === 1);
  const files = fit.reduce((s, t) => s + t.filesCovered, 0);
  if (files === 0) {
    return {
      tokensPerFile: null,
      pass: false,
      why: "Prism sent no files in arm B, nothing to calibrate",
    };
  }
  const tokensPerFile = Math.round(
    fit.reduce((s, t) => s + t.measuredSaved + t.tokensIn, 0) / files,
  );
  const estimated = hold.reduce(
    (s, t) => s + t.filesCovered * tokensPerFile - t.tokensIn,
    0,
  );
  const measured = hold.reduce((s, t) => s + t.measuredSaved, 0);
  const error =
    measured === 0 ? null : (estimated - measured) / Math.abs(measured);
  const physical = tokensPerFile > 0;
  const pass = physical && error !== null && Math.abs(error) <= 0.25;
  return {
    tokensPerFile,
    fitTasks: fit.length,
    holdTasks: hold.length,
    estimatedSaved: Math.round(estimated),
    measuredSaved: Math.round(measured),
    error,
    pass,
    why: pass
      ? "held-out estimate within ±25% of measured delta"
      : !physical
        ? "fitted tokens-per-file is not positive: arm B did not save tokens"
        : "held-out estimate outside ±25% of measured delta",
  };
}

export function summarize(raw) {
  const hosts = [...new Set(raw.runs.map((r) => r.host))].sort();
  const byHost = {};
  for (const host of hosts) {
    const rows = raw.runs.filter((r) => r.host === host);
    const a = armSummary(rows.filter((r) => r.arm === "A"));
    const b = armSummary(rows.filter((r) => r.arm === "B"));
    byHost[host] = {
      A: a,
      B: b,
      tokenRatio: a.tokens.median ? b.tokens.median / a.tokens.median : null,
      costRatio: a.costUsd.median ? b.costUsd.median / a.costUsd.median : null,
      calibration: calibrate(perTask(rows)),
    };
  }
  return { hosts, byHost };
}

const n0 = (v) => (v == null ? "–" : Math.round(v).toLocaleString("en-US"));
const usd = (v) => (v == null ? "–" : `$${v.toFixed(3)}`);
const sec = (v) => (v == null ? "–" : `${Math.round(v)} s`);
const sp = (s, f) =>
  `${f(s.median)} (IQR ${f(s.p25)}–${f(s.p75)}; ${f(s.min)}–${f(s.max)})`;

/** What the agent did, from transcripts: tool calls, Prism calls, injected context. */
function behaviour(rows) {
  const withT = rows.filter((r) => r.transcript);
  if (withT.length === 0) return [];
  const m = (arm, pick) =>
    quantile(withT.filter((r) => r.arm === arm).map(pick), 0.5);
  const inj = (r) => {
    const c = r.transcript.injectedChars;
    return c.promptHook + c.sessionHook + c.skills + c.mcpInstructions;
  };
  const used = withT.filter(
    (r) => r.arm === "B" && r.transcript.prismCalls > 0,
  ).length;
  const b = withT.filter((r) => r.arm === "B").length;
  return [
    "| Behaviour (median per session, from transcripts) | A | B |",
    "|---|---|---|",
    `| API calls | ${n0(m("A", (r) => r.transcript.apiCalls))} | ${n0(m("B", (r) => r.transcript.apiCalls))} |`,
    `| Tool calls | ${n0(m("A", (r) => r.transcript.toolCalls))} | ${n0(m("B", (r) => r.transcript.toolCalls))} |`,
    `| File reads / searches | ${n0(m("A", (r) => r.transcript.reads))} | ${n0(m("B", (r) => r.transcript.reads))} |`,
    `| Prism MCP calls | – | ${n0(m("B", (r) => r.transcript.prismCalls))} (${used}/${b} sessions used any) |`,
    `| Context injected by host config (chars: hooks, skills, MCP instructions) | ${n0(m("A", inj))} | ${n0(m("B", inj))} |`,
    "",
  ];
}

export function renderDoc(raw) {
  const sum = summarize(raw);
  const lines = [
    "---",
    "title: Real-agent benchmark (2.x)",
    'description: "Claude Code with and without Prism on public repos: tokens, cost, time and success."',
    "---",
    "",
    "# Prism 2.x real-agent benchmark (B6)",
    "",
    `Measured ${raw.measuredOn}. Model \`${raw.model}\`. ${raw.limitMinutes} minute limit per session, no token cap.`,
    "Public repos only: " +
      raw.repos.map((r) => `[${r.name}](${r.url})`).join(", ") +
      ".",
    "",
    "## Method",
    "",
    "- Tasks are real fix commits from the repos above. The fix's tests are applied on the parent commit, where they fail. The agent is told to make them pass without editing tests.",
    "- A session succeeds when those tests pass and the agent left the test files untouched.",
    "- Arm A is the host alone (no MCP servers, project settings only). Arm B is the same host plus the local Prism build (MCP server, hooks, skills). Same model, prompt and limit.",
    "- Each session runs in an isolated HOME. Sessions are shuffled with a fixed seed so arms share time-of-day effects.",
    "- Tokens are input + output + cache read + cache write, summed over every API call in the session transcript (each message counted once, subagents included). Cost is the host's reported session total (API-equivalent list price; this run used a subscription sign-in, so nothing was billed per token).",
    "- Medians with interquartile range and min–max. Raw per-session data: [`2.x.json`](./2.x.json).",
    "",
  ];
  for (const host of sum.hosts) {
    const h = sum.byHost[host];
    lines.push(
      `## ${host}`,
      "",
      "| | Without Prism (A) | With Prism (B) |",
      "|---|---|---|",
      `| Sessions | ${h.A.runs} | ${h.B.runs} |`,
      `| Success | ${(h.A.success * 100).toFixed(0)}% | ${(h.B.success * 100).toFixed(0)}% |`,
      `| Tokens, median | ${sp(h.A.tokens, n0)} | ${sp(h.B.tokens, n0)} |`,
      `| Cost, median | ${sp(h.A.costUsd, usd)} | ${sp(h.B.costUsd, usd)} |`,
      `| Wall time, median | ${sp(h.A.seconds, sec)} | ${sp(h.B.seconds, sec)} |`,
      "",
      `With / without, medians: tokens **${h.tokenRatio == null ? "–" : `${h.tokenRatio.toFixed(2)}×`}**, cost **${h.costRatio == null ? "–" : `${h.costRatio.toFixed(2)}×`}**.`,
      "",
      ...behaviour(raw.runs.filter((r) => r.host === host)),
      "### Value-line calibration (P13)",
      "",
      h.calibration.tokensPerFile == null
        ? `Not calibrated: ${h.calibration.why}.`
        : `Fitted on ${h.calibration.fitTasks} tasks: ${n0(h.calibration.tokensPerFile)} tokens per file read without Prism. ` +
            `Held-out ${h.calibration.holdTasks} tasks: estimated saving ${n0(h.calibration.estimatedSaved)} vs measured ${n0(h.calibration.measuredSaved)}` +
            `${h.calibration.error == null ? "" : ` (${(h.calibration.error * 100).toFixed(0)}%)`}. ` +
            `**${h.calibration.pass ? "Pass" : "Fail"}**: ${h.calibration.why}.`,
      "",
    );
  }
  const missing = REQUIRED_HOSTS.filter((h) => !sum.hosts.includes(h));
  if (missing.length > 0) {
    lines.push("## Not measured", "");
    for (const host of missing) {
      const why = (raw.notRun ?? []).find((n) => n.host === host)?.reason;
      lines.push(
        `- **${host}**: not run.${why ? ` ${why.replace(/\.?$/, ".")}` : ""}`,
      );
    }
    lines.push(
      "",
      `The release gate requires ${REQUIRED_HOSTS.join(" and ")}, so this proof does not pass it yet.`,
      "",
    );
  }
  lines.push(
    "## Per task (medians)",
    "",
    "| Host | Task | A tokens | B tokens | A success | B success |",
    "|---|---|---|---|---|---|",
  );
  for (const host of sum.hosts) {
    const rows = raw.runs.filter((r) => r.host === host);
    for (const id of [...new Set(rows.map((r) => r.task))].sort()) {
      const arm = (x) => rows.filter((r) => r.task === id && r.arm === x);
      const ok = (l) => `${l.filter((r) => r.success).length}/${l.length}`;
      lines.push(
        `| ${host} | ${id} | ${n0(median(arm("A").map(tokensOf)))} | ${n0(median(arm("B").map(tokensOf)))} | ${ok(arm("A"))} | ${ok(arm("B"))} |`,
      );
    }
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Re-read each arm-B session's final stop receipt from the isolated Prism home
 * (background checks rewrite it after the session ends). Matches on session
 * id; runs recorded before the harness kept ids match the receipt generated
 * inside that run's time window.
 */
export function enrichFromReceipts(rows, prismHome) {
  const receipts = [];
  const ws = join(prismHome, "workspaces");
  if (!existsSync(ws)) return rows;
  for (const w of readdirSync(ws)) {
    const dir = join(ws, w, "receipts");
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      try {
        const r = JSON.parse(readFileSync(join(dir, name), "utf8"));
        if (r.value)
          receipts.push({
            sessionId: r.sessionId,
            at: Date.parse(r.generatedAt),
            value: r.value,
          });
      } catch {
        /* a receipt being written is skipped */
      }
    }
  }
  return rows.map((row) => {
    if (row.arm !== "B") return row;
    const end = Date.parse(row.startedAt);
    const start = end - row.durationMs - 20_000;
    const mine = receipts.filter((r) =>
      row.sessionId
        ? r.sessionId === row.sessionId
        : r.at >= start && r.at <= end,
    );
    if (mine.length === 0)
      return { ...row, prism: { tokensIn: 0, filesCovered: 0, receipts: 0 } };
    const last = mine.sort((a, b) => a.at - b.at).at(-1).value;
    return {
      ...row,
      prism: {
        // Receipts no longer record tokensIn (the token ledger is gone).
        tokensIn: last.tokensIn ?? 0,
        filesCovered: last.filesCovered,
        receipts: mine.length,
      },
    };
  });
}

/** Raw runs (harness jsonl) → published JSON, without local paths or notes. */
/** The harness's host ids, as the proof names them. */
export const HOST_LABELS = {
  claude: "Claude Code",
  opencode: "opencode",
  agent: "Cursor agent CLI",
};

export function toRaw(rows, meta) {
  const runs = rows
    .filter((r) => PUBLIC_REPOS.has(r.repo))
    .map((r) => ({
      host: HOST_LABELS[r.host] ?? meta.host,
      task: r.task,
      repo: r.repo,
      arm: r.arm,
      run: r.run,
      model: r.model,
      durationMs: r.durationMs,
      timedOut: r.timedOut,
      testsPass: r.testsPass,
      testsUntouched: r.testsUntouched,
      success: r.success,
      usage: r.usage,
      ...(r.prism ? { prism: r.prism } : {}),
      ...(r.transcript ? { transcript: r.transcript } : {}),
    }))
    .sort((x, y) =>
      `${x.host}|${x.task}|${x.arm}|${x.run}`.localeCompare(
        `${y.host}|${y.task}|${y.arm}|${y.run}`,
      ),
    );
  return {
    schema: 1,
    measuredOn: meta.measuredOn,
    model: meta.model,
    limitMinutes: meta.limitMinutes,
    repos: [
      { name: "es-toolkit", url: "https://github.com/toss/es-toolkit" },
      { name: "hono", url: "https://github.com/honojs/hono" },
    ],
    ...(meta.notRun?.length ? { notRun: meta.notRun } : {}),
    runs,
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
const command = isMain ? process.argv[2] : undefined;
if (command === "publish") {
  // One --runs per host's file; each row names its own host.
  const files = process.argv
    .flatMap((a, k) => (a === "--runs" ? [process.argv[k + 1]] : []))
    .map((f) => resolve(f));
  if (files.length === 0)
    files.push(
      join(repoRoot, "plans/notes/benchmark-real-agents/runs-2x.jsonl"),
    );
  const h = process.argv.indexOf("--prism-home");
  const parsed = files.flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l)),
  );
  const rows =
    h === -1
      ? parsed
      : enrichFromReceipts(parsed, resolve(process.argv[h + 1]));
  const day =
    rows
      .map((r) => r.startedAt)
      .sort()
      .at(-1)
      ?.slice(0, 10) ?? "unknown";
  const notRun = [];
  for (let k = 0; k < process.argv.length; k++) {
    if (process.argv[k] !== "--not-run") continue;
    const [host, ...why] = String(process.argv[k + 1]).split(":");
    notRun.push({ host: host.trim(), reason: why.join(":").trim() });
  }
  const raw = toRaw(rows, {
    notRun,
    host: "Claude Code",
    measuredOn: day,
    model: [...new Set(rows.map((r) => r.model))].join(", ") || "unknown",
    limitMinutes: 10,
  });
  writeFileSync(RAW, `${JSON.stringify(raw, null, 2)}\n`);
  writeFileSync(DOC, renderDoc(raw));
  console.log(JSON.stringify(summarize(raw), null, 2));
} else if (command === "check") {
  if (!existsSync(RAW)) {
    console.error(`b6: ${RAW} missing`);
    process.exit(1);
  }
  const same =
    existsSync(DOC) &&
    readFileSync(DOC, "utf8") ===
      renderDoc(JSON.parse(readFileSync(RAW, "utf8")));
  console.log(
    same ? "b6: report matches raw JSON" : "b6: report differs from raw JSON",
  );
  process.exit(same ? 0 : 1);
} else if (command) {
  console.error("usage: b6-report.mjs publish [--runs FILE]… | check");
  process.exit(1);
}
