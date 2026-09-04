/**
 * Claude Code statusLine support (M-066 P-P5).
 *
 * `prism-hub statusline` prints one compact line of live Dispatch state for
 * the footer Claude Code pins under the prompt. It reads the same per-repo
 * `.prism/dispatch/` files the hub watches — no daemon, no network — so it
 * works over SSH, in tmux, and when the hub has idle-exited.
 *
 * Claude Code pipes session JSON on stdin; we use `workspace.current_dir` to
 * put the repo you're sitting in first.
 */

import {
  isLiveJobStatus,
  reapJobs,
  type JobRecord,
} from "@repo-prism/dispatch";
import { formatDuration, primaryDurationMs } from "@repo-prism/shared";
import { loadRegistry } from "./registry.js";
import type { HubEnv } from "./paths.js";

/** Claude Code's statusLine stdin payload (the fields we read). */
export type StatuslineStdin = {
  readonly cwd?: string;
  readonly workspace?: { readonly current_dir?: string };
};

export function parseStatuslineStdin(raw: string): { cwd: string } {
  try {
    const parsed = JSON.parse(raw) as StatuslineStdin;
    const cwd = parsed.workspace?.current_dir ?? parsed.cwd ?? "";
    return { cwd: typeof cwd === "string" ? cwd : "" };
  } catch {
    return { cwd: "" };
  }
}

function isAwaitingReview(job: JobRecord): boolean {
  return job.status === "needs_review";
}

function isFailed(job: JobRecord): boolean {
  return job.status === "error";
}

/**
 * The same duration the board shows for the same job (M-067 P-S1).
 *
 * This used to measure from `updatedAt` while the board measured from
 * `createdAt`, so a single job displayed two different times depending on
 * where you looked. Both now go through `primaryDurationMs`, and both show
 * seconds — the old `formatStallDuration` floored to whole minutes, so a
 * 40-second job read as `0m`.
 */
function elapsed(job: JobRecord, now: number): string {
  return formatDuration(primaryDurationMs(job, now)) ?? "";
}

/** One line, ≤ ~120 chars, ADR-0039 voice: titles, never paths. */
export function formatStatusline(
  current: readonly JobRecord[],
  others: readonly JobRecord[],
  now = Date.now(),
): string {
  const live = current.filter((job) => isLiveJobStatus(job.status));
  const review = current.filter(isAwaitingReview);
  const failed = current.filter(isFailed);
  const otherLive = others.filter(
    (job) => isLiveJobStatus(job.status) || isAwaitingReview(job),
  );

  const parts: string[] = [];
  const freshest = [...live].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )[0];
  if (freshest) {
    const activity = freshest.lastActivity?.trim();
    const when = elapsed(freshest, now);
    parts.push(
      [`◆ ${freshest.title || freshest.id}`, activity, when ? `${when}` : ""]
        .filter(Boolean)
        .join(" · "),
    );
    if (live.length > 1) parts.push(`+${live.length - 1} running`);
  }
  // A gated job will never move on its own, so it outranks a review in the
  // footer: the user is the only thing that can unblock it.
  for (const gated of current
    .filter((row) => row.status === "needs_confirm")
    .slice(0, 2)) {
    parts.push(`? ${gated.title || gated.id} needs your OK`);
  }
  for (const job of review.slice(0, 2)) {
    parts.push(`✓ ${job.title || job.id} ready for review`);
  }
  if (review.length > 2) parts.push(`+${review.length - 2} more to review`);
  for (const job of failed.slice(0, 1)) {
    parts.push(`✗ ${job.title || job.id} stopped`);
  }
  if (otherLive.length > 0) {
    parts.push(`${otherLive.length} in other repos`);
  }
  return parts.join("  |  ");
}

/**
 * The line for this moment. Empty string when nothing is happening anywhere —
 * a quiet footer is the correct default.
 */
export async function buildStatusline(
  stdinRaw: string,
  env: HubEnv = process.env,
): Promise<string> {
  const { cwd } = parseStatuslineStdin(stdinRaw);
  const workspaces = await loadRegistry(env);
  const current: JobRecord[] = [];
  const others: JobRecord[] = [];
  for (const entry of workspaces) {
    let jobs: JobRecord[] = [];
    try {
      jobs = await reapJobs(entry.path);
    } catch {
      continue; // a vanished repo must not break the footer
    }
    if (cwd && (cwd === entry.path || cwd.startsWith(`${entry.path}/`))) {
      current.push(...jobs);
    } else {
      others.push(...jobs);
    }
  }
  return formatStatusline(current, others);
}

/** Jobs parked on a gate need naming, or the user waits for something that will never move. */
export function confirmCount(jobs: readonly JobRecord[]): number {
  return jobs.filter((job) => job.status === "needs_confirm").length;
}

/** The settings.json block Claude Code needs, for `statusline --setup`. */
export function statuslineSetupSnippet(): string {
  return JSON.stringify(
    {
      statusLine: {
        type: "command",
        command:
          "npx -y --prefer-online @repo-prism/dispatch-hub@latest statusline",
        refreshInterval: 5,
      },
    },
    null,
    2,
  );
}
