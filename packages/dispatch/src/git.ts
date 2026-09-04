import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { GitSnapshot, JobReview, ReviewFile } from "./types.js";

const execFileAsync = promisify(execFile);

export type GitRunner = (
  cwd: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string; ok: boolean }>;

/**
 * Hosts (Cursor, hooks, CI) sometimes export `GIT_DIR` / `GIT_WORK_TREE`.
 * Those override `cwd` and make a perfectly good repo look missing.
 */
export const GIT_OVERRIDE_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_COMMON_DIR",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_PREFIX",
] as const;

export function gitChildEnv(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  for (const key of GIT_OVERRIDE_ENV) {
    delete env[key];
  }
  return env;
}

export const defaultGitRunner: GitRunner = async (cwd, args) => {
  try {
    const result = await execFileAsync("git", ["-C", cwd, ...args], {
      cwd,
      env: gitChildEnv(),
      encoding: "utf8",
      timeout: 15_000,
      maxBuffer: 2_000_000,
    });
    return { stdout: result.stdout, stderr: result.stderr, ok: true };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "git failed",
      ok: false,
    };
  }
};

export function isMissingGitRepoMessage(detail: string): boolean {
  return /not a git repository/i.test(detail);
}

/**
 * Is there a repository here at all?
 *
 * One `rev-parse`, a few milliseconds, so it stays inside the `start_job`
 * latency budget (ADR-0047). Everything else git-shaped — dirty trees,
 * worktree creation, branch setup — moved to the drain, because those either
 * resolve themselves or become a visible blocked job. This one cannot: Prism
 * will not create a repository, so a job accepted here would queue forever
 * against a `.prism/dispatch` directory in a folder git does not track.
 */
export async function hasGitRepo(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<{ ok: boolean; detail: string }> {
  const probe = await run(workspaceRoot, ["rev-parse", "--git-dir"]);
  return probe.ok
    ? { ok: true, detail: "" }
    : { ok: false, detail: probe.stderr.trim() || "not a git repository" };
}

export async function gitSnapshot(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<GitSnapshot> {
  const [branch, status, log, aheadBehind, yesterday, user] = await Promise.all(
    [
      run(workspaceRoot, ["rev-parse", "--abbrev-ref", "HEAD"]),
      run(workspaceRoot, ["status", "--porcelain"]),
      run(workspaceRoot, ["log", "-5", "--pretty=format:%h %s"]),
      run(workspaceRoot, [
        "rev-list",
        "--left-right",
        "--count",
        "@{upstream}...HEAD",
      ]),
      run(workspaceRoot, [
        "log",
        "--since=yesterday",
        "--pretty=format:%h %s",
        "--no-merges",
      ]),
      run(workspaceRoot, ["config", "user.name"]),
    ],
  );

  if (!branch.ok) {
    return {
      branch: "(unknown)",
      dirtyCount: 0,
      dirtySample: [],
      recent: [],
      sinceYesterday: [],
      error: branch.stderr.trim() || "not a git repository",
    };
  }

  const dirtyLines = status.stdout
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0 && !isGitNoiseStatusLine(line));
  let ahead: number | undefined;
  let behind: number | undefined;
  if (aheadBehind.ok) {
    const [left, right] = aheadBehind.stdout.trim().split(/\s+/);
    behind = Number.parseInt(left ?? "0", 10);
    ahead = Number.parseInt(right ?? "0", 10);
  }

  return {
    branch: branch.stdout.trim() || "HEAD",
    dirtyCount: dirtyLines.length,
    dirtySample: dirtyLines.slice(0, 8).map((line) => line.slice(3) || line),
    ...(Number.isFinite(ahead) ? { ahead } : {}),
    ...(Number.isFinite(behind) ? { behind } : {}),
    recent: log.ok
      ? log.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [],
    sinceYesterday: yesterday.ok
      ? yesterday.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 12)
      : [],
    ...(user.ok && user.stdout.trim()
      ? { userName: user.stdout.trim().split("\n")[0] }
      : {}),
  };
}

export async function gitStatusShort(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<string> {
  const result = await run(cwd, ["status", "--short"]);
  if (!result.ok) return result.stderr.trim();
  return result.stdout
    .split("\n")
    .filter((line) => line.trim() && !isGitNoiseStatusLine(line))
    .join("\n")
    .trim();
}

function isGitNoisePath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return (
    normalized === "node_modules" ||
    normalized.startsWith("node_modules/") ||
    normalized.includes("/node_modules/") ||
    normalized === ".prism" ||
    normalized.startsWith(".prism/")
  );
}

function isGitNoiseStatusLine(line: string): boolean {
  const path = line.slice(3).trim().split(" -> ").at(-1) ?? "";
  return isGitNoisePath(path);
}

/** One line for chat: what the worktree changed, without paths to the tree. */
export async function gitChangeSummary(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<string> {
  const [stat, short] = await Promise.all([
    run(cwd, ["diff", "--stat"]),
    run(cwd, ["status", "--short"]),
  ]);
  const dirty = short.ok
    ? short.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !isGitNoiseStatusLine(line))
    : [];
  const statLines = stat.ok
    ? stat.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  const totals = statLines.at(-1);
  if (totals && /\d+\s+file/.test(totals)) {
    return totals.replace(/\s+/g, " ");
  }
  if (dirty.length === 0) return "No file changes yet.";
  const names = dirty
    .map((line) => line.slice(3).trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((name) => name.replace(/\\/g, "/").split("/").at(-1) ?? name);
  const extra =
    dirty.length > names.length
      ? ` (+${dirty.length - names.length} more)`
      : "";
  const noun = dirty.length === 1 ? "file" : "files";
  return `Changed ${dirty.length} ${noun}${names.length ? ` (${names.join(", ")}${extra})` : ""}.`;
}

/**
 * Job artifacts a worker is allowed to hand back even though `.gitignore`
 * excludes `.prism/`. Anything else under `.prism/` stays ignored: caches and
 * index output are not work product (ADR-0042 §1).
 */
export const JOB_ARTIFACT_PATHS: readonly string[] = [".prism/dispatch/notes"];

export function isJobArtifactPath(path: string): boolean {
  const normalized = path.replaceAll("\\", "/").replace(/^\.\//, "");
  return JOB_ARTIFACT_PATHS.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed}/`),
  );
}

export type JobCommit = {
  /** False when the run produced nothing reachable from a ref. */
  readonly committed: boolean;
  /** `git show --stat` totals for the commit, or "" when nothing committed. */
  readonly summary: string;
  readonly sha?: string;
};

/**
 * Commit whatever the agent produced onto the job branch (ADR-0042 §1).
 *
 * Without this the work exists only as untracked files in a worktree the chat
 * voice rules forbid naming, so it is unreachable in practice. The supervisor
 * commits rather than the agent because the supervisor knows when the run
 * ended and cannot forget to do it.
 */
export async function commitJobWork(
  cwd: string,
  input: { readonly jobId: string; readonly title: string },
  run: GitRunner = defaultGitRunner,
): Promise<JobCommit> {
  await run(cwd, ["add", "-A"]);
  // `.prism/` is gitignored, so report-style output needs an explicit force
  // add. Scoped to the artifact allowlist — never the whole directory.
  for (const path of JOB_ARTIFACT_PATHS) {
    await run(cwd, ["add", "-f", "--", path]);
  }

  const staged = await run(cwd, ["diff", "--cached", "--name-only"]);
  // `.prism/` is noise everywhere else, but the notes allowlist is the one
  // place a job hands back a write-up, so it must survive the filter.
  const names = staged.ok
    ? staged.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) => line && (!isGitNoisePath(line) || isJobArtifactPath(line)),
        )
    : [];
  if (names.length === 0) {
    // Unstage the noise we just added so the tree is left as we found it.
    await run(cwd, ["reset"]);
    return { committed: false, summary: "" };
  }

  const message = `dispatch(${input.jobId}): ${input.title}`.slice(0, 200);
  const committed = await run(cwd, [
    "-c",
    "user.name=Prism Dispatch",
    "-c",
    "user.email=dispatch@prismhq.in",
    "commit",
    "--no-verify",
    "-m",
    message,
  ]);
  if (!committed.ok) {
    await run(cwd, ["reset"]);
    return { committed: false, summary: "" };
  }

  const [stat, sha] = await Promise.all([
    run(cwd, ["show", "--stat", "--format=", "HEAD"]),
    run(cwd, ["rev-parse", "--short", "HEAD"]),
  ]);
  const totals = stat.ok
    ? (stat.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1) ?? "")
    : "";
  return {
    committed: true,
    summary: totals.replace(/\s+/g, " "),
    ...(sha.ok && sha.stdout.trim() ? { sha: sha.stdout.trim() } : {}),
  };
}

/**
 * The branch a job branched from, used as the diff base for "what did this
 * job actually produce". Falls back through the usual names before giving up.
 */
export async function defaultBaseBranch(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<string> {
  const head = await run(workspaceRoot, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  if (head.ok && head.stdout.trim()) return head.stdout.trim();
  for (const candidate of ["main", "master"]) {
    const found = await run(workspaceRoot, [
      "rev-parse",
      "--verify",
      "--quiet",
      candidate,
    ]);
    if (found.ok && found.stdout.trim()) return candidate;
  }
  return "HEAD~1";
}

/** Files carried by the job's own commits — what the branch actually holds. */
export async function committedJobPaths(
  cwd: string,
  baseRef: string,
  run: GitRunner = defaultGitRunner,
): Promise<string[]> {
  const result = await run(cwd, ["diff", "--name-only", `${baseRef}...HEAD`]);
  if (!result.ok) return [];
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Cap the review file list; a 500-file job is a summary, not a list. */
export const MAX_REVIEW_FILES = 50;

function reviewChangeFromStatusLetter(code: string): ReviewFile["change"] {
  const flag = code.trim().charAt(0);
  if (flag === "A") return "added";
  if (flag === "D") return "deleted";
  if (flag === "R") return "renamed";
  return "modified";
}

/**
 * What the job branch carries, for the human to review before it lands.
 *
 * Read from the commit range rather than the dirty tree: ADR-0042 §1 has the
 * supervisor commit before this runs, so `git status` is clean by now and the
 * diff against the base branch is the only honest source. Prism never merges
 * this — the branch is the reviewable unit and landing it stays the user's
 * decision.
 */
export async function gitReviewSummary(
  cwd: string,
  input: { readonly baseRef: string; readonly branch?: string },
  run: GitRunner = defaultGitRunner,
): Promise<JobReview> {
  const range = `${input.baseRef}...HEAD`;
  const [numstat, nameStatus] = await Promise.all([
    run(cwd, ["diff", "--numstat", range]),
    run(cwd, ["diff", "--name-status", range]),
  ]);

  const changeByPath = new Map<string, ReviewFile["change"]>();
  if (nameStatus.ok) {
    for (const line of nameStatus.stdout.split("\n")) {
      const row = line.trim();
      if (!row) continue;
      const parts = row.split(/\t+/);
      const path = (parts.at(-1) ?? "").trim();
      if (!path) continue;
      changeByPath.set(path, reviewChangeFromStatusLetter(parts[0] ?? ""));
    }
  }

  const files: ReviewFile[] = [];
  if (numstat.ok) {
    for (const line of numstat.stdout.split("\n")) {
      const row = line.trim();
      if (!row) continue;
      const [addedRaw, removedRaw, ...pathParts] = row.split(/\t+/);
      const path = (pathParts.at(-1) ?? "").trim();
      if (!path || isGitNoisePath(path)) continue;
      // "-" is git's marker for a binary file.
      const added = Number.parseInt(addedRaw ?? "0", 10);
      const removed = Number.parseInt(removedRaw ?? "0", 10);
      files.push({
        path,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
        change: changeByPath.get(path) ?? "modified",
      });
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files: files.slice(0, MAX_REVIEW_FILES),
    totalAdded: files.reduce((sum, file) => sum + file.added, 0),
    totalRemoved: files.reduce((sum, file) => sum + file.removed, 0),
    truncated: files.length > MAX_REVIEW_FILES,
    branch: input.branch ?? "",
    baseRef: input.baseRef,
    committed: files.length > 0,
    merged: false,
    mixedPaths: [],
  };
}

/**
 * Paths with uncommitted changes in a checkout (ADR-0045 §3).
 *
 * Snapshotted at dispatch time so the finish review can tell the job's edits
 * apart from work the user already had in flight. Porcelain, noise-filtered
 * the same way as the change summary. A rename records *both* sides so a
 * later `git diff --numstat` compact path (`{old => new}`) still matches.
 */
export async function gitDirtyPaths(
  cwd: string,
  run: GitRunner = defaultGitRunner,
): Promise<string[]> {
  const result = await run(cwd, ["status", "--porcelain"]);
  if (!result.ok) return [];
  const paths = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    for (const path of porcelainLinePaths(line)) {
      if (!isGitNoisePath(path)) paths.add(path);
    }
  }
  return [...paths].sort();
}

/**
 * Expand a `git diff` path into every filesystem path it names.
 *
 * Rename lines arrive as `old => new`, `{old => new}/rest`, or two tab
 * columns. Matching only the destination left a checkout job claiming the
 * user's in-flight rename as its own review.
 */
export function diffPathSides(path: string): string[] {
  const trimmed = path.replaceAll("\\", "/").replace(/^\.\//, "").trim();
  if (!trimmed) return [];
  if (trimmed.includes(" => ")) {
    const compact = /^\{(.+) => (.+)\}(.*)$/.exec(trimmed);
    if (compact) {
      return [`${compact[1]}${compact[3]}`, `${compact[2]}${compact[3]}`];
    }
    const nested = /^(.*)\{(.+) => (.+)\}(.*)$/.exec(trimmed);
    if (nested) {
      return [
        `${nested[1]}${nested[2]}${nested[4]}`,
        `${nested[1]}${nested[3]}${nested[4]}`,
      ];
    }
    return trimmed
      .split(" => ")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

function porcelainLinePaths(line: string): string[] {
  if (!line.trim()) return [];
  const rest = line.slice(3).trim();
  if (!rest) return [];
  if (rest.includes(" -> ")) {
    return rest.split(" -> ").flatMap((part) => diffPathSides(part));
  }
  return diffPathSides(rest);
}

function preExistingCovers(
  preExisting: ReadonlySet<string>,
  path: string,
): boolean {
  if (preExisting.has(path)) return true;
  return diffPathSides(path).some((side) => preExisting.has(side));
}

/**
 * Review for a checkout-placed job: the uncommitted diff, minus the paths
 * that were already dirty at dispatch (ADR-0045 §2, §3).
 *
 * The worktree review reads a commit range; there is no commit here by
 * design, so this reads `git diff HEAD` for tracked churn and porcelain for
 * untracked files. A path dirty at start that the job also touched is
 * reported in `mixedPaths` — attributing its churn to either side would be a
 * guess.
 */
export async function gitCheckoutReview(
  cwd: string,
  input: { readonly preExisting: readonly string[]; readonly branch?: string },
  run: GitRunner = defaultGitRunner,
): Promise<JobReview> {
  const preExisting = new Set(input.preExisting);
  const [numstat, porcelain] = await Promise.all([
    run(cwd, ["diff", "--numstat", "HEAD"]),
    run(cwd, ["status", "--porcelain"]),
  ]);

  const changeByPath = new Map<string, ReviewFile["change"]>();
  const untracked: string[] = [];
  if (porcelain.ok) {
    for (const line of porcelain.stdout.split("\n")) {
      if (!line.trim()) continue;
      const code = line.slice(0, 2);
      const path = (line.slice(3).trim().split(" -> ").at(-1) ?? "")
        .replaceAll("\\", "/")
        .replace(/^\.\//, "");
      if (!path || isGitNoisePath(path)) continue;
      if (code.includes("?")) {
        untracked.push(path);
      } else {
        changeByPath.set(path, reviewChangeFromStatusLetter(code));
      }
    }
  }

  const files: ReviewFile[] = [];
  const mixed = new Set<string>();
  if (numstat.ok) {
    for (const line of numstat.stdout.split("\n")) {
      const row = line.trim();
      if (!row) continue;
      const [addedRaw, removedRaw, ...pathParts] = row.split(/\t+/);
      const rawPath = pathParts.join("\t").trim();
      const path = (pathParts.at(-1) ?? "").trim();
      if (!path || isGitNoisePath(path)) continue;
      if (
        preExistingCovers(preExisting, rawPath) ||
        preExistingCovers(preExisting, path)
      ) {
        for (const side of diffPathSides(rawPath)) mixed.add(side);
        mixed.add(path);
        continue;
      }
      const added = Number.parseInt(addedRaw ?? "0", 10);
      const removed = Number.parseInt(removedRaw ?? "0", 10);
      const sides = diffPathSides(rawPath);
      const displayPath = sides.at(-1) ?? path;
      files.push({
        path: displayPath,
        added: Number.isFinite(added) ? added : 0,
        removed: Number.isFinite(removed) ? removed : 0,
        change: changeByPath.get(displayPath) ?? "modified",
      });
    }
  }
  for (const path of untracked) {
    if (preExisting.has(path)) {
      mixed.add(path);
      continue;
    }
    files.push({ path, added: 0, removed: 0, change: "untracked" });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files: files.slice(0, MAX_REVIEW_FILES),
    totalAdded: files.reduce((sum, file) => sum + file.added, 0),
    totalRemoved: files.reduce((sum, file) => sum + file.removed, 0),
    truncated: files.length > MAX_REVIEW_FILES,
    branch: input.branch ?? "",
    baseRef: "HEAD",
    // Uncommitted by design (ADR-0045 §2): the tree is the reviewable unit.
    committed: false,
    merged: false,
    mixedPaths: [...mixed].sort(),
    keptPaths: [],
  };
}

/**
 * Put a checkout path back to HEAD (or delete it if it was untracked).
 *
 * Used by the review card's Restore. Mixed paths — dirty before the job and
 * also touched by it — are refused: restoring would throw away the user's
 * own uncommitted work.
 */
export async function restoreCheckoutPaths(
  cwd: string,
  input: {
    readonly paths: readonly string[];
    readonly mixedPaths?: readonly string[];
  },
  run: GitRunner = defaultGitRunner,
): Promise<{ readonly restored: string[]; readonly skipped: string[] }> {
  const mixed = new Set(input.mixedPaths ?? []);
  const restored: string[] = [];
  const skipped: string[] = [];
  for (const raw of input.paths) {
    const sides = diffPathSides(raw);
    if (sides.some((side) => mixed.has(side)) || mixed.has(raw)) {
      skipped.push(raw);
      continue;
    }
    for (const path of sides.length > 0 ? sides : [raw]) {
      const checkout = await run(cwd, ["checkout", "HEAD", "--", path]);
      if (checkout.ok) {
        restored.push(path);
        continue;
      }
      try {
        await unlink(join(cwd, path));
        restored.push(path);
      } catch {
        skipped.push(path);
      }
    }
  }
  return { restored, skipped };
}

/**
 * Commit only the job-touched paths in a checkout, on explicit ask
 * (ADR-0045 §2). The user's unrelated uncommitted work is never staged.
 */
export async function commitJobPaths(
  cwd: string,
  input: {
    readonly jobId: string;
    readonly title: string;
    readonly paths: readonly string[];
  },
  run: GitRunner = defaultGitRunner,
): Promise<JobCommit> {
  const paths = input.paths.filter(
    (path) => !isGitNoisePath(path) || isJobArtifactPath(path),
  );
  if (paths.length === 0) {
    return { committed: false, summary: "" };
  }
  await run(cwd, ["add", "--", ...paths]);
  for (const path of JOB_ARTIFACT_PATHS) {
    await run(cwd, ["add", "-f", "--", path]);
  }
  const staged = await run(cwd, ["diff", "--cached", "--name-only"]);
  const names = staged.ok
    ? staged.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) => line && (!isGitNoisePath(line) || isJobArtifactPath(line)),
        )
    : [];
  if (names.length === 0) {
    return { committed: false, summary: "" };
  }
  const message = `dispatch(${input.jobId}): ${input.title}`.slice(0, 200);
  const committed = await run(cwd, [
    "-c",
    "user.name=Prism Dispatch",
    "-c",
    "user.email=dispatch@prismhq.in",
    "commit",
    "--no-verify",
    "-m",
    message,
  ]);
  if (!committed.ok) {
    await run(cwd, ["reset"]);
    return { committed: false, summary: "" };
  }
  const [stat, sha] = await Promise.all([
    run(cwd, ["show", "--stat", "--format=", "HEAD"]),
    run(cwd, ["rev-parse", "--short", "HEAD"]),
  ]);
  const totals = stat.ok
    ? (stat.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .at(-1) ?? "")
    : "";
  return {
    committed: true,
    summary: totals.replace(/\s+/g, " "),
    ...(sha.ok && sha.stdout.trim() ? { sha: sha.stdout.trim() } : {}),
  };
}

/** True when the branch holds commits that are not on `baseRef`. */
export async function branchHasUnmergedCommits(
  workspaceRoot: string,
  branch: string,
  baseRef: string,
  run: GitRunner = defaultGitRunner,
): Promise<boolean> {
  const result = await run(workspaceRoot, [
    "rev-list",
    "--count",
    `${baseRef}..${branch}`,
  ]);
  if (!result.ok) return true; // unknown: never prune on a failed check
  return Number.parseInt(result.stdout.trim(), 10) > 0;
}

export async function removeGitWorktree(
  workspaceRoot: string,
  path: string,
  run: GitRunner = defaultGitRunner,
): Promise<boolean> {
  const result = await run(workspaceRoot, [
    "worktree",
    "remove",
    "--force",
    path,
  ]);
  return result.ok;
}

export type ListedWorktree = {
  path: string;
  branch: string;
  head: string;
};

export async function listGitWorktrees(
  workspaceRoot: string,
  run: GitRunner = defaultGitRunner,
): Promise<ListedWorktree[]> {
  const result = await run(workspaceRoot, ["worktree", "list", "--porcelain"]);
  if (!result.ok) return [];
  const trees: ListedWorktree[] = [];
  let current: Partial<ListedWorktree> = {};
  for (const line of result.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) {
        trees.push({
          path: current.path,
          branch: current.branch ?? "",
          head: current.head ?? "",
        });
      }
      current = { path: line.slice("worktree ".length).trim() };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      current.branch = line
        .slice("branch ".length)
        .replace(/^refs\/heads\//, "")
        .trim();
    } else if (line.trim() === "") {
      if (current.path) {
        trees.push({
          path: current.path,
          branch: current.branch ?? "",
          head: current.head ?? "",
        });
        current = {};
      }
    }
  }
  if (current.path) {
    trees.push({
      path: current.path,
      branch: current.branch ?? "",
      head: current.head ?? "",
    });
  }
  return trees;
}

export async function addGitWorktree(
  workspaceRoot: string,
  path: string,
  branch: string,
  run: GitRunner = defaultGitRunner,
): Promise<{ ok: boolean; error?: string }> {
  const existing = await run(workspaceRoot, ["rev-parse", "--verify", branch]);
  if (existing.ok) {
    const checkout = await run(workspaceRoot, [
      "worktree",
      "add",
      path,
      branch,
    ]);
    return checkout.ok
      ? { ok: true }
      : { ok: false, error: checkout.stderr.trim() };
  }
  const created = await run(workspaceRoot, [
    "worktree",
    "add",
    "-b",
    branch,
    path,
  ]);
  return created.ok
    ? { ok: true }
    : { ok: false, error: created.stderr.trim() };
}
