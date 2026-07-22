import { execFileSync } from "node:child_process";
import type {
  GitCommitRef,
  GitContributor,
  GitDayBucket,
  GitFileSignal,
  GitRepoSummary,
} from "@prism/shared";

/** Number of trailing weeks summarized for churn sparklines. */
export const GIT_WEEKS = 12;
/** Recency window (days); older edits trend toward 0 heat. */
export const GIT_RECENCY_WINDOW_DAYS = 180;
/** Default max commits scanned (bounded, local, fast). */
export const GIT_MAX_COMMITS = 2000;

const REC = "\u001e"; // record start
const SEP = "\u001f"; // field separator
const DAY_MS = 86_400_000;

export type GitSignals = {
  readonly signals: Map<string, GitFileSignal>;
  readonly summary: GitRepoSummary;
  /** Distinct commits per calendar day, ascending by date (repo-wide). */
  readonly days: GitDayBucket[];
};

export type ParseGitLogOptions = {
  /** Reference "now" for recency/week bucketing (ms epoch). */
  readonly now: number;
  /** Restrict output to these paths (analyzed files) when provided. */
  readonly keepPaths?: ReadonlySet<string>;
  readonly weeks?: number;
  readonly recencyWindowDays?: number;
};

type MutFile = {
  path: string;
  lastCommit: GitCommitRef | null;
  lastAdditions: number;
  lastDeletions: number;
  commits: number;
  additions: number;
  deletions: number;
  authors: Map<string, GitContributor>;
  recent: GitCommitRef[];
  weeks: number[];
};

/**
 * Parse `git log --numstat` output (see {@link gitLogArgs}) into per-file
 * signals. Pure and deterministic given `now` — the IO lives in
 * {@link readGitSignals}.
 */
export function parseGitLog(
  stdout: string,
  options: ParseGitLogOptions,
): GitSignals {
  const weeksLen = options.weeks ?? GIT_WEEKS;
  const windowDays = options.recencyWindowDays ?? GIT_RECENCY_WINDOW_DAYS;
  const files = new Map<string, MutFile>();
  const shas = new Set<string>();
  const dayCounts = new Map<string, number>();
  let firstDate: string | undefined;
  let lastDate: string | undefined;
  let headSha: string | undefined;

  let current: GitCommitRef | null = null;
  let currentAgeDays = 0;

  const lines = stdout.split("\n");
  for (const raw of lines) {
    if (raw.startsWith(REC)) {
      const [sha, author, email, date, ...rest] = raw.slice(1).split(SEP);
      if (!sha || !author || !date) {
        current = null;
        continue;
      }
      const message = rest.join(SEP);
      current = {
        sha,
        author,
        date,
        message,
        ...(email ? { email } : {}),
      };
      headSha ??= sha;
      if (!shas.has(sha)) {
        shas.add(sha);
        // Distinct commits per calendar day (repo-wide, unfiltered by path).
        const dayKey = date.slice(0, 10);
        if (dayKey) dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
      }
      if (!lastDate || date > lastDate) lastDate = date;
      if (!firstDate || date < firstDate) firstDate = date;
      const t = Date.parse(date);
      currentAgeDays = Number.isNaN(t)
        ? windowDays
        : Math.max(0, (options.now - t) / DAY_MS);
      continue;
    }
    if (!current || raw.trim() === "") continue;

    const parts = raw.split("\t");
    if (parts.length < 3) continue;
    const added = parts[0] === "-" ? 0 : Number.parseInt(parts[0] ?? "0", 10);
    const deleted = parts[1] === "-" ? 0 : Number.parseInt(parts[1] ?? "0", 10);
    let path = parts.slice(2).join("\t");
    // Rename form "old => new" / "dir/{a => b}/x": keep the new path.
    if (path.includes("=>")) {
      path = path
        .replace(/\{[^}]*=>\s*([^}]*)\}/g, "$1")
        .replace(/^.*=>\s*/, "")
        .replace(/\/\//g, "/")
        .trim();
    }
    if (!path) continue;
    if (options.keepPaths && !options.keepPaths.has(path)) continue;

    let f = files.get(path);
    if (!f) {
      f = {
        path,
        lastCommit: null,
        lastAdditions: 0,
        lastDeletions: 0,
        commits: 0,
        additions: 0,
        deletions: 0,
        authors: new Map(),
        recent: [],
        weeks: Array.from({ length: weeksLen }, () => 0),
      };
      files.set(path, f);
    }
    // log is newest-first, so the first commit seen is the latest.
    if (f.lastCommit === null) {
      f.lastCommit = current;
      f.lastAdditions = Number.isNaN(added) ? 0 : added;
      f.lastDeletions = Number.isNaN(deleted) ? 0 : deleted;
    }
    f.commits += 1;
    f.additions += Number.isNaN(added) ? 0 : added;
    f.deletions += Number.isNaN(deleted) ? 0 : deleted;
    if (f.recent.length < 5) f.recent.push(current);
    const prev = f.authors.get(current.author);
    f.authors.set(current.author, {
      author: current.author,
      commits: (prev?.commits ?? 0) + 1,
      additions: (prev?.additions ?? 0) + (Number.isNaN(added) ? 0 : added),
      deletions: (prev?.deletions ?? 0) + (Number.isNaN(deleted) ? 0 : deleted),
    });
    const bucket = Math.floor(currentAgeDays / 7);
    if (bucket >= 0 && bucket < weeksLen) {
      f.weeks[weeksLen - 1 - bucket]! += 1;
    }
  }

  const signals = new Map<string, GitFileSignal>();
  for (const [path, f] of files) {
    if (!f.lastCommit) continue;
    const ageDays = Math.max(
      0,
      (options.now - Date.parse(f.lastCommit.date)) / DAY_MS,
    );
    const recency = Number.isNaN(ageDays)
      ? 0
      : Math.max(0, Math.min(1, 1 - ageDays / windowDays));
    const contributors = [...f.authors.values()].sort(
      (a, b) => b.commits - a.commits || a.author.localeCompare(b.author),
    );
    signals.set(path, {
      path,
      lastCommit: f.lastCommit,
      commits: f.commits,
      additions: f.additions,
      deletions: f.deletions,
      lastAdditions: f.lastAdditions,
      lastDeletions: f.lastDeletions,
      contributors,
      recent: f.recent,
      weeks: f.weeks,
      recency,
    });
  }

  const days: GitDayBucket[] = [...dayCounts.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, commits]) => ({ date, commits }));

  return {
    signals,
    days,
    summary: {
      ...(headSha === undefined ? {} : { headSha }),
      totalCommits: shas.size,
      windowCommits: shas.size,
      ...(firstDate === undefined ? {} : { firstDate }),
      ...(lastDate === undefined ? {} : { lastDate }),
    },
  };
}

/** `git log` args used by {@link readGitSignals} (exported for tests). */
export function gitLogArgs(maxCommits: number): string[] {
  return [
    "log",
    "--no-merges",
    "--numstat",
    "--date=iso-strict",
    `-n${maxCommits}`,
    `--format=${REC}%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s`,
  ];
}

export type ReadGitSignalsOptions = {
  readonly keepPaths?: ReadonlySet<string>;
  readonly maxCommits?: number;
  readonly now?: number;
};

/**
 * Read local git history for `rootPath`. Returns `null` (fail soft) when the
 * path is not a git work tree or `git` is unavailable. No network.
 */
export function readGitSignals(
  rootPath: string,
  options: ReadGitSignalsOptions = {},
): GitSignals | null {
  const run = (args: string[]): string | null => {
    try {
      return execFileSync("git", ["-C", rootPath, ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 15_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };

  const inside = run(["rev-parse", "--is-inside-work-tree"]);
  if (!inside || inside.trim() !== "true") return null;

  const stdout = run(gitLogArgs(options.maxCommits ?? GIT_MAX_COMMITS));
  if (stdout === null) return null;

  const parsed = parseGitLog(stdout, {
    now: options.now ?? Date.now(),
    ...(options.keepPaths === undefined
      ? {}
      : { keepPaths: options.keepPaths }),
  });

  const branch = run(["rev-parse", "--abbrev-ref", "HEAD"])?.trim();
  if (branch && branch !== "HEAD") {
    return {
      signals: parsed.signals,
      days: parsed.days,
      summary: { ...parsed.summary, branch },
    };
  }
  return parsed;
}
