#!/usr/bin/env node
/**
 * B8-checkout (token fix 2): the prompt hook right after a `git checkout`,
 * the way the B6 harness and a branch switch hit it. For each task in the A/B
 * task list it moves the scratch clone to that task (parent commit + the
 * fix's tests, committed), fires the session hook and then the prompt hook
 * with the task's real prompt, and records wall time (process spawn
 * included) and whether a Prepare pack was injected.
 *
 *   node scripts/bench/prompt-checkout.mjs --repo DIR [--repo DIR2] [--rounds 2] [--delay-ms 0] [--out FILE]
 *     [--settle] [--stop] [--gap-ms 30000]
 *
 * `--settle` waits the way the B6 harness does before a session (index fresh,
 * then an idle daemon). `--stop` ends each task like a real session: the fix's
 * source files are applied and the stop hook fires, so its background checks
 * run while the next task's prompt arrives `--gap-ms` later (round 2 item 1).
 * Each row records why a prompt got no pack (the hook's own event).
 *
 * Uses a fresh PRISM_HOME under the system temp dir, starts the local daemon,
 * and stops it at the end. The clones must be scratch clones (B6 work dir):
 * the script runs `git checkout -f` and `git commit` in them.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hook = join(repoRoot, "packages/plugin/hooks/prism-hook.mjs");
const bin = join(repoRoot, "packages/mcp-server/dist/bin.js");
const tasksFile = join(
  repoRoot,
  "plans/notes/benchmark-real-agents/tasks.json",
);

const argv = process.argv.slice(2);
const all = (flag) =>
  argv.flatMap((a, i) => (a === `--${flag}` ? [argv[i + 1]] : []));
const one = (flag, fallback) => all(flag)[0] ?? fallback;
const repos = all("repo").map((r) => resolve(r));
if (repos.length === 0) throw new Error("prompt-checkout: --repo is required");
const rounds = Number(one("rounds", "2"));
const delayMs = Number(one("delay-ms", "0"));
const settle = argv.includes("--settle");
const stopEach = argv.includes("--stop");
const gapMs = Number(one("gap-ms", "30000"));

const home = mkdtempSync(join(tmpdir(), "prism-b8co-"));
const env = {
  ...process.env,
  PRISM_HOME: home,
  PRISM_DAEMON: "1",
  PRISM_HOOKS: "1",
  PRISM_AUTOPREPARE: "1",
};
delete env.VITEST;

function git(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** Same moves as agent-ab.ts resetTask, minus the install. */
function moveTo(dir, task) {
  git(dir, ["checkout", "-q", "-f", "--detach", task.parent]);
  git(dir, [
    "clean",
    "-fdq",
    "-e",
    ".yarn",
    "-e",
    "node_modules",
    "-e",
    ".pnp.cjs",
    "-e",
    ".pnp.loader.mjs",
  ]);
  git(dir, ["checkout", task.fix, "--", ...task.tests]);
  git(dir, ["add", "--", ...task.tests]);
  git(dir, [
    "-c",
    "user.email=prism-bench@local",
    "-c",
    "user.name=prism-bench",
    "commit",
    "-q",
    "-m",
    "task tests",
  ]);
}

function promptFor(task) {
  return [
    "Tests listed below fail on this checkout. Fix the source so they pass.",
    "Do not edit test files, snapshots, or skip any test. Do not push or open a pull request.",
    "Stop when those tests pass.",
    "",
    "Failing tests:",
    ...task.tests.map((t) => `- ${t}`),
  ].join("\n");
}

function fire(dir, event, input) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [hook, event], {
    cwd: dir,
    env,
    input: JSON.stringify({ cwd: dir, ...input }),
    encoding: "utf8",
    timeout: 30_000,
  });
  const ms = performance.now() - t0;
  let context = "";
  try {
    context =
      JSON.parse(r.stdout || "{}")?.hookSpecificOutput?.additionalContext ?? "";
  } catch {
    context = "";
  }
  return { ms, context };
}

/** The prompt hook's own reason for its last answer (events.jsonl). */
function lastPromptReason() {
  try {
    const lines = readFileSync(join(home, "events.jsonl"), "utf8")
      .trim()
      .split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const row = JSON.parse(lines[i]);
      if (row.event === "hook.prompt")
        return row.reason ?? row.detail?.said ?? "";
    }
  } catch {
    return "";
  }
  return "";
}

async function daemonGet(path, timeoutMs = 2000) {
  try {
    const rec = JSON.parse(
      readFileSync(join(home, "daemon", "daemon.json"), "utf8"),
    );
    const res = await fetch(`http://127.0.0.1:${rec.port}${path}`, {
      headers: { Authorization: `Bearer ${rec.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200 ? await res.json() : null;
  } catch {
    return null;
  }
}

/** agent-ab.ts waitForIndex: fresh index, 2.5 s, then a health answer within 300 ms. */
async function settleLikeAb(dir, since) {
  const begun = Date.now();
  await new Promise((r) => setTimeout(r, 1500));
  while (Date.now() - begun < 90_000) {
    const status = (await daemonGet("/v1/status"))?.value;
    const rows = Array.isArray(status) ? status : (status?.workspaces ?? []);
    const row = rows.find((w) => resolve(w.root) === resolve(dir));
    const at = row?.lastIndexedAt ? Date.parse(row.lastIndexedAt) : 0;
    if (
      row?.state === "fresh" &&
      row.pendingDirtyCount === 0 &&
      (at >= since || Date.now() - begun > 10_000)
    )
      break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 2500));
  while (Date.now() - begun < 90_000) {
    if ((await daemonGet("/v1/health", 300))?.ok) break;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** A session's end: the fix's source files land, then the stop hook fires. */
function endSession(dir, task, session) {
  const sources = git(dir, [
    "diff-tree",
    "--no-commit-id",
    "-r",
    "--name-only",
    task.fix,
  ])
    .split("\n")
    .filter((p) => p && !task.tests.includes(p));
  if (sources.length) git(dir, ["checkout", task.fix, "--", ...sources]);
  return fire(dir, "stop", { session_id: session, stop_hook_active: false });
}

const q = (xs, p) => {
  const s = xs.toSorted((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0);
};

const { tasks } = JSON.parse(readFileSync(tasksFile, "utf8"));
const out = openSync(join(home, "daemon.log"), "a");
const daemon = spawn(process.execPath, [bin, "--daemon", "--warm", repos[0]], {
  detached: true,
  stdio: ["ignore", out, out],
  env,
});
daemon.unref();

// Warm: the first index of every repo, as a real session would already have.
for (const dir of repos) {
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  void head;
  for (let i = 0; i < 60; i += 1) {
    const r = fire(dir, "prompt", {
      session_id: `warm-${i}`,
      prompt: "fix the bug in src/index.ts",
    });
    if (r.context.includes("Prism · prepare (auto)")) break;
    await new Promise((d) => setTimeout(d, 1000));
  }
}

const samples = [];
// A crash must not leave the daemon running.
try {
  for (let round = 1; round <= rounds; round += 1) {
    for (const task of tasks) {
      const dir = repos.find((r) => basename(r) === task.repo);
      if (!dir) continue;
      const movedAt = Date.now();
      moveTo(dir, task);
      if (delayMs > 0) await new Promise((d) => setTimeout(d, delayMs));
      if (settle) await settleLikeAb(dir, movedAt);
      const session = `b8co-${round}-${task.id}`;
      const start = fire(dir, "session", {
        session_id: session,
        source: "startup",
      });
      const prompt = fire(dir, "prompt", {
        session_id: session,
        prompt: promptFor(task),
      });
      const reason = lastPromptReason();
      const injected = prompt.context.includes("Prism · files for this task");
      // Round 2: a deliberate "say nothing" (not sure, prompt names the
      // files) is an answer; a timeout or a busy daemon is not.
      const answered = injected || reason.startsWith("said nothing");
      const stale = /index updating/i.test(prompt.context.split("\n")[0] ?? "");
      const firstFile = injected
        ? (prompt.context.split("\n")[1]?.replace(/^- /, "").split(":")[0] ??
          null)
        : null;
      samples.push({
        task: task.id,
        round,
        sessionMs: Math.round(start.ms),
        promptMs: Math.round(prompt.ms),
        injected,
        answered,
        stale,
        chars: prompt.context.length,
        firstFile,
        ...(injected ? {} : { reason }),
      });
      console.log(
        `${task.id} r${round} prompt ${Math.round(prompt.ms)}ms injected=${injected} answered=${answered} stale=${stale} chars=${prompt.context.length} first=${firstFile}${injected ? "" : ` reason=${reason}`}`,
      );
      if (stopEach) {
        endSession(dir, task, session);
        await new Promise((d) => setTimeout(d, gapMs));
      }
    }
  }
} finally {
  try {
    const rec = JSON.parse(
      readFileSync(join(home, "daemon", "daemon.json"), "utf8"),
    );
    await fetch(`http://127.0.0.1:${rec.port}/v1/stop`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${rec.token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch (error) {
    console.error(`prompt-checkout: could not stop the daemon: ${error}`);
  }
}

const ms = samples.map((s) => s.promptMs);
const result = {
  benchmark: "B8-checkout",
  recordedAt: new Date().toISOString(),
  node: process.version,
  repos,
  delayMs,
  settle,
  stopEach,
  gapMs,
  samples: samples.length,
  prompt: { p50: q(ms, 0.5), p95: q(ms, 0.95), max: Math.max(...ms) },
  session: {
    p95: q(
      samples.map((s) => s.sessionMs),
      0.95,
    ),
  },
  injectedRate:
    samples.filter((s) => s.injected).length / Math.max(1, samples.length),
  answeredRate:
    samples.filter((s) => s.answered).length / Math.max(1, samples.length),
  staleRate:
    samples.filter((s) => s.stale).length / Math.max(1, samples.length),
  misses: Object.entries(
    Object.groupBy(
      samples.filter((s) => !s.injected),
      (s) => (s.reason ?? "").replace(/\d+ms/, "Nms"),
    ),
  ).map(([reason, rows]) => ({ reason, count: rows.length })),
  medianChars: q(
    samples.map((s) => s.chars),
    0.5,
  ),
  home,
  rows: samples,
};
const file = one("out");
if (file) writeFileSync(resolve(file), `${JSON.stringify(result, null, 2)}\n`);
const { rows: _rows, ...summary } = result;
console.log(JSON.stringify(summary, null, 2));
