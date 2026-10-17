#!/usr/bin/env node
/**
 * Mine benchmark tasks from a repo's git history (B2 prepare-eval, B4 golden).
 *
 * A task is a past non-merge commit whose subject reads like a change request
 * and that touched 1..--max-files (default 6) TS/JS source files. Labels come from the commit itself:
 *   firstFile  = the source file with the most changed lines (proxy for "the
 *                file a developer opened first", plan §9.3)
 *   files      = every changed source file
 *   tests      = every changed test file (lower bound of the expected tests)
 *   blast      = the other changed source files (lower bound of the blast set)
 * Deterministic: walks first-parent history back from `--sha`, no randomness.
 * Every 5th task (index % 5 === 4) is held out (20%, plan §9.3).
 *
 *   node scripts/bench/golden/mine-tasks.mjs --repo DIR --name hono --sha SHA --count 40 --out FILE
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? f : process.argv[i + 1];
};
const repo = arg("repo");
const name = arg("name");
const sha = arg("sha", "HEAD");
const count = Number(arg("count", "40"));
const out = arg("out");
const maxFiles = Number(arg("max-files", "6"));
if (!repo || !name || !out)
  throw new Error("mine-tasks: --repo, --name and --out are required");

const git = (args) =>
  execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
const SRC = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/;
const TEST = /(^|\/)(__tests__|tests?|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SKIP_SUBJECT =
  /^(chore|docs?|ci|build|release|style|test|tests|bump|merge|revert|v?\d+\.\d+)\b|\bversion packages\b|\bdeps?\b/i;
const GENERATED =
  /(^|\/)(dist|build|out|node_modules|vendor|coverage)\/|\.d\.ts$|\.min\.js$/;

const resolved = git(["rev-parse", sha]).trim();
const log = git([
  "log",
  "--first-parent",
  "--no-merges",
  "--format=%H%x1f%s",
  "-n",
  "3000",
  resolved,
])
  .trim()
  .split("\n");
const tasks = [];
for (const line of log) {
  if (tasks.length >= count) break;
  const [commit, subject] = line.split("\x1f");
  if (!subject || subject.split(/\s+/).length < 3 || SKIP_SUBJECT.test(subject))
    continue;
  const numstat = git([
    "show",
    "--numstat",
    "--format=",
    "--no-renames",
    commit,
  ]).trim();
  if (!numstat) continue;
  const rows = numstat.split("\n").map((l) => {
    const [add, del, path] = l.split("\t");
    return { path, lines: (Number(add) || 0) + (Number(del) || 0) };
  });
  const code = rows.filter((r) => SRC.test(r.path) && !GENERATED.test(r.path));
  const src = code.filter((r) => !TEST.test(r.path));
  const tests = code.filter((r) => TEST.test(r.path)).map((r) => r.path);
  if (src.length < 1 || src.length > maxFiles) continue;
  const parent = git(["rev-parse", `${commit}^`]).trim();
  // A file that did not exist on the parent cannot be found by Prepare.
  const existing = new Set(
    git(["ls-tree", "-r", "--name-only", parent]).split("\n"),
  );
  const present = src.filter((r) => existing.has(r.path));
  if (present.length === 0) continue;
  present.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path));
  const task = subject
    .replace(/\s*\(#\d+\)\s*$/, "")
    .replace(/^\w+(\([^)]*\))?!?:\s*/, "");
  tasks.push({
    id: `${name}-${String(tasks.length + 1).padStart(3, "0")}`,
    repo: name,
    commit,
    parent,
    task,
    firstFile: present[0].path,
    files: present.map((r) => r.path),
    tests: tests.filter((t) => existing.has(t)),
    blast: present.slice(1).map((r) => r.path),
    heldOut: tasks.length % 5 === 4,
  });
}
if (tasks.length < count)
  console.error(
    `mine-tasks: ${name}: only ${tasks.length}/${count} tasks found`,
  );
writeFileSync(
  out,
  `${JSON.stringify({ repo: name, pinnedSha: resolved, tasks }, null, 2)}\n`,
);
console.log(`mine-tasks: ${name}: ${tasks.length} tasks → ${out}`);
