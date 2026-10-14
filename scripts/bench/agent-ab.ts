/**
 * Real-agent A/B (M-098).
 *
 * Arm A is Claude Code with repo settings only. Arm B is the same plus the
 * Prism dev pack (hooks, skills, local MCP). Same model, same prompt, same
 * time limit. There is no token cap: the owner asked for the run without one.
 * A wall-clock limit keeps a hung session from making the arms incomparable.
 *
 *   node scripts/bench/agent-ab.ts prepare
 *   node scripts/bench/agent-ab.ts run
 *
 * `prepare` keeps a commit only when a test file it touched fails on its
 * parent and passes on the commit. `run` appends one JSON line per session
 * so a stop does not lose earlier results.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = "/tmp/prism-ab";
const TASKS = join(repoRoot, "plans/notes/benchmark-real-agents/tasks.json");
const RUNS = join(repoRoot, "plans/notes/benchmark-real-agents/runs.jsonl");
const REPORT = join(repoRoot, "plans/notes/benchmark-real-agents.md");
const PACK = join(repoRoot, "packages/plugin/dist/dev-pack");
const MODEL = "claude-opus-5-5";
const RUN_MINUTES = 10;
const PER_REPO = 8;
const EXAMINE = 40;

const REPOS = [
  { name: "es-toolkit", url: "https://github.com/toss/es-toolkit.git" },
  { name: "hono", url: "https://github.com/honojs/hono.git" },
];

type Task = {
  id: string;
  repo: string;
  fix: string;
  parent: string;
  subject: string;
  tests: string[];
  testArgs: string[];
  /** Install the tests were actually run against. */
  modules: string;
};

type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number | null;
};

type RunRecord = {
  task: string;
  repo: string;
  arm: "A" | "B";
  run: number;
  model: string;
  startedAt: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
  testsPass: boolean;
  testsUntouched: boolean;
  success: boolean;
  usage: Usage;
  note: string;
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}

function git(cwd: string, args: string[]): string {
  const res = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  if (res.status !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
  return res.stdout ?? "";
}

const TEST = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function filesOf(cwd: string, sha: string): string[] {
  return git(cwd, ["diff-tree", "--no-commit-id", "-r", "--name-only", sha])
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const res = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64_000_000,
    env: {
      ...process.env,
      CI: "1",
      HUSKY: "0",
      FORCE_COLOR: "0",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    },
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: `${res.stderr ?? ""}`,
  };
}

function lockHash(cwd: string): string {
  const names = [
    "yarn.lock",
    "pnpm-lock.yaml",
    "package-lock.json",
    "bun.lock",
  ];
  const hash = createHash("sha256");
  for (const name of names) {
    const path = join(cwd, name);
    if (existsSync(path)) hash.update(readFileSync(path));
  }
  return hash.digest("hex").slice(0, 16);
}

function install(cwd: string): boolean {
  const exec = (cmd: string, args: string[]) =>
    run(cmd, args, cwd, 15 * 60_000).status === 0;
  if (existsSync(join(cwd, "yarn.lock"))) {
    return exec("corepack", ["yarn", "install", "--immutable"]);
  }
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return exec("corepack", ["pnpm", "install", "--frozen-lockfile"]);
  }
  return exec("npm", ["ci", "--no-audit", "--no-fund"]);
}

/** How to run one test file. Coverage and the typecheck prefix are dropped. */
function testArgs(cwd: string, tests: string[]): string[] | null {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
    scripts?: { test?: string };
  };
  const script = pkg.scripts?.test ?? "";
  if (script.includes("vitest"))
    return ["exec", "vitest", "run", "--coverage.enabled=false", ...tests];
  if (script.includes("vp test"))
    return ["exec", "vp", "test", "--run", ...tests];
  return null;
}

function testsResult(cwd: string, args: string[]): "pass" | "fail" | "none" {
  const cmd = existsSync(join(cwd, "yarn.lock"))
    ? "yarn"
    : existsSync(join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : "npx";
  const bin = cmd === "npx" ? "npx" : "corepack";
  const full = cmd === "npx" ? ["vitest", "run", ...args] : [cmd, ...args];
  const result = run(bin, full, cwd, 180_000);
  const text = `${result.stdout}\n${result.stderr}`;
  if (/no test files found|No test files found/i.test(text)) return "none";
  return result.status === 0 ? "pass" : "fail";
}

function prepare(): void {
  const tasks: Task[] = [];
  for (const repo of REPOS) {
    const cwd = join(WORK, "repos", repo.name);
    if (!existsSync(join(cwd, ".git"))) {
      console.log(`missing clone ${cwd}`);
      continue;
    }
    const log = git(cwd, [
      "log",
      "--no-merges",
      "-n",
      "600",
      "--format=%H%x1f%s",
    ]);
    const commits = log
      .split("\n")
      .filter(Boolean)
      .map((row) => {
        const [sha = "", subject = ""] = row.split("\x1f");
        return { sha, subject };
      })
      .filter((c) => /^fix(\(|:|\s)/i.test(c.subject));

    let examined = 0;
    let kept = 0;
    let installed: string | null = null;
    for (const commit of commits) {
      if (examined >= EXAMINE || kept >= PER_REPO) break;
      const changed = filesOf(cwd, commit.sha);
      const tests = changed.filter((p) => TEST.test(p) && SOURCE.test(p));
      const sources = changed.filter((p) => SOURCE.test(p) && !TEST.test(p));
      if (
        tests.length === 0 ||
        tests.length > 4 ||
        sources.length === 0 ||
        sources.length > 8
      ) {
        continue;
      }
      examined += 1;
      git(cwd, ["checkout", "-q", "-f", "--detach", commit.sha]);
      const hash = lockHash(cwd);
      if (hash !== installed) {
        console.log(`${repo.name}: install @ ${commit.sha.slice(0, 8)}`);
        if (!install(cwd)) {
          console.log("  install failed, skip");
          continue;
        }
        installed = hash;
      }
      const args = testArgs(cwd, tests);
      if (!args) continue;
      const parent = git(cwd, ["rev-parse", `${commit.sha}^`]).trim();
      // The fix's tests, applied on the parent, are what the agent has to turn green.
      git(cwd, ["checkout", "-q", "-f", "--detach", parent]);
      git(cwd, ["checkout", commit.sha, "--", ...tests]);
      const onParent = testsResult(cwd, args);
      git(cwd, ["checkout", "-q", "-f", "--detach", commit.sha]);
      const onFix = testsResult(cwd, args);
      console.log(
        `  ${commit.sha.slice(0, 8)} fix=${onFix} parent=${onParent} ${commit.subject.slice(0, 70)}`,
      );
      if (onFix === "pass" && onParent === "fail") {
        kept += 1;
        tasks.push({
          id: `${repo.name}-${commit.sha.slice(0, 8)}`,
          repo: repo.name,
          fix: commit.sha,
          parent,
          subject: commit.subject,
          tests,
          testArgs: args,
          modules: hash,
        });
      }
    }
    console.log(`${repo.name}: kept ${kept} of ${examined} examined`);
  }
  mkdirSync(dirname(TASKS), { recursive: true });
  writeFileSync(TASKS, `${JSON.stringify({ model: MODEL, tasks }, null, 2)}\n`);
  console.log(`wrote ${tasks.length} tasks to ${TASKS}`);
}

function promptFor(task: Task): string {
  return [
    "Tests listed below fail on this checkout. Fix the source so they pass.",
    "Do not edit test files, snapshots, or skip any test. Do not push or open a pull request.",
    "Stop when those tests pass.",
    "",
    "Failing tests:",
    ...task.tests.map((t) => `- ${t}`),
  ].join("\n");
}

function claudeEnv(arm: "A" | "B"): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    HUSKY: "0",
    PRISM_DAEMON: arm === "B" ? "1" : "0",
    PRISM_HOOKS: arm === "B" ? "1" : "0",
    PRISM_AUTOPREPARE: arm === "B" ? "1" : "0",
  };
  return env;
}

function claudeArgs(arm: "A" | "B", prompt: string): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--permission-mode",
    "bypassPermissions",
    "--dangerously-skip-permissions",
    "--setting-sources",
    "project",
    "--model",
    MODEL,
  ];
  if (arm === "A") args.push("--strict-mcp-config");
  else {
    // --plugin-dir is variadic, so it has to come after every other flag.
    args.push("--mcp-config", join(PACK, "mcp.json"), "--plugin-dir", PACK);
  }
  args.push("--", prompt);
  return args;
}

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: null };
}

function usageFrom(stdout: string): { usage: Usage; model: string } {
  const usage = emptyUsage();
  let model = MODEL;
  try {
    const parsed = JSON.parse(stdout) as {
      total_cost_usd?: number;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
      modelUsage?: Record<string, { costUSD?: number }>;
    };
    usage.input = parsed.usage?.input_tokens ?? 0;
    usage.output = parsed.usage?.output_tokens ?? 0;
    usage.cacheRead = parsed.usage?.cache_read_input_tokens ?? 0;
    usage.cacheWrite = parsed.usage?.cache_creation_input_tokens ?? 0;
    usage.costUsd =
      typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null;
    model = Object.keys(parsed.modelUsage ?? {})[0] ?? MODEL;
  } catch {
    /* a killed run may leave no JSON */
  }
  return { usage, model };
}

function workDir(task: Task): string {
  return join(WORK, "repos", task.repo);
}

/** Parent commit, plus the fix's tests, with the install those tests were run against. */
function resetTask(task: Task): void {
  const dir = workDir(task);
  const stamp = join(WORK, `stamp-${task.repo}`);
  const current = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "";
  if (current !== task.modules) {
    git(dir, ["checkout", "-q", "-f", "--detach", task.fix]);
    if (!install(dir)) throw new Error(`install failed for ${task.id}`);
    writeFileSync(stamp, task.modules);
  }
  git(dir, ["checkout", "-q", "-f", "--detach", task.parent]);
  git(dir, [
    "clean",
    "-fd",
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
  // The tests are part of the task, so they belong to HEAD. Anything the agent
  // does to them afterwards is then visible in the diff.
  git(dir, ["add", "--", ...task.tests]);
  const staged = git(dir, ["diff", "--cached", "--name-only"]).trim();
  if (staged) {
    spawnSync(
      "git",
      [
        "-C",
        dir,
        "-c",
        "user.email=prism-bench@local",
        "-c",
        "user.name=prism-bench",
        "commit",
        "-q",
        "-m",
        "task tests",
      ],
      { encoding: "utf8" },
    );
  }
}

function testsUntouched(dir: string, tests: string[]): boolean {
  const dirty = git(dir, ["diff", "--name-only", "HEAD"]).split("\n");
  const untracked = git(dir, [
    "ls-files",
    "--others",
    "--exclude-standard",
  ]).split("\n");
  const changed = new Set(
    [...dirty, ...untracked].map((p) => p.trim()).filter(Boolean),
  );
  return tests.every((t) => !changed.has(t));
}

async function oneRun(
  task: Task,
  arm: "A" | "B",
  runIndex: number,
): Promise<RunRecord> {
  console.log(`\n${task.id} arm ${arm} run ${runIndex}`);
  resetTask(task);
  const dir = workDir(task);
  const session = await new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
    durationMs: number;
  }>((done) => {
    const started = Date.now();
    const child = spawn("claude", claudeArgs(arm, promptFor(task)), {
      cwd: dir,
      env: claudeEnv(arm),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, RUN_MINUTES * 60_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      done({
        status,
        stdout,
        stderr: stderr.slice(0, 500),
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
  const { usage, model } = usageFrom(session.stdout);
  let pass = false;
  let untouched = true;
  let note = session.timedOut
    ? "timed out"
    : session.status !== 0
      ? session.stderr.replace(/\s+/g, " ").slice(0, 180)
      : "";
  try {
    untouched = testsUntouched(dir, task.tests);
    pass = testsResult(dir, task.testArgs) === "pass";
    if (!untouched) note = note || "edited a test file";
  } catch (error) {
    note =
      error instanceof Error ? error.message.slice(0, 200) : "test run threw";
  }
  const record: RunRecord = {
    task: task.id,
    repo: task.repo,
    arm,
    run: runIndex,
    model,
    startedAt: new Date().toISOString(),
    durationMs: session.durationMs,
    timedOut: session.timedOut,
    exitCode: session.status,
    testsPass: pass,
    testsUntouched: untouched,
    success: pass && untouched && !session.timedOut,
    usage,
    note,
  };
  console.log(
    `  ${record.success ? "pass" : "fail"} ${Math.round(record.durationMs / 1000)}s ` +
      `in=${usage.input + usage.cacheRead + usage.cacheWrite} out=${usage.output} ${note}`,
  );
  return record;
}

function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Percentile bootstrap of the difference mean(B) − mean(A). */
function ci(
  a: number[],
  b: number[],
): { low: number; high: number; diff: number } {
  const diff = mean(b) - mean(a);
  if (a.length === 0 || b.length === 0) return { low: diff, high: diff, diff };
  const diffs: number[] = [];
  let state = 7;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
  for (let i = 0; i < 2000; i += 1) {
    const as = a.map(() => a[Math.floor(rand() * a.length)]!);
    const bs = b.map(() => b[Math.floor(rand() * b.length)]!);
    diffs.push(mean(bs) - mean(as));
  }
  diffs.sort((x, y) => x - y);
  return { low: diffs[50] ?? diff, high: diffs[1949] ?? diff, diff };
}

function tokens(row: RunRecord): number {
  return (
    row.usage.input +
    row.usage.output +
    row.usage.cacheRead +
    row.usage.cacheWrite
  );
}

function writeReport(rows: RunRecord[]): void {
  const arm = (name: "A" | "B") => rows.filter((r) => r.arm === name);
  const a = arm("A");
  const b = arm("B");
  const rate = (list: RunRecord[]) =>
    list.length === 0 ? 0 : list.filter((r) => r.success).length / list.length;
  const success = ci(
    a.map((r) => (r.success ? 1 : 0)),
    b.map((r) => (r.success ? 1 : 0)),
  );
  const tok = ci(a.map(tokens), b.map(tokens));
  const time = ci(
    a.map((r) => r.durationMs / 1000),
    b.map((r) => r.durationMs / 1000),
  );
  const cost = ci(
    a.map((r) => r.usage.costUsd ?? 0),
    b.map((r) => r.usage.costUsd ?? 0),
  );
  const lines = [
    "# Real-agent proof",
    "",
    `Generated ${new Date().toISOString()}. Model ${MODEL}. ${RUN_MINUTES} minute limit per run. No token cap.`,
    "Arm A is Claude Code alone. Arm B is Claude Code plus the Prism dev pack.",
    "A run succeeds when the tests that failed on the parent commit pass, and the agent did not edit those test files.",
    "Differences are B − A. The interval is a 95% bootstrap and excludes zero only when it is entirely above or below zero.",
    "",
    `| | Arm A | Arm B | B − A (95% CI) |`,
    `|---|---|---|---|`,
    `| Runs | ${a.length} | ${b.length} | |`,
    `| Success | ${(rate(a) * 100).toFixed(0)}% | ${(rate(b) * 100).toFixed(0)}% | ${(success.diff * 100).toFixed(1)} pp (${(success.low * 100).toFixed(1)} to ${(success.high * 100).toFixed(1)}) |`,
    `| Tokens, mean | ${Math.round(mean(a.map(tokens))).toLocaleString()} | ${Math.round(mean(b.map(tokens))).toLocaleString()} | ${Math.round(tok.diff).toLocaleString()} (${Math.round(tok.low).toLocaleString()} to ${Math.round(tok.high).toLocaleString()}) |`,
    `| Seconds, mean | ${Math.round(mean(a.map((r) => r.durationMs / 1000)))} | ${Math.round(mean(b.map((r) => r.durationMs / 1000)))} | ${time.diff.toFixed(0)} (${time.low.toFixed(0)} to ${time.high.toFixed(0)}) |`,
    `| USD, mean | ${mean(a.map((r) => r.usage.costUsd ?? 0)).toFixed(2)} | ${mean(b.map((r) => r.usage.costUsd ?? 0)).toFixed(2)} | ${cost.diff.toFixed(2)} (${cost.low.toFixed(2)} to ${cost.high.toFixed(2)}) |`,
    "",
    "## Per run",
    "",
    "| Task | Arm | Run | Success | Seconds | Tokens | Note |",
    "|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.task} | ${r.arm} | ${r.run} | ${r.success ? "yes" : "no"} | ${Math.round(r.durationMs / 1000)} | ${tokens(r).toLocaleString()} | ${r.note.replace(/\|/g, "/")} |`,
    ),
    "",
  ];
  writeFileSync(REPORT, lines.join("\n"));
}

async function runAll(): Promise<void> {
  if (!existsSync(TASKS))
    throw new Error(`no tasks at ${TASKS}; run prepare first`);
  if (!existsSync(join(PACK, "mcp.json")))
    throw new Error(`no dev pack at ${PACK}`);
  const { tasks } = JSON.parse(readFileSync(TASKS, "utf8")) as {
    tasks: Task[];
  };
  const runs = Number(arg("--runs") ?? "3");
  const jobs: { task: Task; arm: "A" | "B"; run: number }[] = [];
  for (const task of tasks) {
    for (let runIndex = 1; runIndex <= runs; runIndex += 1) {
      jobs.push(
        { task, arm: "A", run: runIndex },
        { task, arm: "B", run: runIndex },
      );
    }
  }
  const order = shuffle(jobs, 98);
  mkdirSync(dirname(RUNS), { recursive: true });
  const done = existsSync(RUNS)
    ? readFileSync(RUNS, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RunRecord)
    : [];
  const seen = new Set(done.map((r) => `${r.task}:${r.arm}:${r.run}`));
  console.log(`${order.length} sessions, ${seen.size} already recorded`);
  for (const job of order) {
    const key = `${job.task.id}:${job.arm}:${job.run}`;
    if (seen.has(key)) continue;
    const record = await oneRun(job.task, job.arm, job.run);
    appendFileSync(RUNS, `${JSON.stringify(record)}\n`);
    done.push(record);
    writeReport(done);
  }
  writeReport(done);
  console.log(`report ${REPORT}`);
}

const command = process.argv[2];
if (command === "prepare") prepare();
else if (command === "run") await runAll();
else if (command === "report") {
  const rows = readFileSync(RUNS, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RunRecord);
  writeReport(rows);
} else {
  console.error("usage: agent-ab.ts prepare|run|report");
  process.exit(1);
}
