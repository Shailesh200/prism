#!/usr/bin/env node
/**
 * B8 hook latency (plan §9.6): wall time of each hook event as the client
 * sees it (process spawn included), run against the LOCAL build.
 *
 *   node scripts/bench/hook-latency.mjs --repo DIR --file src/x.ts [--runs 20] [--stop-runs 5] [--out FILE]
 *
 * The repo should be a scratch clone: the after-edit and stop samples append a
 * comment to --file and restore it afterwards. Uses the caller's HOME, so run
 * it with an isolated HOME.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { userInfo } from "node:os";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hook = join(repoRoot, "packages/plugin/hooks/prism-hook.mjs");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? f : process.argv[i + 1];
};
const repo = resolve(arg("repo"));
const file = arg("file");
if (!repo || !file)
  throw new Error("hook-latency: --repo and --file are required");
// The session hook can refresh ~/.claude hooks: never on the real home.
for (const key of ["HOME", "PRISM_HOME"]) {
  const value = process.env[key];
  const real = userInfo().homedir;
  if (
    !value ||
    resolve(value) === real ||
    resolve(value).startsWith(`${real}/`)
  )
    throw new Error(
      `hook-latency: set ${key} to a throwaway folder (HOME=$(mktemp -d)), not the real home`,
    );
}
const runs = Number(arg("runs", "20"));
const stopRuns = Number(arg("stop-runs", "5"));
const abs = join(repo, file);
const original = readFileSync(abs, "utf8");

function fire(event, input) {
  const t0 = performance.now();
  const child = spawnSync(process.execPath, [hook, event], {
    cwd: repo,
    input: JSON.stringify({ session_id: "bench-b8", cwd: repo, ...input }),
    encoding: "utf8",
    timeout: 120_000,
  });
  const ms = performance.now() - t0;
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`hook ${event} exited ${child.status}: ${child.stderr}`);
  return { ms, out: child.stdout.trim() };
}
const q = (xs, p) => {
  const s = xs.toSorted((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))]);
};
const series = (name, n, make) => {
  const ms = [];
  const outcomes = {};
  for (let i = 0; i < n; i++) {
    const r = fire(name, make(i));
    ms.push(r.ms);
    const key = r.out ? "output" : "empty";
    outcomes[key] = (outcomes[key] ?? 0) + 1;
  }
  return {
    samples: n,
    p50: q(ms, 0.5),
    p95: q(ms, 0.95),
    max: Math.round(Math.max(...ms)),
    outcomes,
  };
};

const result = {
  benchmark: "B8-hook-latency",
  recordedAt: new Date().toISOString(),
  repo,
  file,
  events: {},
};
try {
  result.events.session = series("session", 3, () => ({ source: "startup" }));
  result.events.prompt = series("prompt", runs, () => ({
    prompt: `fix the edge case in ${file}`,
  }));
  result.events.beforeEdit = series("before-edit", runs, () => ({
    tool_name: "Edit",
    tool_input: { file_path: abs },
  }));
  result.events.afterEdit = series("after-edit", runs, (i) => {
    writeFileSync(abs, `${original}\n// b8 ${i}\n`);
    return { tool_name: "Edit", tool_input: { file_path: abs } };
  });
  result.events.stop = series("stop", stopRuns, () => ({
    stop_hook_active: false,
  }));
} finally {
  writeFileSync(abs, original);
}
const out = arg("out");
if (out) writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result.events, null, 2));
