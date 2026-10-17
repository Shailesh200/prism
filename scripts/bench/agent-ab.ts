/**
 * Real-agent A/B (M-098).
 *
 * Arm A is Claude Code with repo settings only. Arm B is the same plus the
 * Prism dev pack (hooks, skills, local MCP). Same model, same prompt, same
 * time limit. There is no token cap: the owner asked for the run without one.
 * A wall-clock limit keeps a hung session from making the arms incomparable.
 *
 *   node scripts/bench/agent-ab.ts prepare
 *   node scripts/bench/agent-ab.ts run [--runs N] [--host claude|opencode]
 *
 * Token fix 5: both arms run with --strict-mcp-config, so the account's own
 * connectors load in neither. Arm B waits for the daemon to finish indexing
 * the checkout before the session starts (`start: "warm"`); with no daemon
 * up, the session starts it (`start: "cold"`). Tokens come from the session
 * transcript (every API call, subagents included), not from `-p`'s usage.
 * `--host opencode` runs the same tasks under opencode and is skipped when
 * no provider key is set.
 *
 * `prepare` keeps a commit only when a test file it touched fails on its
 * parent and passes on the commit. `run` appends one JSON line per session
 * so a stop does not lose earlier results.
 *
 * Round 2 (quality first):
 *   node scripts/bench/agent-ab.ts prepare --set bigger   # multi-file tasks
 *   node scripts/bench/agent-ab.ts run [--sets small,bigger,followup,review]
 *   node scripts/bench/agent-ab.ts grade                  # blind grader, X/Y
 *   node scripts/bench/agent-ab.ts rescore --task <id>    # replay a run's edits
 * Sets: small (es-toolkit + hono, one turn, the old set), bigger (fixes that
 * touch 3+ source files in a larger repo), followup (the same fix asked one
 * failing test file per turn, resumed in one session), review (a correct
 * upstream fix with planted problems; arms A, B, L = Prism with the lens named,
 * P = the ponytail plugin's review). Every run saves its diff and is scored on
 * correctness, size against the upstream fix, house style, and regressions
 * (scripts/bench/ab-quality.ts). The agent works in a checkout whose git
 * history ends at the task (no later commits, refs, or reflog), with reads
 * outside it denied, and every transcript is audited for reads outside it.
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  auditCalls,
  leakingHistory,
  coin,
  diffStats,
  findingsPrompt,
  gradePrompt,
  houseStyleMisses,
  neighbourTests,
  reviewFindings,
  parseGrade,
  parseValid,
  scoreReview,
  seedSpan,
  transcriptCalls,
  upstreamStats,
  workingDiff,
  type Audit,
  type DiffStats,
  type PairGrade,
  type ReviewTask,
} from "./ab-quality.ts";
// @ts-expect-error: a plain .mjs bench helper with no types
import { analyze } from "./b6-transcripts.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WORK = process.env.PRISM_AB_WORK ?? "/tmp/prism-ab";
const TASKS = join(repoRoot, "plans/notes/benchmark-real-agents/tasks.json");
/**
 * Plan P14 (B6): `PRISM_AB_HOME` runs every session under an isolated HOME
 * (host auth only, never the real ~/.claude), with API-key variables removed
 * so the host's own sign-in is used (or, with `PRISM_AB_OAUTH_TOKEN_FILE`, a
 * long-lived `claude setup-token` token given to the child only). `PRISM_AB_TAG` keeps a run set apart
 * from earlier ones (runs-<tag>.jsonl).
 */
const AB_HOME = process.env.PRISM_AB_HOME;
type Host = "claude" | "opencode" | "agent";
const HOST: Host = (() => {
  const named = process.argv.includes("--host")
    ? process.argv[process.argv.indexOf("--host") + 1]
    : undefined;
  return named === "opencode" || named === "agent" ? named : "claude";
})();
const TAG =
  [process.env.PRISM_AB_TAG, HOST === "claude" ? "" : HOST]
    .filter(Boolean)
    .join("-") || undefined;
const RUNS = join(
  repoRoot,
  `plans/notes/benchmark-real-agents/runs${TAG ? `-${TAG}` : ""}.jsonl`,
);
const REPORT = join(
  repoRoot,
  `plans/notes/benchmark-real-agents${TAG ? `-${TAG}` : ""}.md`,
);
/** opencode's model id; its provider key comes from the environment or auth.json. */
const OPENCODE_MODEL =
  process.env.PRISM_AB_OPENCODE_MODEL ?? "anthropic/claude-opus-5-5";
/** The agent CLI (Cursor's headless agent): its own sign-in, this model. */
const AGENT_MODEL = process.env.PRISM_AB_AGENT_MODEL ?? "grok-4.7-high";
const OPENCODE_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENCODE_API_KEY",
];
const PACK = join(repoRoot, "packages/plugin/dist/dev-pack");
/** The session model (round 4: Sonnet for complex sets, Opus for small). */
const MODEL = process.env.PRISM_AB_MODEL ?? "claude-opus-5-5";
/** The blind grader stays on one model across rounds. */
const GRADER_MODEL = process.env.PRISM_AB_GRADER_MODEL ?? "claude-opus-5-5";
/** Per-invocation time limit; the same for both arms of a tool. */
const RUN_MINUTES = Number(process.env.PRISM_AB_RUN_MINUTES ?? 10);
const PER_REPO = 8;
/** Bigger tasks run 3 or 4 arms and take longer: fewer of them per repo. */
const BIGGER_PER_REPO = 4;
const EXAMINE = 40;

const REPOS = [
  { name: "es-toolkit", url: "https://github.com/toss/es-toolkit.git" },
  { name: "hono", url: "https://github.com/honojs/hono.git" },
];
/**
 * Round 2: fixes that touch 3 to 10 source files. es-toolkit is the larger
 * repo (about 4,500 tracked files; hono about 600). vue-core was the first
 * choice but its install does not fit the bench machine's free disk.
 */
const BIGGER_REPOS = REPOS;
const REVIEW_TASKS = join(
  repoRoot,
  "plans/notes/benchmark-real-agents/review-tasks.json",
);
/** The reference review (ponytail.dev), cloned for arm P of the review set. */
const PONYTAIL = join(WORK, "ref", "ponytail");
const SETS = ["small", "bigger", "followup", "review"] as const;
type TaskSet = (typeof SETS)[number];
/**
 * Sessions per task and arm. One each: with 4 sets, 3–4 arms on the bigger
 * and review sets and multi-turn follow-ups, that is about 90 sessions (a
 * night). The paired grader compares the arms task by task.
 */
const RUNS_PER_SET: Record<TaskSet, number> = {
  small: 1,
  bigger: 1,
  followup: 1,
  review: 1,
};
const MAX_TURNS = 3;
/** Follow-up pool: tasks with at least this many test files (3 = three turns). */
const FOLLOWUP_MIN_TESTS = Number(process.env.PRISM_AB_FOLLOWUP_MIN ?? 2);
/**
 * Arm L on the bigger set (run 1 only): the same task with Prism and the
 * Architect lens named in the prompt, against arm B where the lens is picked
 * on its own (Dev, the default for a change). Arm P there: ponytail's plugin
 * (its own minimal-code mode turns on at session start).
 */
const NAMED_LENS = "Use Prism's Architect lens.";

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
  /** Absent on the original tasks: "small". */
  set?: "small" | "bigger";
};

export type Arm = "A" | "B" | "L" | "P";

type Quality = {
  diff: Omit<DiffStats, "addedLines" | "paths"> & { paths: string[] };
  /** Changed source lines over the upstream fix's (1.0 = same size). */
  sizeVsUpstream: number | null;
  upstream: { added: number; removed: number; files: number };
  /** Touched files failing the repo's lint/format while upstream's pass. */
  houseStyle: { misses: string[]; checked: number } | null;
  /** Neighbouring test files passing on upstream that fail now. */
  regressions: { failed: string[]; ran: number } | null;
  patch: string;
};

type ReviewResult = {
  seeds: number;
  found: string[];
  missed: string[];
  findings: number;
  /** Findings on a seed's lines. */
  hits: number;
  /** Findings on no seed: the blind grader decides if each is real. */
  extra: { file: string; line: number; text: string }[];
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
  host?: Host;
  arm: Arm;
  /** Round 2; absent on earlier rows (= small). */
  set?: TaskSet;
  run: number;
  model: string;
  startedAt: string;
  durationMs: number;
  timedOut: boolean;
  exitCode: number | null;
  testsPass: boolean;
  testsUntouched: boolean;
  success: boolean;
  /** Session totals from the transcript (token fix 5). */
  usage: Usage;
  /** What the host itself reported, kept for comparison. */
  hostUsage?: Usage;
  /** Arm B: was the daemon already up and indexed when the session began? */
  start?: "cold" | "warm";
  /** Milliseconds arm B waited for the checkout to be indexed. */
  indexWaitMs?: number;
  transcript?: {
    apiCalls: number;
    toolCalls: number;
    prismCalls: number;
    reads: number;
    injectedChars: Record<string, number>;
  } | null;
  note: string;
  /** Arm B: the stop receipt's value inputs (plan P13 calibration). */
  prism?: { tokensIn: number; filesCovered: number; receipts: number } | null;
  sessionId?: string;
  /** Follow-up set: per turn, did that turn's tests pass when it ended. */
  turns?: {
    tests: string[];
    pass: boolean;
    tokens: number;
    injectedChars: number;
  }[];
  quality?: Quality | null;
  review?: ReviewResult | null;
  /** Sandbox audit: reads outside the checkout, history peeks. */
  audit?: Audit | null;
  /** `rescore`: the run's edits replayed and its tests run again. */
  rescored?: { testsPass: boolean; success: boolean; at: string; note: string };
};

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith("--") ? next : undefined;
}

export function git(cwd: string, args: string[]): string {
  const res = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  if (res.status !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
  return res.stdout ?? "";
}

const TEST = /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/** Files a commit added or changed (a deleted test cannot be checked out). */
function filesOf(cwd: string, sha: string): string[] {
  return git(cwd, [
    "diff-tree",
    "--no-commit-id",
    "-r",
    "--name-only",
    "--diff-filter=d",
    sha,
  ])
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
  // hono moved to bun (bun.lock): a fresh clone has no package-lock for npm ci.
  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) {
    return exec("bun", ["install", "--frozen-lockfile"]);
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

/**
 * The command for a task's test args (`exec <runner> …`). With no lockfile npx
 * runs the runner itself. Round 2: this was `npx vitest run exec vp test --run
 * <file>`, which ran hono's whole suite with `exec`, `vp`, `test` as filters.
 */
export function testCommand(
  pm: "yarn" | "pnpm" | "npx",
  args: string[],
): [string, string[]] {
  if (pm !== "npx") return ["corepack", [pm, ...args]];
  return [
    "npx",
    args[0] === "exec" ? args.slice(1) : ["vitest", "run", ...args],
  ];
}

export function testsResult(
  cwd: string,
  args: string[],
): "pass" | "fail" | "none" {
  const pm = existsSync(join(cwd, "yarn.lock"))
    ? "yarn"
    : existsSync(join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : "npx";
  const [bin, full] = testCommand(pm, args);
  const result = run(bin, full, cwd, 180_000);
  const text = `${result.stdout}\n${result.stderr}`;
  if (/no test files found|No test files found/i.test(text)) return "none";
  return result.status === 0 ? "pass" : "fail";
}

function prepare(set: "small" | "bigger" = "small"): void {
  const tasks: Task[] = [];
  const bigger = set === "bigger";
  const taken = new Set(
    existsSync(TASKS)
      ? (JSON.parse(readFileSync(TASKS, "utf8")) as { tasks: Task[] }).tasks
          .filter((t) => (t.set ?? "small") !== set)
          .map((t) => t.fix)
      : [],
  );
  for (const repo of bigger ? BIGGER_REPOS : REPOS) {
    const cwd = join(WORK, "repos", repo.name);
    if (!existsSync(join(cwd, ".git")) && bigger) {
      // Blobless: full history for the task commits, file contents on demand.
      mkdirSync(dirname(cwd), { recursive: true });
      run(
        "git",
        ["clone", "-q", "--filter=blob:none", repo.url, cwd],
        WORK,
        30 * 60_000,
      );
    }
    if (!existsSync(join(cwd, ".git"))) {
      console.log(`missing clone ${cwd}`);
      continue;
    }
    restoreHistory(cwd);
    // From the default branch, not HEAD: a run leaves HEAD at an old task.
    const tip = ["refs/remotes/origin/HEAD", "refs/heads/main"].find(
      (ref) =>
        spawnSync("git", ["-C", cwd, "rev-parse", "--verify", "-q", ref])
          .status === 0,
    );
    const log = git(cwd, [
      "log",
      "--no-merges",
      "-n",
      bigger ? "2000" : "600",
      "--format=%H%x1f%s",
      tip ?? "HEAD",
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
    // The install the checkout has now (the stamp `checkoutClean` reads).
    const stamp = join(WORK, `stamp-${repo.name}`);
    let installed: string | null = existsSync(stamp)
      ? readFileSync(stamp, "utf8").trim()
      : null;
    for (const commit of commits) {
      if (taken.has(commit.sha)) continue; // a task of the other set
      if (
        examined >= (bigger ? EXAMINE * 2 : EXAMINE) ||
        kept >= (bigger ? BIGGER_PER_REPO : PER_REPO)
      )
        break;
      const changed = filesOf(cwd, commit.sha);
      const tests = changed.filter((p) => TEST.test(p) && SOURCE.test(p));
      const sources = changed.filter((p) => SOURCE.test(p) && !TEST.test(p));
      if (
        tests.length === 0 ||
        tests.length > 4 ||
        sources.length < (bigger ? 3 : 1) ||
        sources.length > (bigger ? 10 : 8)
      ) {
        continue;
      }
      git(cwd, ["checkout", "-q", "-f", "--detach", commit.sha]);
      const hash = lockHash(cwd);
      examined += 1;
      // Bigger set: no install of its own (one per lockfile does not fit the
      // bench machine's disk). A fix is kept only if its tests fail on the
      // parent and pass on the fix with the install already there.
      if (!bigger && hash !== installed) {
        console.log(`${repo.name}: install @ ${commit.sha.slice(0, 8)}`);
        writeFileSync(stamp, ""); // half-done install: reinstall on next use
        if (!install(cwd)) {
          console.log("  install failed, skip");
          continue;
        }
        installed = hash;
        writeFileSync(stamp, hash);
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
          modules: installed ?? hash,
          ...(bigger ? { set: "bigger" as const } : {}),
        });
      }
    }
    console.log(`${repo.name}: kept ${kept} of ${examined} examined`);
  }
  // Each set is prepared on its own; the other set's tasks are kept.
  const others = existsSync(TASKS)
    ? (
        JSON.parse(readFileSync(TASKS, "utf8")) as { tasks: Task[] }
      ).tasks.filter((t) => (t.set ?? "small") !== set)
    : [];
  mkdirSync(dirname(TASKS), { recursive: true });
  writeFileSync(
    TASKS,
    `${JSON.stringify({ model: MODEL, tasks: [...others, ...tasks] }, null, 2)}\n`,
  );
  console.log(`wrote ${tasks.length} ${set} tasks to ${TASKS}`);
}

/** Where a checkout's refs are kept while its history is hidden from the agent. */
function refsFile(cwd: string): string {
  return join(WORK, `refs-${cwd.split("/").pop()}.txt`);
}

/**
 * Sandbox (round 2): the agent must not find the fix in git. Refs, tags, the
 * reflog and ORIG_HEAD/FETCH_HEAD go; objects stay (gc off), so the harness
 * still checks out any task commit by sha. The refs are saved for `prepare`.
 */
export function hideHistory(cwd: string): void {
  const refs = git(cwd, [
    "for-each-ref",
    "--format=%(objectname) %(refname)",
  ]).trim();
  if (refs) {
    writeFileSync(refsFile(cwd), `${refs}\n`);
    git(cwd, ["config", "gc.auto", "0"]);
    git(cwd, ["config", "gc.pruneExpire", "never"]);
    git(cwd, ["config", "core.logAllRefUpdates", "false"]);
    for (const line of refs.split("\n")) {
      const ref = line.split(" ")[1];
      if (ref) git(cwd, ["update-ref", "-d", ref]);
    }
  }
  git(cwd, ["reflog", "expire", "--expire=now", "--all"]);
  for (const name of ["ORIG_HEAD", "FETCH_HEAD"]) {
    rmSync(join(cwd, ".git", name), { force: true });
  }
}

/** Puts back the refs `hideHistory` saved, so `prepare` sees the full log. */
function restoreHistory(cwd: string): void {
  const file = refsFile(cwd);
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const [sha, ref] = line.split(" ");
    if (sha && ref) git(cwd, ["update-ref", ref, sha]);
  }
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

/** Arms that run with Prism on. */
export const withPrism = (arm: Arm) => arm === "B" || arm === "L";

function claudeEnv(arm: Arm): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env };
  if (AB_HOME) {
    base.HOME = AB_HOME;
    // Host sign-in only: a key in the environment would bill the API instead.
    delete base.ANTHROPIC_API_KEY;
    delete base.ANTHROPIC_AUTH_TOKEN;
    delete base.CLAUDE_CODE_OAUTH_TOKEN;
    // A `claude setup-token` token, read from a file and passed to the child
    // only: it carries no refresh token, so it cannot rotate (and so revoke)
    // the owner's own login the way a copied credentials file did.
    const tokenFile = process.env.PRISM_AB_OAUTH_TOKEN_FILE;
    if (tokenFile) {
      // The file may hold several tokens, one per line: take the line
      // PRISM_AB_OAUTH_TOKEN_LINE names (1-based, blank lines skipped).
      const lines = readFileSync(tokenFile, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const token =
        lines[Number(process.env.PRISM_AB_OAUTH_TOKEN_LINE ?? 1) - 1];
      if (token) base.CLAUDE_CODE_OAUTH_TOKEN = token;
    }
    delete base.PRISM_AB_OAUTH_TOKEN_FILE;
  }
  const env: NodeJS.ProcessEnv = {
    ...base,
    CI: "1",
    HUSKY: "0",
    PRISM_DAEMON: withPrism(arm) ? "1" : "0",
    PRISM_HOOKS: withPrism(arm) ? "1" : "0",
    PRISM_AUTOPREPARE: withPrism(arm) ? "1" : "0",
  };
  return env;
}

/**
 * Every path under `root` except `keep` paths and what leads to them: the
 * entries to deny so that only `keep` stays reachable below `root`.
 */
export function allBut(root: string, keep: readonly string[]): string[] {
  const r = resolve(root);
  if (!existsSync(r)) return [];
  const out: string[] = [];
  for (const name of readdirSync(r)) {
    const p = join(r, name);
    if (keep.some((k) => resolve(k) === p)) continue;
    if (keep.some((k) => resolve(k).startsWith(`${p}/`)))
      out.push(...allBut(p, keep));
    else out.push(p);
  }
  return out;
}

/**
 * Sandbox (round 2). The agent sees its checkout and its toolchain, nothing
 * else of the machine:
 *   - file tools (Read, Grep, Glob, Edit): deny rules for the owner's home
 *     and /tmp except the checkout, the bench HOME, node/bun, and the dev pack
 *     (arm B's skills); this repo's notes, scripts and history (the tasks and
 *     their fixes), the other checkouts and the token by name as well;
 *   - Bash: Claude Code's OS sandbox with the same reads, writes only in the
 *     checkout, the temp dir and the bench HOME's caches, no unsandboxed retry;
 *   - no network for either arm (Bash allowlist empty, WebFetch/WebSearch
 *     denied), so nobody copies the maintainers' fix from the web.
 * Transcripts are still audited (ab-quality auditCalls).
 */
export function sandboxSettings(
  dir: string,
  home: string,
  abHome: string | undefined = AB_HOME,
): string {
  const abs = (p: string) => `/${resolve(p)}`; // "//abs/path" = absolute
  const both = (p: string) => [
    ...new Set([p, p.replace(/^\/tmp\//, "/private/tmp/")]),
  ];
  const same = (p: string) => resolve(p).replace(/^\/private\/tmp\//, "/tmp/");
  const other = [...new Set(REPOS.concat(BIGGER_REPOS).map((r) => r.name))]
    .map((name) => join(WORK, "repos", name))
    .filter((p) => same(p) !== same(dir));
  // Yarn PnP checkouts (es-toolkit) load their packages straight from the
  // global cache the install used; without it no test can run in either arm.
  const tools = [
    join(home, ".nvm"),
    join(home, ".bun"),
    join(home, ".yarn", "berry", "cache"),
  ];
  const pack = join(repoRoot, "packages");
  const keep = [dir, ...(abHome ? [abHome] : []), ...tools, pack, PONYTAIL]
    .flatMap(both)
    .map((p) => resolve(p));
  const named = [
    ...["plans", "scripts", "docs", ".git"].map((d) => join(repoRoot, d)),
    ...other,
    join(home, ".claude"),
    join(home, ".prism-ab-token"),
    join(home, ".ssh"),
  ];
  // Claude Code's own temp files (/tmp/claude-<uid>, /tmp/claude-*-cwd) stay.
  const tmp = allBut("/private/tmp", keep).filter(
    (p) => !p.startsWith("/private/tmp/claude-"),
  );
  const paths = [
    ...new Set([...named, ...allBut(home, keep), ...tmp].flatMap(both)),
  ];
  const deny = [
    ...paths.flatMap((q) => [
      `Read(${abs(q)}/**)`,
      `Read(${abs(q)})`,
      `Edit(${abs(q)}/**)`,
    ]),
    "WebFetch",
    "WebSearch",
  ];
  return JSON.stringify({
    permissions: { deny },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: {
        denyRead: [home, ...tmp, ...other.flatMap(both)],
        allowRead: [...new Set(keep)],
        ...(abHome
          ? {
              allowWrite: [".cache", ".npm", ".yarn", ".local", ".config"].map(
                (d) => join(abHome, d),
              ),
            }
          : {}),
      },
      network: { strictAllowlist: true, allowedDomains: [] },
    },
  });
}

export function claudeArgs(
  arm: Arm,
  prompt: string,
  dir: string,
  resume?: string,
  newId?: string,
): string[] {
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
  // Both arms: no account connectors. Without this only arm B loaded them,
  // and their instructions and tool lists were billed to Prism.
  args.push("--strict-mcp-config");
  args.push("--settings", sandboxSettings(dir, process.env.HOME ?? ""));
  if (resume) args.push("--resume", resume);
  // A new session gets its id up front: a session killed at the time limit
  // prints no JSON, and its transcript (tokens, audit) is found by this id.
  else if (newId) args.push("--session-id", newId);
  if (withPrism(arm)) {
    // --plugin-dir is variadic, so it has to come after every other flag.
    args.push("--mcp-config", join(PACK, "mcp.json"), "--plugin-dir", PACK);
  } else if (arm === "P") {
    args.push("--plugin-dir", PONYTAIL);
  }
  args.push("--", prompt);
  return args;
}

export function sumTokens(u: Omit<Usage, "costUsd">): number {
  return u.input + u.output + u.cacheRead + u.cacheWrite;
}

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: null };
}

/** Receipts the arm-B session stored under the isolated HOME. */
function prismValueFor(
  sessionId: string,
  since: number,
): { tokensIn: number; filesCovered: number; receipts: number } | null {
  if (!sessionId || (!AB_HOME && !process.env.PRISM_HOME)) return null;
  const found: {
    at: number;
    value: { tokensIn: number; filesCovered: number };
  }[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      const st = statSync(path);
      if (st.isDirectory()) walk(path, depth + 1);
      else if (
        dir.endsWith("receipts") &&
        name.endsWith(".json") &&
        st.mtimeMs >= since
      ) {
        try {
          const r = JSON.parse(readFileSync(path, "utf8")) as {
            sessionId?: string;
            value?: { tokensIn: number; filesCovered: number };
          };
          if (r.sessionId === sessionId && r.value)
            found.push({ at: st.mtimeMs, value: r.value });
        } catch {
          /* a receipt being written is skipped */
        }
      }
    }
  };
  walk(prismHome(), 0);
  if (found.length === 0) return { tokensIn: 0, filesCovered: 0, receipts: 0 };
  found.sort((a, b) => a.at - b.at);
  const last = found[found.length - 1]!.value;
  return {
    tokensIn: last.tokensIn,
    filesCovered: last.filesCovered,
    receipts: found.length,
  };
}

function sessionIdFrom(stdout: string): string {
  try {
    return (JSON.parse(stdout) as { session_id?: string }).session_id ?? "";
  } catch {
    return "";
  }
}

/**
 * A host usage or auth stop ends the whole run set, not one session. Only an
 * errored session counts, so an answer that talks about rate limits does not.
 */
export function hostStop(
  stdout: string,
  stderr: string,
  status: number | null,
): string | null {
  let errored = status !== 0;
  let text = stderr;
  try {
    const parsed = JSON.parse(stdout) as {
      is_error?: boolean;
      result?: unknown;
    };
    errored = errored || parsed.is_error === true;
    if (parsed.is_error === true) text += `\n${String(parsed.result ?? "")}`;
  } catch {
    text += `\n${stdout.slice(0, 2000)}`;
  }
  if (!errored) return null;
  if (
    /usage limit|limit reached|rate.?limit|credit balance|out of (extra )?usage|hit your (session |weekly )?limit/i.test(
      text,
    )
  )
    return "usage limit";
  if (
    /not logged in|\/login|invalid api key|authentication_error|oauth token/i.test(
      text,
    )
  )
    return "auth failed";
  return null;
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
      modelUsage?: Record<
        string,
        {
          costUSD?: number;
          inputTokens?: number;
          outputTokens?: number;
          cacheReadInputTokens?: number;
          cacheCreationInputTokens?: number;
        }
      >;
    };
    usage.input = parsed.usage?.input_tokens ?? 0;
    usage.output = parsed.usage?.output_tokens ?? 0;
    usage.cacheRead = parsed.usage?.cache_read_input_tokens ?? 0;
    usage.cacheWrite = parsed.usage?.cache_creation_input_tokens ?? 0;
    usage.costUsd =
      typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null;
    model = Object.keys(parsed.modelUsage ?? {})[0] ?? MODEL;
    // `usage` is the last API turn only; `modelUsage` is the whole session
    // (every model, subagents included). Totals come from modelUsage.
    const models = Object.values(parsed.modelUsage ?? {});
    if (models.length > 0) {
      usage.input = models.reduce((t, m) => t + (m.inputTokens ?? 0), 0);
      usage.output = models.reduce((t, m) => t + (m.outputTokens ?? 0), 0);
      usage.cacheRead = models.reduce(
        (t, m) => t + (m.cacheReadInputTokens ?? 0),
        0,
      );
      usage.cacheWrite = models.reduce(
        (t, m) => t + (m.cacheCreationInputTokens ?? 0),
        0,
      );
    }
  } catch {
    /* a killed run may leave no JSON */
  }
  return { usage, model };
}

/** The isolated HOME's Prism state, where arm B's daemon writes its record. */
function prismHome(): string {
  return (
    process.env.PRISM_HOME ?? join(AB_HOME ?? process.env.HOME ?? "", ".prism")
  );
}

/**
 * True while Prism's session-end checks are still running: a receipt says
 * checks are pending, or a baseline has session files put back to HEAD.
 */
export function prismBusy(home: string): boolean {
  const spaces = join(home, "workspaces");
  if (!existsSync(spaces)) return false;
  return readdirSync(spaces).some((ws) => {
    const receipts = join(spaces, ws, "receipts");
    if (!existsSync(receipts)) return false;
    if (existsSync(join(receipts, "baseline-restore", "manifest.json")))
      return true;
    return readdirSync(receipts)
      .filter((name) => name.endsWith(".json"))
      .some((name) => {
        try {
          const receipt = JSON.parse(
            readFileSync(join(receipts, name), "utf8"),
          );
          return receipt.checksState === "pending";
        } catch {
          return false; // a receipt mid-write; the next poll reads it
        }
      });
  });
}

/**
 * Let Prism's background checks finish before the checkout is scored. A
 * failed check re-runs with the session's files put back to HEAD (M-092
 * baseline), so scoring during that window reads the pre-session files, and
 * a check still running can write into the next session's checkout.
 */
export async function settlePrism(arm: Arm): Promise<void> {
  if (!withPrism(arm) || !(AB_HOME || process.env.PRISM_HOME)) return;
  await new Promise((r) => setTimeout(r, 15_000));
  const until = Date.now() + 180_000;
  while (prismBusy(prismHome()) && Date.now() < until)
    await new Promise((r) => setTimeout(r, 1_000));
}

async function daemonGet(
  path: string,
  timeoutMs = 2_000,
): Promise<{ ok: boolean; value?: unknown } | null> {
  try {
    const record = JSON.parse(
      readFileSync(join(prismHome(), "daemon", "daemon.json"), "utf8"),
    ) as { port: number; token: string };
    const res = await fetch(`http://127.0.0.1:${record.port}${path}`, {
      headers: { Authorization: `Bearer ${record.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.status === 200 ? ((await res.json()) as { ok: boolean }) : null;
  } catch {
    return null; // no daemon, or not answering
  }
}

/**
 * Arm B (token fix 5): with a daemon up, wait until it has indexed this
 * checkout, so a session never measures a half-applied reindex. With none
 * up, the session's own hook starts it and the run is recorded cold.
 */
async function waitForIndex(
  root: string,
  resetAt: number,
): Promise<{ start: "cold" | "warm"; waitedMs: number }> {
  const begun = Date.now();
  if (!(await daemonGet("/v1/health"))?.ok)
    return { start: "cold", waitedMs: 0 };
  // The checkout settles (300 ms) and the watcher debounces before indexing.
  await new Promise((r) => setTimeout(r, 1_500));
  while (Date.now() - begun < 90_000) {
    const status = (await daemonGet("/v1/status"))?.value as
      | {
          workspaces?: {
            root: string;
            state: string;
            pendingDirtyCount: number;
            lastIndexedAt: string | null;
          }[];
        }
      | {
          root: string;
          state: string;
          pendingDirtyCount: number;
          lastIndexedAt: string | null;
        }[]
      | undefined;
    const rows = Array.isArray(status) ? status : (status?.workspaces ?? []);
    const row = rows.find((w) => resolve(w.root) === resolve(root));
    if (!row) return { start: "cold", waitedMs: Date.now() - begun };
    const indexedAt = row.lastIndexedAt ? Date.parse(row.lastIndexedAt) : 0;
    if (
      row.state === "fresh" &&
      row.pendingDirtyCount === 0 &&
      (indexedAt >= resetAt || Date.now() - begun > 10_000)
    ) {
      // The daemon builds Prepare's graphs once the index has been quiet
      // for 2 s; a warm session starts after that, with the daemon idle.
      await new Promise((r) => setTimeout(r, 2_500));
      while (Date.now() - begun < 90_000) {
        if ((await daemonGet("/v1/health", 300))?.ok) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      return { start: "warm", waitedMs: Date.now() - begun };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { start: "warm", waitedMs: Date.now() - begun };
}

/**
 * Pack files that differ from their source, or skills only one side has.
 * Arm B must measure this checkout's hooks and skills, not an older copy.
 */
export function stalePackFiles(
  source: string = join(repoRoot, "packages/plugin"),
  pack: string = PACK,
): string[] {
  const out: string[] = [];
  const hooks = join(source, "hooks");
  for (const name of readdirSync(hooks)) {
    const built = join(pack, "hooks", name);
    if (
      !existsSync(built) ||
      readFileSync(built, "utf8") !== readFileSync(join(hooks, name), "utf8")
    )
      out.push(`hooks/${name}`);
  }
  const want = new Set(readdirSync(join(source, "skills")));
  const have = existsSync(join(pack, "skills"))
    ? new Set(readdirSync(join(pack, "skills")))
    : new Set<string>();
  for (const name of new Set([...want, ...have]))
    if (!want.has(name) || !have.has(name)) out.push(`skills/${name}`);
  return out;
}

/** Session totals from the Claude transcript under the isolated HOME. */
export function transcriptFor(
  dir: string,
  sessionId: string,
): {
  usage: Omit<Usage, "costUsd">;
  transcript: NonNullable<RunRecord["transcript"]>;
} | null {
  if (!AB_HOME || !sessionId) return null;
  const projects = join(AB_HOME, ".claude", "projects");
  const slug = resolve(dir).replace(/[^A-Za-z0-9]/g, "-");
  const candidates = [
    join(projects, slug, `${sessionId}.jsonl`),
    join(projects, `-private${slug}`, `${sessionId}.jsonl`),
  ];
  let path = candidates.find((p) => existsSync(p));
  if (!path && existsSync(projects)) {
    for (const d of readdirSync(projects)) {
      const p = join(projects, d, `${sessionId}.jsonl`);
      if (existsSync(p)) path = p;
    }
  }
  if (!path) return null;
  const a = analyze(path) as {
    apiCalls: number;
    usage: Omit<Usage, "costUsd">;
    tools: string[];
    prismCalls: number;
    reads: number;
    injected: Record<string, number>;
  };
  return {
    usage: a.usage,
    transcript: {
      apiCalls: a.apiCalls,
      toolCalls: a.tools.length,
      prismCalls: a.prismCalls,
      reads: a.reads,
      injectedChars: a.injected,
    },
  };
}

/** opencode reads its provider sign-in from here (shared by both arms). */
function opencodeData(): string {
  return (
    process.env.PRISM_AB_OPENCODE_DATA ??
    join(process.env.HOME ?? "", ".local", "share")
  );
}

/** A provider key in the environment or an opencode sign-in, else null. */
export function opencodeKey(
  env: NodeJS.ProcessEnv = process.env,
  data: string = opencodeData(),
): string | null {
  const name = OPENCODE_KEYS.find((k) => env[k]);
  if (name) return name;
  return existsSync(join(data, "opencode", "auth.json")) ? "auth.json" : null;
}

/**
 * Each arm gets its own opencode config home. Arm B's is written by Prism's
 * own installer (MCP server, plugin shim, AGENTS.md block), arm A's is empty.
 */
async function opencodeHome(arm: "A" | "B"): Promise<string> {
  const home = join(WORK, `opencode-home-${arm}`);
  mkdirSync(home, { recursive: true });
  if (
    arm === "B" &&
    !existsSync(join(home, ".config", "opencode", "opencode.json"))
  ) {
    const hosts = (await import(
      pathToFileURL(join(repoRoot, "packages/cli/dist/install/hosts.js")).href
    )) as { installHost: (t: Record<string, unknown>) => unknown };
    hosts.installHost({
      host: "opencode",
      scope: "user",
      home,
      root: home,
      node: process.execPath,
      bin: join(repoRoot, "packages/mcp-server/dist/bin.js"),
      pack: PACK,
    });
  }
  // Both arms: no web fetches and no paths outside the checkout (opencode
  // has no OS sandbox; these are its own permission rules).
  const config = join(home, ".config", "opencode", "opencode.json");
  mkdirSync(dirname(config), { recursive: true });
  const current = existsSync(config)
    ? (JSON.parse(readFileSync(config, "utf8")) as Record<string, unknown>)
    : {};
  writeFileSync(
    config,
    `${JSON.stringify({ ...current, permission: OPENCODE_PERMISSION }, null, 2)}\n`,
  );
  return home;
}

export const OPENCODE_PERMISSION = {
  webfetch: "deny",
  external_directory: "deny",
} as const;

async function opencodeEnv(arm: "A" | "B"): Promise<NodeJS.ProcessEnv> {
  const home = await opencodeHome(arm);
  return {
    ...process.env,
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: opencodeData(),
    CI: "1",
    HUSKY: "0",
    PRISM_HOME: prismHome(),
    PRISM_DAEMON: arm === "B" ? "1" : "0",
    PRISM_HOOKS: arm === "B" ? "1" : "0",
    PRISM_AUTOPREPARE: arm === "B" ? "1" : "0",
  };
}

/** Totals from `opencode run --format json`: one step_finish event per API call. */
export function opencodeUsage(stdout: string): {
  usage: Usage;
  sessionId: string;
  prismCalls: number;
} {
  const usage = emptyUsage();
  let cost = 0;
  let sessionId = "";
  let prismCalls = 0;
  for (const line of stdout.split("\n")) {
    let event: {
      type?: string;
      sessionID?: string;
      part?: {
        tool?: string;
        cost?: number;
        tokens?: {
          input?: number;
          output?: number;
          reasoning?: number;
          cache?: { read?: number; write?: number };
        };
      };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue; // log lines between the JSON events
    }
    sessionId ||= event.sessionID ?? "";
    if (event.type === "tool_use" && event.part?.tool?.startsWith("prism_"))
      prismCalls += 1;
    const t = event.type === "step_finish" ? event.part?.tokens : undefined;
    if (!t) continue;
    usage.input += t.input ?? 0;
    usage.output += (t.output ?? 0) + (t.reasoning ?? 0);
    usage.cacheRead += t.cache?.read ?? 0;
    usage.cacheWrite += t.cache?.write ?? 0;
    cost += event.part?.cost ?? 0;
  }
  usage.costUsd = cost;
  return { usage, sessionId, prismCalls };
}

/** Totals from `agent -p --output-format stream-json`: its closing result event. */
export function agentUsage(stdout: string): {
  usage: Usage;
  sessionId: string;
  toolCalls: number;
  prismCalls: number;
  replies: string[];
  result: string;
} {
  const usage = emptyUsage();
  let sessionId = "";
  let toolCalls = 0;
  let prismCalls = 0;
  let result = "";
  const replies: string[] = [];
  for (const line of stdout.split("\n")) {
    let event: {
      type?: string;
      subtype?: string;
      session_id?: string;
      result?: string;
      tool_call?: unknown;
      message?: { content?: { type?: string; text?: string }[] };
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
      };
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    sessionId ||= event.session_id ?? "";
    if (event.type === "tool_call" && event.subtype === "started") {
      toolCalls += 1;
      // A real MCP call to Prism, not the tool-list lookup before it.
      const call = (event.tool_call as { mcpToolCall?: unknown } | undefined)
        ?.mcpToolCall;
      if (call && /prism/i.test(JSON.stringify(call))) prismCalls += 1;
    }
    if (event.type === "assistant") {
      const text = (event.message?.content ?? [])
        .map((c) => (c.type === "text" ? (c.text ?? "") : ""))
        .join("");
      if (text.trim()) replies.push(text);
    }
    if (event.type === "result") {
      result = String(event.result ?? "");
      usage.input = event.usage?.inputTokens ?? 0;
      usage.output = event.usage?.outputTokens ?? 0;
      usage.cacheRead = event.usage?.cacheReadTokens ?? 0;
      usage.cacheWrite = event.usage?.cacheWriteTokens ?? 0;
    }
  }
  usage.costUsd = null;
  return { usage, sessionId, toolCalls, prismCalls, replies, result };
}

/** opencode's text parts, in order (its replies, for the review set). */
export function opencodeReplies(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line) as {
        type?: string;
        part?: { text?: string };
      };
      if (event.type === "text" && event.part?.text?.trim())
        out.push(event.part.text);
    } catch {
      /* log lines */
    }
  }
  return out;
}

/** Tool and Prism call counts for a host with no transcript we can read. */
export function hostCalls(
  stdouts: string[],
): NonNullable<RunRecord["transcript"]> | null {
  if (HOST === "claude") return null;
  let toolCalls = 0;
  let prismCalls = 0;
  for (const out of stdouts) {
    if (HOST === "agent") {
      const a = agentUsage(out);
      toolCalls += a.toolCalls;
      prismCalls += a.prismCalls;
    } else {
      prismCalls += opencodeUsage(out).prismCalls;
      toolCalls += out
        .split("\n")
        .filter((l) => l.includes('"type":"tool_use"')).length;
    }
  }
  return { apiCalls: 0, toolCalls, prismCalls, reads: 0, injectedChars: {} };
}

/** One host invocation's own usage (Claude's is cumulative over a resume). */
export function invocationUsage(stdout: string): {
  usage: Usage;
  model: string;
} {
  if (HOST === "opencode")
    return { usage: opencodeUsage(stdout).usage, model: OPENCODE_MODEL };
  if (HOST === "agent")
    return { usage: agentUsage(stdout).usage, model: AGENT_MODEL };
  return usageFrom(stdout);
}

/**
 * Arm B/L on the agent CLI: Prism's own project install (MCP server + rule),
 * hidden from the diff; arm A gets none. Prism has no hooks on this host.
 * The agent CLI also loads the owner's own Prism (their ~/.cursor/mcp.json
 * entry and their Claude Code plugin); both are switched off per checkout in
 * both arms, so the only Prism is the one this arm installs.
 */
export async function agentPrepare(dir: string, arm: Arm): Promise<void> {
  // Only Prism's own files: a skill or rule the task set up stays.
  for (const file of ["mcp.json", join("rules", "prism.mdc")])
    rmSync(join(dir, ".cursor", file), { force: true });
  const exclude = join(dir, ".git", "info", "exclude");
  const lines = existsSync(exclude) ? readFileSync(exclude, "utf8") : "";
  const wanted = [".cursor/", ".claude/settings.local.json"].filter(
    (l) => !lines.split("\n").includes(l),
  );
  if (wanted.length > 0)
    writeFileSync(
      exclude,
      `${lines.replace(/\n?$/, "\n")}${wanted.join("\n")}\n`,
    );
  mkdirSync(join(dir, ".claude"), { recursive: true });
  writeFileSync(
    join(dir, ".claude", "settings.local.json"),
    AGENT_NO_CLAUDE_PLUGIN,
  );
  mkdirSync(join(dir, ".cursor"), { recursive: true });
  if (!withPrism(arm)) {
    // A project entry of the same name replaces the owner's global one.
    writeFileSync(join(dir, ".cursor", "mcp.json"), AGENT_NO_PRISM);
    return;
  }
  const hosts = (await import(
    pathToFileURL(join(repoRoot, "packages/cli/dist/install/hosts.js")).href
  )) as { installHost: (t: Record<string, unknown>) => unknown };
  hosts.installHost({
    host: "cursor",
    scope: "project",
    home: process.env.HOME ?? "",
    root: dir,
    node: process.execPath,
    bin: join(repoRoot, "packages/mcp-server/dist/bin.js"),
    pack: PACK,
  });
  // The agent CLI does not pass its own environment to MCP servers, so the
  // bench's Prism home goes in the server entry (else it is the owner's).
  const path = join(dir, ".cursor", "mcp.json");
  const config = JSON.parse(readFileSync(path, "utf8")) as {
    mcpServers: Record<string, { env?: Record<string, string> }>;
  };
  const server = config.mcpServers.prism;
  if (server)
    server.env = {
      ...server.env,
      PRISM_HOME: prismHome(),
      PRISM_DAEMON: "1",
      PRISM_AUTOPREPARE: "1",
    };
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`);
}

export const AGENT_NO_CLAUDE_PLUGIN = `${JSON.stringify(
  { enabledPlugins: { "prism@local": false } },
  null,
  2,
)}\n`;

export const AGENT_NO_PRISM = `${JSON.stringify(
  { mcpServers: { prism: { command: "/usr/bin/false", args: [] } } },
  null,
  2,
)}\n`;

function agentEnv(arm: Arm): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CI: "1",
    HUSKY: "0",
    PRISM_HOME: prismHome(),
    PRISM_DAEMON: withPrism(arm) ? "1" : "0",
    PRISM_HOOKS: withPrism(arm) ? "1" : "0",
    PRISM_AUTOPREPARE: withPrism(arm) ? "1" : "0",
  };
  delete env.PRISM_AB_OAUTH_TOKEN_FILE;
  return env;
}

/**
 * The checkout is passed explicitly: a spawn's cwd alone is not enough, since
 * opencode takes its project from the inherited PWD (round 2: it ran in the
 * harness's own repo until `--dir` was set).
 */
export function agentArgs(
  prompt: string,
  dir: string,
  resume?: string,
): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--trust",
    "--force",
    "--approve-mcps",
    "--model",
    AGENT_MODEL,
    "--workspace",
    dir,
    ...(resume ? ["--resume", resume] : []),
    prompt,
  ];
}

export function opencodeArgs(
  prompt: string,
  dir: string,
  resume?: string,
): string[] {
  return [
    "run",
    "--format",
    "json",
    "-m",
    OPENCODE_MODEL,
    "--dir",
    dir,
    ...(resume ? ["--session", resume] : []),
    prompt,
  ];
}

function workDir(task: Task): string {
  return join(WORK, "repos", task.repo);
}

export function commitAs(dir: string, message: string, paths?: string[]): void {
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
      message,
      ...(paths ? ["--", ...paths] : []),
    ],
    { encoding: "utf8" },
  );
}

/** The install the task's tests were run against, then `rev` checked out clean. */
function checkoutClean(
  task: { repo: string; fix: string; modules?: string },
  rev: string,
): string {
  const dir = join(WORK, "repos", task.repo);
  const stamp = join(WORK, `stamp-${task.repo}`);
  const current = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "";
  if (task.modules && current !== task.modules) {
    git(dir, ["checkout", "-q", "-f", "--detach", task.fix]);
    if (!install(dir))
      throw new Error(`install failed for ${task.repo}@${task.fix}`);
    writeFileSync(stamp, task.modules);
  }
  git(dir, ["checkout", "-q", "-f", "--detach", rev]);
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
  return dir;
}

/**
 * Parent commit, plus the fix's tests (all of them, or the first turn's for
 * the follow-up set), with the install those tests were run against. History
 * past HEAD is hidden from the agent.
 */
function resetTask(task: Task, tests: string[] = task.tests): void {
  const dir = checkoutClean(task, task.parent);
  addTests(dir, task, tests, "task tests");
  hideHistory(dir);
}

/**
 * The tests are part of the task, so they belong to HEAD. Anything the agent
 * does to them afterwards is then visible in the diff. Only these paths are
 * committed: the agent's own edits stay in the working tree.
 */
function addTests(
  dir: string,
  task: Task,
  tests: string[],
  message: string,
): void {
  git(dir, ["checkout", task.fix, "--", ...tests]);
  git(dir, ["add", "--", ...tests]);
  const staged = git(dir, [
    "diff",
    "--cached",
    "--name-only",
    "--",
    ...tests,
  ]).trim();
  if (staged) commitAs(dir, message, tests);
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

export type Session = {
  status: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  /** The session the turn ran in, known even when it printed nothing. */
  sessionId: string;
};

/** One host invocation (a turn), killed at the run's wall-clock limit. */
export async function hostSession(
  dir: string,
  arm: Arm,
  prompt: string,
  resume?: string,
): Promise<Session> {
  const hostEnv =
    HOST === "opencode"
      ? await opencodeEnv(arm === "A" ? "A" : "B")
      : HOST === "agent"
        ? agentEnv(arm)
        : null;
  if (HOST === "agent" && !resume) await agentPrepare(dir, arm);
  const newId = HOST !== "claude" || resume ? undefined : randomUUID();
  return await new Promise<Session>((done) => {
    const started = Date.now();
    const child =
      HOST !== "claude"
        ? spawn(
            HOST,
            HOST === "agent"
              ? agentArgs(prompt, dir, resume)
              : opencodeArgs(prompt, dir, resume),
            {
              cwd: dir,
              env: { ...hostEnv!, PWD: dir },
              stdio: ["ignore", "pipe", "pipe"],
            },
          )
        : spawn("claude", claudeArgs(arm, prompt, dir, resume, newId), {
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
        sessionId:
          (HOST === "opencode"
            ? opencodeUsage(stdout).sessionId
            : HOST === "agent"
              ? agentUsage(stdout).sessionId
              : sessionIdFrom(stdout)) ||
          resume ||
          newId ||
          "",
      });
    });
  });
}

export function resultText(stdout: string): string {
  try {
    return String((JSON.parse(stdout) as { result?: unknown }).result ?? "");
  } catch {
    return "";
  }
}

/** Main-thread assistant text replies from a transcript, oldest first. */
export function assistantReplies(path: string | null): string[] {
  if (!path || !existsSync(path)) return [];
  const out: string[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as {
        type?: string;
        message?: { content?: unknown };
      };
      if (row.type !== "assistant" || !Array.isArray(row.message?.content))
        continue;
      for (const c of row.message.content as { type?: string; text?: string }[])
        if (c.type === "text" && c.text) out.push(c.text);
    } catch {
      // a partial last line while the session closes
    }
  }
  return out;
}

export function transcriptPath(dir: string, sessionId: string): string | null {
  if (!AB_HOME || !sessionId) return null;
  const projects = join(AB_HOME, ".claude", "projects");
  if (!existsSync(projects)) return null;
  for (const d of readdirSync(projects)) {
    const p = join(projects, d, `${sessionId}.jsonl`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Diff, size against upstream, house style and regressions of what the session left. */
function qualityOf(dir: string, task: Task): Quality | null {
  try {
    const patch = workingDiff(dir);
    const stats = diffStats(patch);
    const up = upstreamStats(dir, task.parent, task.fix);
    const upSize = up.added + up.removed;
    const mine = stats.added + stats.removed;
    const regressions = (() => {
      const near = neighbourTests(dir, stats.paths, task.tests);
      if (near.length === 0) return null;
      const args = task.testArgs.filter((a) => !task.tests.includes(a));
      const failed: string[] = [];
      for (const test of near) {
        if (testsResult(dir, [...args, test]) !== "fail") continue;
        // A test that fails on the upstream fix too is not this session's.
        const saved = new Map(
          stats.paths.map((p) => [
            p,
            existsSync(join(dir, p))
              ? readFileSync(join(dir, p), "utf8")
              : null,
          ]),
        );
        for (const p of stats.paths) {
          try {
            writeFileSync(join(dir, p), git(dir, ["show", `${task.fix}:${p}`]));
          } catch {
            rmSync(join(dir, p), { force: true });
          }
        }
        const upstream = testsResult(dir, [...args, test]);
        for (const [p, text] of saved) {
          if (text === null) rmSync(join(dir, p), { force: true });
          else writeFileSync(join(dir, p), text);
        }
        if (upstream === "pass") failed.push(test);
      }
      return { failed, ran: near.length };
    })();
    return {
      diff: {
        added: stats.added,
        removed: stats.removed,
        files: stats.files,
        newFiles: stats.newFiles,
        paths: stats.paths,
      },
      sizeVsUpstream: upSize > 0 ? mine / upSize : null,
      upstream: { added: up.added, removed: up.removed, files: up.files },
      houseStyle: houseStyleMisses(dir, stats.paths, task.fix),
      regressions,
      patch: patch.length > 60_000 ? `${patch.slice(0, 60_000)}\n[cut]` : patch,
    };
  } catch (error) {
    console.log(`  quality: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export function auditOf(
  dir: string,
  sessionId: string,
  visible: (sha: string) => boolean = (sha) => isAncestor(dir, sha, "HEAD"),
): Audit | null {
  const path = transcriptPath(dir, sessionId);
  if (!path) return null;
  const audit = auditCalls(transcriptCalls(path), dir);
  return { ...audit, history: leakingHistory(audit.history, visible) };
}

export function isAncestor(dir: string, sha: string, of: string): boolean {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", sha, of], { cwd: dir })
      .status === 0
  );
}

function followupPrompt(tests: string[]): string {
  return [
    "Next: the tests below also fail now. Fix the source so they pass, same rules as before.",
    "",
    "Failing tests:",
    ...tests.map((t) => `- ${t}`),
  ].join("\n");
}

/** Turns of the follow-up set: one failing test file per turn, at most MAX_TURNS. */
function turnsOf(task: Task): string[][] {
  const turns = task.tests.slice(0, MAX_TURNS - 1).map((t) => [t]);
  const rest = task.tests.slice(MAX_TURNS - 1);
  if (rest.length > 0) turns.push(rest);
  return turns;
}

async function oneRun(
  task: Task,
  arm: Arm,
  runIndex: number,
  set: TaskSet,
): Promise<RunRecord> {
  console.log(`\n${task.id} [${set}] arm ${arm} run ${runIndex}`);
  const resetAt = Date.now();
  const turns = set === "followup" ? turnsOf(task) : [task.tests];
  resetTask(task, turns[0]);
  const dir = workDir(task);
  const warmth = withPrism(arm) ? await waitForIndex(dir, resetAt) : null;
  const runStarted = Date.now();

  const turnRows: NonNullable<RunRecord["turns"]> = [];
  let sessionId = "";
  let durationMs = 0;
  let timedOut = false;
  let lastStatus: number | null = 0;
  let lastStderr = "";
  const totals = emptyUsage();
  let totalCost = 0;
  let model = MODEL;
  const allStdout: string[] = [];
  for (const [i, tests] of turns.entries()) {
    if (i > 0) addTests(dir, task, tests, `turn ${i + 1} tests`);
    const prompt =
      i === 0
        ? [
            promptFor({ ...task, tests }),
            ...(arm === "L" ? ["", NAMED_LENS] : []),
          ].join("\n")
        : followupPrompt(tests);
    const session = await hostSession(
      dir,
      arm,
      prompt,
      i > 0 ? sessionId : undefined,
    );
    const stop = hostStop(session.stdout, session.stderr, session.status);
    if (stop) {
      console.log(`  host stop: ${stop}`);
      process.exit(3);
    }
    allStdout.push(session.stdout);
    sessionId = session.sessionId || sessionId;
    durationMs += session.durationMs;
    timedOut ||= session.timedOut;
    lastStatus = session.status;
    lastStderr = session.stderr;
    // The host's totals for a resumed session are cumulative (modelUsage on
    // `--resume` counts every earlier turn too), so the session total is the
    // last turn's and a turn's own share is the difference.
    // Other hosts report each invocation on its own, so their turns add up.
    const turn = invocationUsage(session.stdout);
    model = turn.model;
    const cumulative = HOST === "claude";
    const turnTokens = cumulative
      ? Math.max(0, sumTokens(turn.usage) - sumTokens(totals))
      : sumTokens(turn.usage);
    if (!cumulative) {
      totals.input += turn.usage.input;
      totals.output += turn.usage.output;
      totals.cacheRead += turn.usage.cacheRead;
      totals.cacheWrite += turn.usage.cacheWrite;
      totalCost += turn.usage.costUsd ?? 0;
    } else if (sumTokens(turn.usage) > 0) {
      totals.input = turn.usage.input;
      totals.output = turn.usage.output;
      totals.cacheRead = turn.usage.cacheRead;
      totals.cacheWrite = turn.usage.cacheWrite;
      totalCost = turn.usage.costUsd ?? totalCost;
    }
    if (set === "followup") {
      const before = turnRows.reduce((t, r) => t + r.injectedChars, 0);
      const injected =
        transcriptFor(dir, sessionId)?.transcript.injectedChars.promptHook ?? 0;
      turnRows.push({
        tests,
        pass:
          testsResult(dir, [
            ...task.testArgs.filter((a) => !task.tests.includes(a)),
            ...tests,
          ]) === "pass",
        tokens: turnTokens,
        injectedChars: Math.max(0, injected - before),
      });
    }
    if (session.timedOut) break;
  }

  // Transcript totals (subagents included); a resumed session appends to the
  // same transcript, so this covers every follow-up turn once.
  const fromTranscript =
    HOST === "claude" ? transcriptFor(dir, sessionId) : null;
  const hostUsage: Usage = {
    ...totals,
    costUsd: HOST === "agent" ? null : totalCost,
  };
  const usage: Usage = fromTranscript
    ? { ...fromTranscript.usage, costUsd: hostUsage.costUsd }
    : hostUsage;
  // Background checks rewrite the stop receipt after the session exits.
  await settlePrism(arm);
  const prism = withPrism(arm) ? prismValueFor(sessionId, runStarted) : null;
  let pass = false;
  let untouched = true;
  let note = timedOut
    ? "timed out"
    : lastStatus !== 0
      ? lastStderr.replace(/\s+/g, " ").slice(0, 180)
      : "";
  try {
    untouched = testsUntouched(dir, task.tests);
    pass = testsResult(dir, task.testArgs) === "pass";
    if (!untouched) note = note || "edited a test file";
  } catch (error) {
    note =
      error instanceof Error ? error.message.slice(0, 200) : "test run threw";
  }
  const quality = qualityOf(dir, task);
  const audit = auditOf(dir, sessionId);
  if (audit && (audit.outside.length > 0 || audit.history.length > 0))
    note = `${note ? `${note}; ` : ""}left the sandbox`;
  const transcript = transcriptFor(dir, sessionId)?.transcript ?? null;
  const record: RunRecord = {
    task: task.id,
    repo: task.repo,
    host: HOST,
    arm,
    set,
    run: runIndex,
    model,
    startedAt: new Date().toISOString(),
    durationMs,
    timedOut,
    exitCode: lastStatus,
    testsPass: pass,
    testsUntouched: untouched,
    success: pass && untouched && !timedOut,
    usage,
    hostUsage,
    transcript: transcript ?? hostCalls(allStdout),
    ...(warmth ? { start: warmth.start, indexWaitMs: warmth.waitedMs } : {}),
    note,
    ...(sessionId ? { sessionId } : {}),
    ...(prism !== null ? { prism } : {}),
    ...(turnRows.length > 0 ? { turns: turnRows } : {}),
    quality,
    audit,
  };
  console.log(
    `  ${record.success ? "pass" : "fail"} ${Math.round(record.durationMs / 1000)}s ` +
      `in=${usage.input + usage.cacheRead + usage.cacheWrite} out=${usage.output}` +
      `${quality ? ` diff=+${quality.diff.added}/-${quality.diff.removed} x${quality.sizeVsUpstream?.toFixed(2) ?? "?"}` : ""} ${note}`,
  );
  return record;
}

// ---------------------------------------------------------------- review set

function reviewPrompt(arm: Arm): string {
  const body = [
    "Review the change in the last commit (`git show HEAD`). The author wants to merge it as is.",
    "Do not edit any file.",
    "List every problem you find, one per line, exactly as:",
    "- path/to/file.ts:LINE: what is wrong, and what to do instead",
    'Use line numbers in the files as they are now. List only real problems. If there are none, say "No problems found."',
  ];
  if (arm === "L") body.push("Use Prism's QA lens for this review.");
  // Arm P: ponytail's own review, invoked the way its docs say.
  return arm === "P"
    ? `/ponytail:ponytail-review ${body.join("\n")}`
    : body.join("\n");
}

/** Upstream fix plus the planted problems, committed as the change under review. */
function resetReview(rt: ReviewTask): {
  dir: string;
  spans: { seed: ReviewTask["seeds"][number]; span: [number, number] }[];
} {
  const dir = checkoutClean({ repo: rt.repo, fix: rt.fix }, rt.parent);
  const changed = filesOf(dir, rt.fix);
  git(dir, [
    "checkout",
    rt.fix,
    "--",
    ...changed.filter((p) => {
      try {
        git(dir, ["cat-file", "-e", `${rt.fix}:${p}`]);
        return true;
      } catch {
        return false;
      }
    }),
  ]);
  for (const seed of rt.seeds) {
    const path = join(dir, seed.file);
    const text = readFileSync(path, "utf8");
    if (text.split(seed.find).length !== 2)
      throw new Error(`${rt.id}: seed ${seed.id} does not match exactly once`);
    writeFileSync(path, text.replace(seed.find, seed.replace));
  }
  git(dir, ["add", "-A", "--", "."]);
  commitAs(dir, "Change under review");
  hideHistory(dir);
  const spans = rt.seeds.map((seed) => {
    const span = seedSpan(readFileSync(join(dir, seed.file), "utf8"), seed);
    if (!span)
      throw new Error(`${rt.id}: seed ${seed.id} not found after commit`);
    return { seed, span };
  });
  return { dir, spans };
}

async function reviewRun(
  rt: ReviewTask,
  arm: Arm,
  runIndex: number,
): Promise<RunRecord> {
  console.log(`\n${rt.id} [review] arm ${arm} run ${runIndex}`);
  const resetAt = Date.now();
  const { dir, spans } = resetReview(rt);
  const warmth = withPrism(arm) ? await waitForIndex(dir, resetAt) : null;
  const session = await hostSession(dir, arm, reviewPrompt(arm));
  const stop = hostStop(session.stdout, session.stderr, session.status);
  if (stop) {
    console.log(`  host stop: ${stop}`);
    process.exit(3);
  }
  const sessionId = session.sessionId;
  const { usage: hostUsage, model } = invocationUsage(session.stdout);
  const fromTranscript =
    HOST === "claude" ? transcriptFor(dir, sessionId) : null;
  const usage: Usage = fromTranscript
    ? { ...fromTranscript.usage, costUsd: hostUsage.costUsd }
    : hostUsage;
  const findings =
    HOST === "claude"
      ? reviewFindings(
          assistantReplies(transcriptPath(dir, sessionId)),
          resultText(session.stdout),
        )
      : HOST === "agent"
        ? reviewFindings(
            agentUsage(session.stdout).replies,
            agentUsage(session.stdout).result,
          )
        : reviewFindings(opencodeReplies(session.stdout), "");
  const score = scoreReview(findings, spans);
  const edited = git(dir, ["status", "--porcelain"]).trim().length > 0;
  const audit = auditOf(dir, sessionId);
  const primaries = rt.seeds.filter((s) => !s.same).length;
  const record: RunRecord = {
    task: rt.id,
    repo: rt.repo,
    host: HOST,
    arm,
    set: "review",
    run: runIndex,
    model,
    startedAt: new Date().toISOString(),
    durationMs: session.durationMs,
    timedOut: session.timedOut,
    exitCode: session.status,
    testsPass: false,
    testsUntouched: !edited,
    // A review "succeeds" when it finds every planted problem without editing.
    success: !edited && score.missed.length === 0,
    usage,
    hostUsage,
    transcript: fromTranscript?.transcript ?? hostCalls([session.stdout]),
    ...(warmth ? { start: warmth.start, indexWaitMs: warmth.waitedMs } : {}),
    note: [session.timedOut ? "timed out" : "", edited ? "edited files" : ""]
      .filter(Boolean)
      .join("; "),
    ...(sessionId ? { sessionId } : {}),
    review: {
      seeds: primaries,
      found: score.found,
      missed: score.missed,
      findings: findings.length,
      hits: score.hits,
      extra: score.extra,
    },
    audit,
  };
  console.log(
    `  found ${score.found.length}/${primaries} seeds, ${findings.length} findings (${score.hits} on seeds) ${Math.round(session.durationMs / 1000)}s`,
  );
  return record;
}

// ---------------------------------------------------------------- grading

type GradeRow = {
  key: string;
  kind: "pair" | "findings";
  task: string;
  set: TaskSet;
  run: number;
  /** Pair: which arm was shown as X. */
  xArm?: Arm;
  yArm?: Arm;
  grade?: PairGrade;
  /** Findings: the run's arm and the grader's verdict per extra finding. */
  arm?: Arm;
  valid?: boolean[];
  error?: string;
};

const GRADES = join(
  repoRoot,
  `plans/notes/benchmark-real-agents/grades${TAG ? `-${TAG}` : ""}.jsonl`,
);

async function askGrader(prompt: string): Promise<string> {
  const res = await new Promise<{ stdout: string; status: number | null }>(
    (done) => {
      const child = spawn(
        "claude",
        [
          "-p",
          "--output-format",
          "json",
          "--model",
          GRADER_MODEL,
          "--strict-mcp-config",
          "--setting-sources",
          "project",
          "--no-session-persistence",
          "--tools",
          "",
          "--",
          prompt,
        ],
        { cwd: WORK, env: claudeEnv("A"), stdio: ["ignore", "pipe", "pipe"] },
      );
      let stdout = "";
      child.stdout.on("data", (c: Buffer) => {
        stdout += c.toString("utf8");
      });
      child.on("close", (status) => done({ stdout, status }));
    },
  );
  const stop = hostStop(res.stdout, "", res.status);
  if (stop) {
    console.log(`  grader stop: ${stop}`);
    process.exit(3);
  }
  return resultText(res.stdout);
}

/**
 * Blind grader: for each task and run index, arm A's and arm B's patches as
 * X and Y in a fixed random order, with the upstream fix as reference; for
 * each review, whether every finding off the seeds is still a real problem.
 * The grader never sees arm names, tool names, or transcripts.
 */
async function gradeAll(rows: RunRecord[], tasks: Task[]): Promise<void> {
  const done = new Set(
    existsSync(GRADES)
      ? readFileSync(GRADES, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => (JSON.parse(l) as GradeRow).key)
      : [],
  );
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  for (const set of ["small", "bigger", "followup"] as const) {
    const inSet = rows.filter((r) => (r.set ?? "small") === set && r.quality);
    for (const [a, b] of inSet
      .filter((r) => r.arm === "A")
      .flatMap((a) =>
        inSet
          .filter((r) => r.arm !== "A" && r.task === a.task && r.run === a.run)
          .map((b) => [a, b] as const),
      )) {
      const task = byTask.get(a.task);
      if (!task) continue;
      // Arm B's pair keeps the round-2 key; arms L and P are marked.
      const key = `pair:${set}:${a.task}:${a.run}${b.arm === "B" ? "" : `:${b.arm}`}`;
      if (done.has(key)) continue;
      const dir = join(WORK, "repos", task.repo);
      const reference = git(dir, [
        "diff",
        "--no-color",
        task.parent,
        task.fix,
        "--",
        ".",
        ...task.tests.map((t) => `:!${t}`),
      ]);
      const aFirst = coin(key);
      const [x, y] = aFirst ? [a, b] : [b, a];
      const answer = await askGrader(
        gradePrompt({
          task: `${task.subject}\n\n${promptFor(task)}`,
          reference,
          x: x.quality!.patch,
          y: y.quality!.patch,
        }),
      );
      const grade = parseGrade(answer);
      const row: GradeRow = {
        key,
        kind: "pair",
        task: a.task,
        set,
        run: a.run,
        xArm: x.arm,
        yArm: y.arm,
        ...(grade ? { grade } : { error: answer.slice(0, 300) }),
      };
      appendFileSync(GRADES, `${JSON.stringify(row)}\n`);
      console.log(
        `${key}: ${grade ? `better=${grade.better === "tie" ? "tie" : grade.better === "X" ? x.arm : y.arm}` : "unparsed"}`,
      );
    }
  }
  const reviews = existsSync(REVIEW_TASKS)
    ? (
        JSON.parse(readFileSync(REVIEW_TASKS, "utf8")) as {
          tasks: ReviewTask[];
        }
      ).tasks
    : [];
  for (const r of rows.filter(
    (x) => x.set === "review" && (x.review?.extra.length ?? 0) > 0,
  )) {
    const key = `findings:${r.task}:${r.arm}:${r.run}`;
    if (done.has(key)) continue;
    const rt = reviews.find((t) => t.id === r.task);
    if (!rt) continue;
    const dir = join(WORK, "repos", rt.repo);
    const change = git(dir, ["diff", "--no-color", rt.parent, rt.fix]);
    const extra = r.review!.extra;
    // The grader sees the change with the planted problems applied as text.
    const planted = rt.seeds
      .map((s) => `${s.file}: \`${s.find.trim()}\` → \`${s.replace.trim()}\``)
      .join("\n");
    const answer = await askGrader(
      findingsPrompt({
        change: `${change}\n\nAlso changed:\n${planted}`,
        findings: extra,
      }),
    );
    const valid = parseValid(answer, extra.length);
    const row: GradeRow = {
      key,
      kind: "findings",
      task: r.task,
      set: "review",
      run: r.run,
      arm: r.arm,
      ...(valid ? { valid } : { error: answer.slice(0, 300) }),
    };
    appendFileSync(GRADES, `${JSON.stringify(row)}\n`);
    console.log(
      `${key}: ${valid ? `${valid.filter(Boolean).length}/${valid.length} valid` : "unparsed"}`,
    );
  }
}

// ---------------------------------------------------------------- rescore

/**
 * Re-score a recorded run: reset its task, replay its file edits from the
 * transcript (Edit, MultiEdit, Write), and run its tests with today's command.
 * A run that edited through Bash cannot be replayed and says so.
 */
function rescore(
  row: RunRecord,
  task: Task,
): NonNullable<RunRecord["rescored"]> {
  resetTask(task);
  const dir = workDir(task);
  const path = row.sessionId ? transcriptPath(dir, row.sessionId) : null;
  const at = new Date().toISOString();
  if (!path)
    return { testsPass: false, success: false, at, note: "no transcript" };
  const calls = transcriptCalls(path);
  let note = "";
  for (const c of calls) {
    const file = typeof c.input.file_path === "string" ? c.input.file_path : "";
    const abs = file.startsWith("/") ? file : join(dir, file);
    const inside =
      resolve(abs).startsWith(resolve(dir)) ||
      resolve(abs)
        .replace(/^\/private/, "")
        .startsWith(resolve(dir).replace(/^\/private/, ""));
    const local = join(dir, relativeInside(abs, dir));
    if (c.name === "Write" && inside) {
      mkdirSync(dirname(local), { recursive: true });
      writeFileSync(local, String(c.input.content ?? ""));
    } else if ((c.name === "Edit" || c.name === "MultiEdit") && inside) {
      const edits =
        c.name === "Edit"
          ? [c.input]
          : ((c.input.edits as Record<string, unknown>[]) ?? []);
      let text = readFileSync(local, "utf8");
      for (const e of edits) {
        const from = String(e.old_string ?? "");
        const to = String(e.new_string ?? "");
        text = e.replace_all
          ? text.split(from).join(to)
          : text.replace(from, to);
      }
      writeFileSync(local, text);
    } else if (c.name === "Bash") {
      // In-place edits through the shell are replayed as they were run;
      // any other shell write cannot be, and the row says so.
      for (const part of shellSegments(String(c.input.command ?? ""))) {
        if (/^(sed -i|perl -p?i)\b/.test(part)) {
          if (spawnSync("sh", ["-c", part], { cwd: dir }).status !== 0)
            note = "a shell edit failed on replay";
        } else if (/(^|\s)(tee\s|>\s?[\w./-]+\.(ts|tsx|js|mjs))/.test(part)) {
          note = "edited through a shell redirect: replay incomplete";
        }
      }
    }
  }
  const untouched = testsUntouched(dir, task.tests);
  const testsPass = testsResult(dir, task.testArgs) === "pass";
  return {
    testsPass,
    success: testsPass && untouched && !row.timedOut,
    at,
    note,
  };
}

/** A shell command split on `;`, `&&`, `||` and `|`, quotes respected. */
export function shellSegments(command: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      cur += ch;
      continue;
    }
    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      out.push(cur);
      cur = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "\n") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((p) => p.trim()).filter(Boolean);
}

function relativeInside(abs: string, dir: string): string {
  const a = resolve(abs).replace(/^\/private/, "");
  const d = resolve(dir).replace(/^\/private/, "");
  return a.startsWith(`${d}/`) ? a.slice(d.length + 1) : a;
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

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
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

function readRows(): RunRecord[] {
  return existsSync(RUNS)
    ? readFileSync(RUNS, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as RunRecord)
    : [];
}

function readGrades(): GradeRow[] {
  return existsSync(GRADES)
    ? readFileSync(GRADES, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as GradeRow)
    : [];
}

const pct = (n: number, d: number) =>
  d === 0 ? "–" : `${Math.round((n / d) * 100)}%`;
const fmt1 = (v: number | null) =>
  v === null || Number.isNaN(v) ? "–" : v.toFixed(2);

/** Mean of each grade field for one arm, from the pair grades of a set. */
function armGrades(
  grades: GradeRow[],
  arm: Arm,
): { c: number; m: number; s: number; n: number } {
  const mine = grades
    .filter((g) => g.kind === "pair" && g.grade)
    .map((g) =>
      g.xArm === arm ? g.grade!.X : g.yArm === arm ? g.grade!.Y : null,
    )
    .filter((g): g is NonNullable<typeof g> => g !== null);
  return {
    c: mean(mine.map((g) => g.correctness)),
    m: mean(mine.map((g) => g.minimalism)),
    s: mean(mine.map((g) => g.style)),
    n: mine.length,
  };
}

function qualityLines(
  set: TaskSet,
  rows: RunRecord[],
  grades: GradeRow[],
): string[] {
  const inSet = rows.filter((r) => (r.set ?? "small") === set);
  if (inSet.length === 0) return [];
  const all = grades.filter((x) => x.set === set && x.kind === "pair");
  // Arm A is graded against each other arm; B's pairs carry the plain key,
  // L's and P's end in ":L" / ":P". A's means come from the A-vs-B pairs.
  const pairsOf = (arm: Arm) =>
    all.filter((x) =>
      arm === "B" ? !/:[LP]$/.test(x.key) : x.key.endsWith(`:${arm}`),
    );
  const prefer = (arm: Arm, among: GradeRow[]) =>
    among.filter(
      (x) =>
        x.grade &&
        x.grade.better !== "tie" &&
        (x.grade.better === "X" ? x.xArm : x.yArm) === arm,
    ).length;
  const sizes = (list: RunRecord[]) =>
    list
      .map((r) => r.quality?.sizeVsUpstream)
      .filter((v): v is number => typeof v === "number");
  const count = (list: RunRecord[], hit: (r: RunRecord) => boolean) =>
    list.filter(hit).length;
  const label: Record<Arm, string> = {
    A: "Arm A (no Prism)",
    B: "Arm B (Prism, lens automatic)",
    L: "Arm L (Prism, Architect lens named)",
    P: "Arm P (ponytail plugin)",
  };
  const arms = (["A", "B", "L", "P"] as const).filter((arm) =>
    inSet.some((r) => r.arm === arm),
  );
  const of = (arm: Arm) => inSet.filter((r) => r.arm === arm);
  const grade = (arm: Arm) => armGrades(pairsOf(arm === "A" ? "B" : arm), arm);
  const lines = [
    `### ${set} (${arms.map((arm) => `${of(arm).length} ${arm}`).join(" / ")} sessions)`,
    "",
    `| | ${arms.map((arm) => label[arm]).join(" | ")} |`,
    `|---|${arms.map(() => "---").join("|")}|`,
  ];
  const row = (name: string, cell: (arm: Arm, list: RunRecord[]) => string) =>
    lines.push(
      `| ${name} | ${arms.map((arm) => cell(arm, of(arm))).join(" | ")} |`,
    );
  row(
    "Correct: the failing tests pass, tests untouched",
    (_, l) => `${count(l, (r) => r.success)}/${l.length}`,
  );
  const g1 = (arm: Arm, k: "c" | "m" | "s") =>
    grade(arm).n > 0 ? fmt1(grade(arm)[k]) : "–";
  row("Blind grade, correctness (1–5)", (arm) => g1(arm, "c"));
  row("Blind grade, minimal code (1–5)", (arm) => g1(arm, "m"));
  row("Blind grade, house style (1–5)", (arm) => g1(arm, "s"));
  row("Grader preferred, against arm A (wins–losses, ties left out)", (arm) => {
    if (arm === "A") return "";
    const p = pairsOf(arm);
    return `${prefer(arm, p)}–${prefer("A", p)} of ${p.length}`;
  });
  row("Change size vs the maintainers' fix, median (1.00 = same)", (_, l) =>
    fmt1(sizes(l).length ? median(sizes(l)) : null),
  );
  row("Sessions that added a new source file", (_, l) =>
    String(count(l, (r) => (r.quality?.diff.newFiles ?? 0) > 0)),
  );
  row(
    "Sessions breaking the repo's lint/format where upstream passes",
    (_, l) =>
      `${count(l, (r) => (r.quality?.houseStyle?.misses.length ?? 0) > 0)}/${count(l, (r) => !!r.quality?.houseStyle)}`,
  );
  row(
    "Sessions breaking a nearby test that passes upstream",
    (_, l) =>
      `${count(l, (r) => (r.quality?.regressions?.failed.length ?? 0) > 0)}/${count(l, (r) => !!r.quality?.regressions)}`,
  );
  row("Sessions that read outside the checkout or its history", (_, l) =>
    String(
      count(
        l,
        (r) =>
          (r.audit?.outside.length ?? 0) > 0 ||
          (r.audit?.history.length ?? 0) > 0,
      ),
    ),
  );
  lines.push("");
  if (set === "followup") {
    const turnStats = (list: RunRecord[], i: number) => {
      const t = list
        .map((r) => r.turns?.[i])
        .filter((x): x is NonNullable<typeof x> => !!x);
      return {
        pass: t.filter((x) => x.pass).length,
        n: t.length,
        tokens: median(t.map((x) => x.tokens)),
        chars: median(t.map((x) => x.injectedChars)),
      };
    };
    lines.push(
      "| Turn | A pass | B pass | A tokens, median | B tokens, median | B Prism text, median chars |",
      "|---|---|---|---|---|---|",
    );
    for (let i = 0; i < MAX_TURNS; i += 1) {
      const ta = turnStats(of("A"), i);
      const tb = turnStats(of("B"), i);
      if (ta.n + tb.n === 0) continue;
      lines.push(
        `| ${i + 1} | ${ta.pass}/${ta.n} | ${tb.pass}/${tb.n} | ${Math.round(ta.tokens).toLocaleString()} | ${Math.round(tb.tokens).toLocaleString()} | ${Math.round(tb.chars)} |`,
      );
    }
    lines.push("");
  }
  return lines;
}

function reviewLines(rows: RunRecord[], grades: GradeRow[]): string[] {
  const inSet = rows.filter((r) => r.set === "review" && r.review);
  if (inSet.length === 0) return [];
  const arms: Arm[] = ["A", "B", "L", "P"];
  const label: Record<Arm, string> = {
    A: "No help",
    B: "Prism, lens automatic",
    L: "Prism, lens named",
    P: "ponytail review",
  };
  const lines = [
    "### Review set: planted problems found",
    "",
    "Each task is a correct maintainer fix with 1–2 problems planted (a bug, a copied helper, unused new API, a style break, a design or speed problem). Found = a finding on the planted lines (±3). Precision counts a finding as right when it is on a planted problem or the blind grader calls it a real problem.",
    "",
    "| Arm | Sessions | Planted problems found | All found | Findings per review | Precision, planted only | Precision, with grader | Edited files |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const arm of arms) {
    const list = inSet.filter((r) => r.arm === arm);
    if (list.length === 0) continue;
    const seeds = list.reduce((t, r) => t + r.review!.seeds, 0);
    const found = list.reduce((t, r) => t + r.review!.found.length, 0);
    const findings = list.reduce((t, r) => t + r.review!.findings, 0);
    const hits = list.reduce((t, r) => t + r.review!.hits, 0);
    let graded = 0;
    let gradedAll = true;
    for (const r of list) {
      if (r.review!.extra.length === 0) continue;
      const g = grades.find(
        (x) => x.key === `findings:${r.task}:${r.arm}:${r.run}`,
      );
      if (!g?.valid) gradedAll = false;
      else graded += g.valid.filter(Boolean).length;
    }
    lines.push(
      `| ${label[arm]} | ${list.length} | ${found}/${seeds} (${pct(found, seeds)}) | ${list.filter((r) => r.review!.missed.length === 0).length}/${list.length} | ${(findings / list.length).toFixed(1)} | ${pct(hits, findings)} | ${gradedAll ? pct(hits + graded, findings) : "not graded"} | ${list.filter((r) => !r.testsUntouched).length} |`,
    );
  }
  const reviews = existsSync(REVIEW_TASKS)
    ? (
        JSON.parse(readFileSync(REVIEW_TASKS, "utf8")) as {
          tasks: ReviewTask[];
        }
      ).tasks
    : [];
  const kinds = [
    ...new Set(
      reviews.flatMap((t) => t.seeds.filter((s) => !s.same).map((s) => s.kind)),
    ),
  ];
  lines.push(
    "",
    `| Found, by kind | ${arms
      .filter((a) => inSet.some((r) => r.arm === a))
      .map((a) => label[a])
      .join(" | ")} |`,
    `|---|${arms
      .filter((a) => inSet.some((r) => r.arm === a))
      .map(() => "---")
      .join("|")}|`,
  );
  for (const kind of kinds) {
    const ids = new Set(
      reviews.flatMap((t) =>
        t.seeds.filter((s) => !s.same && s.kind === kind).map((s) => s.id),
      ),
    );
    const cells = arms
      .filter((a) => inSet.some((r) => r.arm === a))
      .map((arm) => {
        const list = inSet.filter((r) => r.arm === arm);
        const total = list.reduce(
          (t, r) =>
            t +
            [...r.review!.found, ...r.review!.missed].filter((id) =>
              ids.has(id),
            ).length,
          0,
        );
        const got = list.reduce(
          (t, r) => t + r.review!.found.filter((id) => ids.has(id)).length,
          0,
        );
        return `${got}/${total}`;
      });
    lines.push(`| ${kind} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  return lines;
}

function costLines(set: TaskSet, rows: RunRecord[]): string[] {
  const inSet = rows.filter((r) => (r.set ?? "small") === set);
  const arms = [...new Set(inSet.map((r) => r.arm))].sort();
  if (inSet.length === 0) return [];
  return [
    `| ${set} | ${arms
      .map((arm) => {
        const list = inSet.filter((r) => r.arm === arm);
        return `${arm}: ${Math.round(median(list.map(tokens))).toLocaleString()} tok, $${median(list.map((r) => r.usage.costUsd ?? 0)).toFixed(3)}, ${Math.round(median(list.map((r) => r.durationMs / 1000)))} s`;
      })
      .join("; ")} |`,
  ];
}

function writeReport(rows: RunRecord[]): void {
  const grades = readGrades();
  const a = rows.filter((r) => r.arm === "A" && (r.set ?? "small") === "small");
  const b = rows.filter((r) => r.arm === "B" && (r.set ?? "small") === "small");
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
  const rate = (list: RunRecord[]) =>
    list.length === 0 ? 0 : list.filter((r) => r.success).length / list.length;
  const lines = [
    "# Real-agent proof",
    "",
    `Generated ${new Date().toISOString()}. Host ${HOST}, model ${HOST === "opencode" ? OPENCODE_MODEL : HOST === "agent" ? AGENT_MODEL : MODEL}. ${RUN_MINUTES} minute limit per session. No token cap.`,
    "Arm A is the coding agent alone. Arm B is the same agent plus Prism. Quality and precision come first; cost after.",
    "",
    "## Quality and precision",
    "",
    ...SETS.filter((s) => s !== "review").flatMap((set) =>
      qualityLines(set, rows, grades),
    ),
    ...reviewLines(rows, grades),
    "## Cost",
    "",
    "Small set (the earlier es-toolkit + hono tasks), B − A with a 95% bootstrap interval:",
    "",
    `| | Arm A | Arm B | B − A (95% CI) |`,
    `|---|---|---|---|`,
    `| Runs | ${a.length} | ${b.length} | |`,
    `| Success | ${(rate(a) * 100).toFixed(0)}% | ${(rate(b) * 100).toFixed(0)}% | ${(success.diff * 100).toFixed(1)} pp (${(success.low * 100).toFixed(1)} to ${(success.high * 100).toFixed(1)}) |`,
    `| Tokens, mean | ${Math.round(mean(a.map(tokens))).toLocaleString()} | ${Math.round(mean(b.map(tokens))).toLocaleString()} | ${Math.round(tok.diff).toLocaleString()} (${Math.round(tok.low).toLocaleString()} to ${Math.round(tok.high).toLocaleString()}) |`,
    `| Seconds, mean | ${Math.round(mean(a.map((r) => r.durationMs / 1000)))} | ${Math.round(mean(b.map((r) => r.durationMs / 1000)))} | ${time.diff.toFixed(0)} (${time.low.toFixed(0)} to ${time.high.toFixed(0)}) |`,
    `| USD, mean | ${mean(a.map((r) => r.usage.costUsd ?? 0)).toFixed(2)} | ${mean(b.map((r) => r.usage.costUsd ?? 0)).toFixed(2)} | ${cost.diff.toFixed(2)} (${cost.low.toFixed(2)} to ${cost.high.toFixed(2)}) |`,
    `| Tokens, median | ${Math.round(median(a.map(tokens))).toLocaleString()} | ${Math.round(median(b.map(tokens))).toLocaleString()} | |`,
    `| Sessions calling a Prism tool | | ${b.filter((r) => (r.transcript?.prismCalls ?? 0) > 0).length}/${b.length} | |`,
    "",
    "Medians per set and arm:",
    "",
    "| Set | Per arm |",
    "|---|---|",
    ...SETS.flatMap((set) => costLines(set, rows)),
    "",
    "## Per run",
    "",
    "| Task | Set | Arm | Run | Success | Seconds | Tokens | Diff (+/−) | × upstream | Note |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.task} | ${r.set ?? "small"} | ${r.arm} | ${r.run} | ${r.success ? "yes" : "no"}${r.rescored ? ` (re-scored: ${r.rescored.success ? "yes" : "no"})` : ""} | ${Math.round(r.durationMs / 1000)} | ${tokens(r).toLocaleString()} | ${r.quality ? `+${r.quality.diff.added}/−${r.quality.diff.removed}` : r.review ? `${r.review.found.length}/${r.review.seeds} found` : ""} | ${fmt1(r.quality?.sizeVsUpstream ?? null)} | ${r.note.replace(/\|/g, "/")} |`,
    ),
    "",
  ];
  writeFileSync(REPORT, lines.join("\n"));
}

function loadTasks(): Task[] {
  if (!existsSync(TASKS))
    throw new Error(`no tasks at ${TASKS}; run prepare first`);
  return (JSON.parse(readFileSync(TASKS, "utf8")) as { tasks: Task[] }).tasks;
}

/** True when `only` (comma-separated `task:set:arm`) is unset or names this session. */
export function wanted(
  only: string | undefined,
  task: string,
  set: string,
  arm: string,
): boolean {
  if (!only) return true;
  return only.split(",").includes(`${task}:${set}:${arm}`);
}

async function runAll(): Promise<void> {
  if (HOST === "opencode") {
    const key = opencodeKey();
    if (!key) {
      console.log(
        `opencode: no provider key (${OPENCODE_KEYS.join(", ")} or opencode auth.json under the bench HOME); skipped`,
      );
      return;
    }
    console.log(`opencode: provider sign-in from ${key}`);
  }
  if (!existsSync(join(PACK, "mcp.json")))
    throw new Error(`no dev pack at ${PACK}`);
  const stale = stalePackFiles();
  if (stale.length > 0)
    throw new Error(
      `dev pack is older than the source (${stale.join(", ")}); rebuild it: PRISM_DEV_PACK=1 PRISM_DEV_NODE=$(which node) PRISM_MCP_BIN=${join(repoRoot, "packages/mcp-server/dist/bin.js")} bun run --filter @repo-prism/plugin build`,
    );
  const tasks = loadTasks();
  const sets = (arg("--sets") ?? "small")
    .split(",")
    .filter((x): x is TaskSet => (SETS as readonly string[]).includes(x));
  const fixed = arg("--runs");
  const runsFor = (set: TaskSet) => (fixed ? Number(fixed) : RUNS_PER_SET[set]);
  type Job =
    | { kind: "fix"; set: TaskSet; task: Task; arm: Arm; run: number }
    | {
        kind: "review";
        set: "review";
        task: ReviewTask;
        arm: Arm;
        run: number;
      };
  const jobs: Job[] = [];
  // Bigger set, run 1: also the lens named (L) and ponytail's own mode (P).
  const ponytail =
    HOST === "claude" && existsSync(join(PONYTAIL, ".claude-plugin"));
  const biggerArms: Arm[] = ponytail ? ["A", "B", "L", "P"] : ["A", "B", "L"];
  for (const set of sets) {
    if (set === "review") {
      const reviews = (
        JSON.parse(readFileSync(REVIEW_TASKS, "utf8")) as {
          tasks: ReviewTask[];
        }
      ).tasks;
      const arms: Arm[] = ponytail ? ["A", "B", "L", "P"] : ["A", "B", "L"];
      for (const task of reviews)
        for (let run = 1; run <= runsFor(set); run += 1)
          for (const arm of arms)
            jobs.push({ kind: "review", set, task, arm, run });
      continue;
    }
    const pool = tasks.filter((t) =>
      set === "followup"
        ? t.tests.length >= FOLLOWUP_MIN_TESTS
        : (t.set ?? "small") === set,
    );
    for (const task of pool)
      for (let run = 1; run <= runsFor(set); run += 1)
        for (const arm of set === "bigger" && run === 1
          ? biggerArms
          : (["A", "B"] as const))
          jobs.push({ kind: "fix", set, task, arm, run });
  }
  // `--only task:set:arm,…` runs just those sessions (a cut-down, named subset).
  const only = arg("--only");
  const order = shuffle(jobs, 98).filter((j) =>
    wanted(only, j.task.id, j.set, j.arm),
  );
  mkdirSync(dirname(RUNS), { recursive: true });
  const done = readRows();
  const keyOf = (task: string, set: TaskSet, arm: Arm, run: number) =>
    `${task}:${set}:${arm}:${run}`;
  const seen = new Set(
    done.map((r) => keyOf(r.task, r.set ?? "small", r.arm, r.run)),
  );
  console.log(
    `${order.length} sessions, ${order.filter((j) => seen.has(keyOf(j.task.id, j.set, j.arm, j.run))).length} already recorded`,
  );
  for (const job of order) {
    if (seen.has(keyOf(job.task.id, job.set, job.arm, job.run))) continue;
    const record =
      job.kind === "review"
        ? await reviewRun(job.task, job.arm, job.run)
        : await oneRun(job.task, job.arm, job.run, job.set);
    appendFileSync(RUNS, `${JSON.stringify(record)}\n`);
    done.push(record);
    writeReport(done);
  }
  writeReport(done);
  console.log(`report ${REPORT}`);
}

const command =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
    ? process.argv[2]
    : "imported";
if (command === "imported") {
  // a test imports the helpers; nothing runs
} else if (command === "prepare")
  prepare(arg("--set") === "bigger" ? "bigger" : "small");
else if (command === "run") await runAll();
else if (command === "grade") {
  await gradeAll(readRows(), loadTasks());
  writeReport(readRows());
} else if (command === "rescore") {
  const id = arg("--task");
  const tasks = loadTasks();
  const rows = readRows();
  for (const row of rows) {
    if (id && row.task !== id) continue;
    if ((row.set ?? "small") === "review") continue;
    const task = tasks.find((t) => t.id === row.task);
    if (!task) continue;
    row.rescored = rescore(row, task);
    console.log(
      `${row.task} ${row.arm} ${row.run}: was ${row.success ? "pass" : "fail"}, now ${row.rescored.success ? "pass" : "fail"} ${row.rescored.note}`,
    );
  }
  writeFileSync(RUNS, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeReport(rows);
} else if (command === "report") writeReport(readRows());
else {
  console.error(
    "usage: agent-ab.ts prepare [--set bigger]|run [--sets …]|grade|rescore [--task id]|report",
  );
  process.exit(1);
}
