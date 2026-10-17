/**
 * Round 2 (B6 quality): what an A/B session produced, not only what it cost.
 *
 * Every number here is checked against something outside the agent:
 *   - diff size, files touched, and size against the upstream fix (minimal code);
 *   - house style: touched files that fail the repo's own lint or format check
 *     while the upstream version of the same file passes;
 *   - regressions: neighbouring test files that pass on the upstream fix but
 *     fail after the session;
 *   - sandbox audit: reads outside the checkout or peeks at git history;
 *   - review tasks: seeded problems found (recall) and findings that hit a seed;
 *   - a blind grader (separate Claude call, diffs shown as X/Y in random order).
 * Pure helpers are exported for agent-ab.test.ts.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

export const TEST_PATH =
  /(^|\/)(__tests__|tests?|spec|e2e)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
export const SOURCE_PATH = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|vue)$/;

function git(cwd: string, args: string[]): string {
  const res = spawnSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    maxBuffer: 64_000_000,
  });
  if (res.status !== 0) throw new Error(res.stderr || `git ${args[0]} failed`);
  return res.stdout ?? "";
}

// ---------------------------------------------------------------- diff

/** The working tree against HEAD, new files included. */
export function workingDiff(dir: string): string {
  git(dir, ["add", "-A", "-N", "--", "."]);
  try {
    return git(dir, ["diff", "HEAD", "--no-color", "--", "."]);
  } finally {
    git(dir, ["reset", "-q"]);
  }
}

export type DiffStats = {
  /** Source files only: tests, docs, and lockfiles are not "the change". */
  added: number;
  removed: number;
  files: number;
  newFiles: number;
  /** Paths of changed source files. */
  paths: string[];
  /** Added line numbers per source file (new side). */
  addedLines: Record<string, number[]>;
};

/** Counts from a unified diff, source files only. */
export function diffStats(patch: string): DiffStats {
  const stats: DiffStats = {
    added: 0,
    removed: 0,
    files: 0,
    newFiles: 0,
    paths: [],
    addedLines: {},
  };
  let path: string | null = null;
  let line = 0;
  let isNew = false;
  for (const row of patch.split("\n")) {
    if (row.startsWith("diff --git ")) {
      path = null;
      isNew = false;
      continue;
    }
    if (row.startsWith("new file mode")) isNew = true;
    if (row.startsWith("+++ ")) {
      const p = row.slice(4).replace(/^b\//, "");
      path =
        p !== "/dev/null" && SOURCE_PATH.test(p) && !TEST_PATH.test(p)
          ? p
          : null;
      if (path) {
        stats.files += 1;
        if (isNew) stats.newFiles += 1;
        stats.paths.push(path);
        stats.addedLines[path] = [];
      }
      continue;
    }
    if (!path) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
    if (hunk) {
      line = Number(hunk[1]);
      continue;
    }
    if (row.startsWith("+")) {
      stats.added += 1;
      stats.addedLines[path]!.push(line);
      line += 1;
    } else if (row.startsWith("-")) {
      stats.removed += 1;
    } else if (row.startsWith(" ")) {
      line += 1;
    }
  }
  return stats;
}

/** The upstream fix's own source diff, the size a good answer is compared to. */
export function upstreamStats(
  dir: string,
  parent: string,
  fix: string,
): DiffStats {
  return diffStats(git(dir, ["diff", "--no-color", parent, fix]));
}

// ---------------------------------------------------------------- runners

type Pm = "yarn" | "pnpm" | "npx";

function packageManager(dir: string): Pm {
  if (existsSync(join(dir, "yarn.lock"))) return "yarn";
  if (existsSync(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  return "npx";
}

/** `bin args` through the repo's package manager, like `yarn eslint`. */
function exec(
  dir: string,
  args: string[],
  timeoutMs: number,
): { status: number | null; out: string } {
  const pm = packageManager(dir);
  const [cmd, full] =
    pm === "npx"
      ? ["npx", ["--no-install", ...args]]
      : [
          "corepack",
          pm === "pnpm" ? ["pnpm", "exec", ...args] : ["yarn", ...args],
        ];
  const res = spawnSync(cmd, full as string[], {
    cwd: dir,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64_000_000,
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  return {
    status: res.status,
    out: `${res.stdout ?? ""}\n${res.stderr ?? ""}`,
  };
}

/**
 * The repo's own style checks for one file: its linter and its formatter.
 * Detected from package.json; an empty list means "no house check found".
 */
export function styleCommands(pkg: {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}): ((file: string) => string[])[] {
  const scripts = Object.values(pkg.scripts ?? {}).join("\n");
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const out: ((file: string) => string[])[] = [];
  if (/\bvp (lint|check)\b/.test(scripts)) {
    out.push((f) => ["vp", "lint", f]);
    if (/\bvp fmt\b/.test(scripts))
      out.push((f) => ["vp", "fmt", "--check", f]);
    return out;
  }
  if (deps.eslint) out.push((f) => ["eslint", "--no-warn-ignored", f]);
  else if (deps.oxlint) out.push((f) => ["oxlint", f]);
  if (deps.prettier) out.push((f) => ["prettier", "--check", f]);
  else if (deps["@biomejs/biome"]) out.push((f) => ["biome", "check", f]);
  return out;
}

function styleFails(dir: string, file: string): boolean | null {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const commands = styleCommands(pkg);
  if (commands.length === 0) return null;
  return commands.some((c) => exec(dir, c(file), 120_000).status !== 0);
}

/**
 * House style: touched source files that fail the repo's lint or format check
 * now, while the upstream fix's version of the same file passes. A file the
 * repo itself leaves failing is not the agent's fault. Null: no house check.
 */
export function houseStyleMisses(
  dir: string,
  files: string[],
  fix: string,
): { misses: string[]; checked: number } | null {
  const misses: string[] = [];
  let checked = 0;
  for (const file of files) {
    if (!existsSync(join(dir, file))) continue;
    const now = styleFails(dir, file);
    if (now === null) return null;
    checked += 1;
    if (!now) continue;
    let upstream: string | null = null;
    try {
      upstream = git(dir, ["show", `${fix}:${file}`]);
    } catch {
      upstream = null; // a new file: it has to pass on its own
    }
    if (upstream !== null) {
      const mine = readFileSync(join(dir, file), "utf8");
      writeFileSync(join(dir, file), upstream);
      const before = styleFails(dir, file);
      writeFileSync(join(dir, file), mine);
      if (before) continue;
    }
    misses.push(file);
  }
  return { misses, checked };
}

// ---------------------------------------------------------------- regressions

/** Test files beside the touched sources (same dir or a sibling __tests__). */
export function neighbourTests(
  dir: string,
  sources: string[],
  exclude: string[],
  max = 6,
): string[] {
  const out = new Set<string>();
  for (const src of sources) {
    const d = dirname(src);
    for (const folder of [
      d,
      join(d, "__tests__"),
      join(dirname(d), "__tests__"),
    ]) {
      const abs = join(dir, folder);
      if (!existsSync(abs)) continue;
      for (const name of readdirSync(abs)) {
        const rel = join(folder, name);
        if (
          TEST_PATH.test(rel) &&
          SOURCE_PATH.test(rel) &&
          !exclude.includes(rel)
        )
          out.add(rel);
      }
    }
  }
  return [...out].sort().slice(0, max);
}

// ---------------------------------------------------------------- audit

export type Audit = {
  /** Paths the agent read or listed outside its checkout. */
  outside: string[];
  /** Commands that look at history beyond HEAD (could reveal the fix). */
  history: string[];
};

const HISTORY =
  /\bgit\s+(log\s+[^|]*--all|reflog|show\s+[0-9a-f]{7,}|log\s+[0-9a-f]{7,}|checkout\s+[0-9a-f]{7,}|branch\s+-a|fetch|pull|cat-file|fsck)/;

/** `git show|log|checkout <sha>`: reads one commit, not the whole history. */
const ONE_COMMIT = /^\s*git\s+(?:show|log|checkout)\s+([0-9a-f]{7,40})\b/;

/**
 * A history read is a leak only when it can reach past the checkout's own
 * past. Reading a commit the agent can already see from HEAD (the task's
 * parent, or the bench's own "turn 2 tests" commit) is ordinary work; every
 * other history command stays flagged.
 */
export function leakingHistory(
  history: readonly string[],
  visible: (sha: string) => boolean,
): string[] {
  return history.filter((command) => {
    const parts = command.split(/;|&&|\|\|/).filter((p) => HISTORY.test(p));
    return parts.some((part) => {
      const one = ONE_COMMIT.exec(part);
      return !one || !visible(one[1]!);
    });
  });
}

/**
 * Tool calls from a transcript that left the sandbox. Allowed outside paths:
 * node and package-manager caches the tests themselves use.
 */
export function auditCalls(
  calls: readonly { name: string; input: Record<string, unknown> }[],
  root: string,
): Audit {
  const bare = resolve(root).replace(/^\/private(?=\/(tmp|var)\/)/, "");
  const roots = [bare, `/private${bare}`];
  const inside = (p: string) =>
    !p.startsWith("/") ||
    roots.some((r) => p === r || p.startsWith(`${r}/`)) ||
    /^\/(private\/)?(tmp|var\/folders)\/(?!prism-ab)/.test(p) ||
    /\/(\.nvm|\.bun|node_modules|\.cache|\.npm|\.yarn|Library\/pnpm)\//.test(p);
  const audit: Audit = { outside: [], history: [] };
  for (const call of calls) {
    const i = call.input;
    for (const key of ["file_path", "path", "notebook_path"]) {
      const p = i[key];
      if (typeof p === "string" && !inside(p)) audit.outside.push(p);
    }
    const command = typeof i.command === "string" ? i.command : "";
    if (!command) continue;
    if (HISTORY.test(command)) audit.history.push(command.slice(0, 120));
    for (const m of command.matchAll(
      /(?:^|[\s'"=])(\/(?:Users|private|tmp|home|etc|var)\/[^\s'";|&)]+)/g,
    )) {
      if (!inside(m[1]!)) audit.outside.push(m[1]!);
    }
  }
  audit.outside = [...new Set(audit.outside)];
  return audit;
}

/** Main-thread and subagent tool calls, with full input, from a transcript. */
export function transcriptCalls(
  path: string,
): { name: string; input: Record<string, unknown> }[] {
  const files = [path];
  const sub = join(path.replace(/\.jsonl$/, ""), "subagents");
  if (existsSync(sub))
    for (const n of readdirSync(sub))
      if (n.endsWith(".jsonl")) files.push(join(sub, n));
  const out: { name: string; input: Record<string, unknown> }[] = [];
  for (const file of files) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row: { type?: string; message?: { content?: unknown } };
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.type !== "assistant" || !Array.isArray(row.message?.content))
        continue;
      for (const c of row.message!.content as {
        type?: string;
        name?: string;
        input?: Record<string, unknown>;
      }[]) {
        if (c.type === "tool_use" && c.name)
          out.push({ name: c.name, input: c.input ?? {} });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- review

/** A problem planted into a correct change: the answer key for a review task. */
export type Seed = {
  id: string;
  file: string;
  /** Exact text in the upstream fix's version of `file`, replaced by `replace`. */
  find: string;
  replace: string;
  /** bug | reuse | style | minimal | design | perf */
  kind: string;
  issue: string;
  /** Another location of this seed's problem: counted once, as `same`. */
  same?: string;
};

export type ReviewTask = {
  id: string;
  repo: string;
  fix: string;
  parent: string;
  seeds: Seed[];
};

export type Finding = { file: string; line: number; text: string };

/** `- path:line: problem` lines (also `path:line —`, `path#L12`, backticks). */
/**
 * The review's findings: the last main-thread reply that lists any. A hook or
 * plugin can make the agent say one more thing after its review ("Nothing
 * changed…"); scoring only the final reply would then see no findings.
 */
export function reviewFindings(
  replies: readonly string[],
  result: string,
): Finding[] {
  for (const text of [result, ...[...replies].reverse()]) {
    const found = parseFindings(text);
    if (found.length > 0) return found;
  }
  return [];
}

export function parseFindings(text: string): Finding[] {
  const out: Finding[] = [];
  for (const raw of text.split("\n")) {
    const row = raw.replace(/`/g, "").trim();
    const m =
      /^(?:[-*•]|\d+[.)])\s*(?:\*\*)?([\w@./-]+\.[a-z]{1,4})(?::|#L)(\d+)(?:[-–]\d+)?(?:\*\*)?\s*[:—–-]?\s*(.*)$/.exec(
        row,
      );
    if (m) out.push({ file: m[1]!, line: Number(m[2]), text: m[3]!.trim() });
  }
  return out;
}

/** Line span of a seed's replacement in the final file (1-based, inclusive). */
export function seedSpan(content: string, seed: Seed): [number, number] | null {
  const at = content.indexOf(seed.replace);
  if (at < 0) return null;
  const start = content.slice(0, at).split("\n").length;
  return [start, start + Math.max(0, seed.replace.split("\n").length - 1)];
}

/**
 * Which seeds a review found, and which findings hit no seed. A finding hits
 * a seed when it names the seed's file and a line within 3 of its span.
 */
export function scoreReview(
  findings: Finding[],
  seeds: { seed: Seed; span: [number, number] }[],
  slack = 3,
): { found: string[]; missed: string[]; hits: number; extra: Finding[] } {
  const found = new Set<string>();
  const extra: Finding[] = [];
  let hits = 0;
  for (const f of findings) {
    const hit = seeds.find(
      ({ seed, span }) =>
        (f.file === seed.file ||
          seed.file.endsWith(`/${f.file}`) ||
          f.file.endsWith(seed.file)) &&
        f.line >= span[0] - slack &&
        f.line <= span[1] + slack,
    );
    if (hit) {
      hits += 1;
      found.add(hit.seed.same ?? hit.seed.id);
    } else extra.push(f);
  }
  return {
    found: [...found],
    missed: seeds
      .filter((s) => !s.seed.same)
      .map((s) => s.seed.id)
      .filter((id) => !found.has(id)),
    hits,
    extra,
  };
}

// ---------------------------------------------------------------- grader

export type Grade = {
  correctness: number;
  minimalism: number;
  style: number;
};

export type PairGrade = {
  X: Grade;
  Y: Grade;
  better: "X" | "Y" | "tie";
  why: string;
};

/** The blind grader's prompt: no arm names, no tool or product names. */
export function gradePrompt(input: {
  task: string;
  reference: string;
  x: string;
  y: string;
}): string {
  const clip = (s: string) =>
    s.length > 14_000 ? `${s.slice(0, 14_000)}\n[cut]` : s;
  return [
    "You are grading two candidate patches for the same task in the same repository.",
    "A reference patch (the maintainers' own fix) is given for orientation; a candidate may differ from it and still be right.",
    "Score each candidate from 1 (bad) to 5 (excellent) on:",
    "- correctness: fixes the task for real, including edge cases, without breaking other behaviour;",
    "- minimalism: no code, options, abstractions, or files the task did not need;",
    "- style: reads like the surrounding code (naming, helpers already in the repo, formatting).",
    "Ignore patch order and length differences that do not matter. Do not reward comments or explanations.",
    'Answer with JSON only: {"X":{"correctness":n,"minimalism":n,"style":n},"Y":{...},"better":"X"|"Y"|"tie","why":"one sentence"}',
    "",
    "## Task",
    input.task,
    "",
    "## Reference patch",
    clip(input.reference),
    "",
    "## Candidate X",
    clip(input.x) || "(no change)",
    "",
    "## Candidate Y",
    clip(input.y) || "(no change)",
  ].join("\n");
}

/** The first JSON object in the grader's answer, validated; null if unusable. */
export function parseGrade(text: string): PairGrade | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const g = JSON.parse(m[0]) as PairGrade;
    const ok = (s: Grade | undefined) =>
      !!s &&
      [s.correctness, s.minimalism, s.style].every(
        (n) => Number.isFinite(n) && n >= 1 && n <= 5,
      );
    if (!ok(g.X) || !ok(g.Y) || !["X", "Y", "tie"].includes(g.better))
      return null;
    return { X: g.X, Y: g.Y, better: g.better, why: String(g.why ?? "") };
  } catch {
    return null;
  }
}

/** For a review: is each finding that hit no seed still a real problem? */
export function findingsPrompt(input: {
  change: string;
  findings: Finding[];
}): string {
  return [
    "Below is a code change and a list of review findings about it.",
    "For each finding, answer whether it is a real problem a careful maintainer would want fixed (true) or not (false: wrong, trivial, or a matter of taste).",
    'Answer with JSON only: {"valid":[true,false,...]} in the order given.',
    "",
    "## Change",
    input.change.length > 16_000
      ? `${input.change.slice(0, 16_000)}\n[cut]`
      : input.change,
    "",
    "## Findings",
    ...input.findings.map((f, i) => `${i + 1}. ${f.file}:${f.line}: ${f.text}`),
  ].join("\n");
}

export function parseValid(text: string, n: number): boolean[] | null {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const v = (JSON.parse(m[0]) as { valid?: unknown }).valid;
    return Array.isArray(v) &&
      v.length === n &&
      v.every((x) => typeof x === "boolean")
      ? (v as boolean[])
      : null;
  } catch {
    return null;
  }
}

/** Deterministic coin per key, so a re-grade shows the same X/Y order. */
export function coin(key: string): boolean {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2 === 0;
}

export function relativeTo(root: string, p: string): string {
  return p.startsWith("/") ? relative(root, p) : p;
}
