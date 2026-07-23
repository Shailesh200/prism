import { execFileSync } from "node:child_process";

/** Default sample size for Trends history backfill (ADR-0023). */
export const HEALTH_HISTORY_BACKFILL_DEFAULT_COMMITS = 18;

export type SampledCommit = {
  readonly sha: string;
  /** ISO author date from git. */
  readonly at: string;
};

/**
 * Sample up to `maxCommits` commits evenly from `git rev-list` (newest→oldest).
 * Fail-soft: returns [] when not a git work tree.
 */
export function sampleGitCommits(
  rootPath: string,
  options: { readonly maxCommits?: number } = {},
): SampledCommit[] {
  const max = Math.max(
    1,
    Math.min(options.maxCommits ?? HEALTH_HISTORY_BACKFILL_DEFAULT_COMMITS, 48),
  );

  const run = (args: string[]): string | null => {
    try {
      return execFileSync("git", ["-C", rootPath, ...args], {
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024,
        timeout: 10_000,
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return null;
    }
  };

  const inside = run(["rev-parse", "--is-inside-work-tree"]);
  if (!inside || inside.trim() !== "true") return [];

  // Fetch a wider window then sample evenly so long histories still span time.
  const window = Math.max(max * 8, max);
  const stdout = run([
    "rev-list",
    `--max-count=${window}`,
    "--format=%H %aI",
    "HEAD",
  ]);
  if (!stdout) return [];

  const all: SampledCommit[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("commit ")) continue;
    const space = trimmed.indexOf(" ");
    if (space <= 0) continue;
    const sha = trimmed.slice(0, space);
    const at = trimmed.slice(space + 1).trim();
    if (!sha || !at) continue;
    all.push({ sha, at });
  }

  if (all.length <= max) return all;

  const sampled: SampledCommit[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.round((i * (all.length - 1)) / (max - 1));
    const c = all[idx];
    if (!c) continue;
    if (sampled.some((s) => s.sha === c.sha)) continue;
    sampled.push(c);
  }
  return sampled;
}

/** Current HEAD sha, or undefined when unavailable. */
export function readHeadCommitSha(rootPath: string): string | undefined {
  try {
    const sha = execFileSync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5_000,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return sha || undefined;
  } catch {
    return undefined;
  }
}
