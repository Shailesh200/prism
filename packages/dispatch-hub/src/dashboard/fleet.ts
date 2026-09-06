import {
  isLiveJob,
  isSettledJob,
  type JobSummary,
} from "@repo-prism/app-shell";
import { jobDurations } from "@repo-prism/shared";
import { ganttSegmentPercents } from "@repo-prism/ui";

export const RANGE_MS = {
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "6h": 6 * 60 * 60 * 1000,
  "12h": 12 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  all: Number.MAX_SAFE_INTEGER,
} as const;

export type FleetRange = keyof typeof RANGE_MS;

export const FLEET_RANGES: readonly FleetRange[] = [
  "30m",
  "1h",
  "6h",
  "12h",
  "24h",
  "7d",
  "all",
];

export const RANGE_LABELS: Record<FleetRange, string> = {
  "30m": "30m",
  "1h": "1h",
  "6h": "6h",
  "12h": "12h",
  "24h": "24h",
  "7d": "7d",
  all: "All",
};

export const DEFAULT_FLEET_RANGE: FleetRange = "1h";

export function rangeStartForAll(
  jobs: readonly JobSummary[],
  nowMs: number,
): number {
  let earliest = nowMs;
  for (const job of jobs) {
    const start = Date.parse(
      job.queuedAt ?? job.createdAt ?? job.updatedAt ?? "",
    );
    if (Number.isFinite(start) && start < earliest) earliest = start;
  }
  return Math.min(earliest, nowMs - 60 * 60 * 1000);
}

export type FleetViewMode = "timeline" | "board" | "list";

export const VIEW_STORAGE_KEY = "prism.console.view";
export const TILES_STORAGE_KEY = "prism.console.tiles";

export function parseFleetView(raw: string | null): FleetViewMode {
  if (raw === "board" || raw === "list" || raw === "timeline") return raw;
  return "timeline";
}

export function jobPlaybookNotch(
  playbook: string | undefined,
): "chat" | "console" | "finding" {
  if (playbook === "console") return "console";
  if (playbook === "finding") return "finding";
  return "chat";
}

export function jobWindow(
  job: JobSummary,
  nowMs: number,
): {
  readonly startMs: number;
  readonly midMs: number | undefined;
  readonly endMs: number;
} {
  const start = Date.parse(
    job.queuedAt ?? job.createdAt ?? job.updatedAt ?? "",
  );
  const mid = job.startedAt ? Date.parse(job.startedAt) : undefined;
  const endRaw = job.finishedAt
    ? Date.parse(job.finishedAt)
    : isLiveJob(job.status)
      ? nowMs
      : Date.parse(job.updatedAt ?? "");
  return {
    startMs: Number.isFinite(start) ? start : nowMs,
    midMs: mid !== undefined && Number.isFinite(mid) ? mid : undefined,
    endMs: Number.isFinite(endRaw) ? endRaw : nowMs,
  };
}

export type GanttBar = {
  readonly job: JobSummary;
  readonly waited?: { readonly left: number; readonly width: number };
  readonly worked?: { readonly left: number; readonly width: number };
};

export function ganttBarsForRepo(
  jobs: readonly JobSummary[],
  range: FleetRange,
  nowMs: number,
): readonly GanttBar[] {
  const rangeEnd = nowMs;
  const rangeStart =
    range === "all" ? rangeStartForAll(jobs, nowMs) : nowMs - RANGE_MS[range];
  const bars: GanttBar[] = [];
  for (const job of jobs) {
    const win = jobWindow(job, nowMs);
    if (win.endMs < rangeStart || win.startMs > rangeEnd) continue;
    const mid = win.midMs ?? (isLiveJob(job.status) ? nowMs : win.endMs);
    const waited = ganttSegmentPercents(rangeStart, rangeEnd, win.startMs, mid);
    const worked = ganttSegmentPercents(rangeStart, rangeEnd, mid, win.endMs);
    bars.push({
      job,
      ...(waited ? { waited } : {}),
      ...(worked ? { worked } : {}),
    });
  }
  return bars;
}

export type GanttCluster = {
  readonly jobs: readonly JobSummary[];
  readonly waited?: { readonly left: number; readonly width: number };
  readonly worked?: { readonly left: number; readonly width: number };
  readonly atMs: number;
};

function barStart(bar: GanttBar): number {
  return bar.waited?.left ?? bar.worked?.left ?? 0;
}

function barEnd(bar: GanttBar): number {
  const waitedEnd = bar.waited
    ? bar.waited.left + bar.waited.width
    : undefined;
  const workedEnd = bar.worked
    ? bar.worked.left + bar.worked.width
    : undefined;
  return Math.max(waitedEnd ?? 0, workedEnd ?? 0);
}

/**
 * Nearby starts (within `mergePct` of the track) collapse into one bar.
 * The timeline then paints every cluster on a single repo row.
 */
export function clusterGanttBars(
  bars: readonly GanttBar[],
  mergePct = 3,
): readonly GanttCluster[] {
  const sorted = [...bars].sort((a, b) => barStart(a) - barStart(b));
  const groups: GanttBar[][] = [];
  for (const bar of sorted) {
    const last = groups[groups.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && Math.abs(barStart(bar) - barStart(prev)) < mergePct) {
      last.push(bar);
    } else {
      groups.push([bar]);
    }
  }
  return groups.map((group) => {
    const jobs = group.map((bar) => bar.job);
    const first = group[0];
    const atMs = Date.parse(
      first?.job.startedAt ??
        first?.job.queuedAt ??
        first?.job.createdAt ??
        first?.job.updatedAt ??
        "",
    );
    if (group.length === 1 && first) {
      return {
        jobs,
        ...(first.waited ? { waited: first.waited } : {}),
        ...(first.worked ? { worked: first.worked } : {}),
        atMs: Number.isFinite(atMs) ? atMs : 0,
      };
    }
    const left = Math.min(...group.map(barStart));
    const right = Math.max(...group.map(barEnd));
    return {
      jobs,
      worked: { left, width: Math.max(2, right - left) },
      atMs: Number.isFinite(atMs) ? atMs : 0,
    };
  });
}

/** Overflow caption for a clustered bar. Full title stays on `title`. */
export function clusterBarLabel(count: number): string {
  return count > 1 ? `+${count}` : "";
}

/** Timeline tick caption — clusters as +N, a live job as Running. */
export function timelineBarLabel(jobs: readonly JobSummary[]): string {
  if (jobs.length > 1) return clusterBarLabel(jobs.length);
  const job = jobs[0];
  return job && isLiveJob(job.status) ? "Running" : "";
}

export function jobListKey(job: {
  readonly id: string;
  readonly workspacePath?: string;
}): string {
  return `${job.workspacePath ?? ""}:${job.id}`;
}

/** Replace frozen list-drawer rows with the live feed after a control action. */
export function hydrateJobs(
  snapshot: readonly JobSummary[],
  live: readonly JobSummary[],
): JobSummary[] {
  const byKey = new Map(live.map((job) => [jobListKey(job), job]));
  return snapshot.flatMap((job) => {
    const next = byKey.get(jobListKey(job));
    return next ? [next] : [];
  });
}

/** Newest job first so board lists read as a feed. */
export function jobsChronological(
  jobs: readonly JobSummary[],
): JobSummary[] {
  return [...jobs].sort((a, b) => {
    const aAt = Date.parse(a.createdAt ?? a.queuedAt ?? a.updatedAt ?? "");
    const bAt = Date.parse(b.createdAt ?? b.queuedAt ?? b.updatedAt ?? "");
    return (Number.isFinite(bAt) ? bAt : 0) - (Number.isFinite(aAt) ? aAt : 0);
  });
}

export function verifyTag(
  verification: JobSummary["verification"] | undefined,
): {
  readonly label: "Success" | "Failure" | "NA";
  readonly tone: "emerald" | "rose" | "neutral";
} {
  if (verification === "passed") return { label: "Success", tone: "emerald" };
  if (verification === "failed") return { label: "Failure", tone: "rose" };
  return { label: "NA", tone: "neutral" };
}

export type RepoFleet = {
  readonly path: string;
  readonly label: string;
  readonly error?: string;
  readonly jobs: readonly JobSummary[];
  readonly live: number;
  readonly waiting: number;
  readonly last?: JobSummary;
  readonly verify?: JobSummary["verification"];
};

export function groupRepos(
  jobs: readonly JobSummary[],
  workspaces: readonly {
    readonly path: string;
    readonly label: string;
    readonly error?: string;
  }[],
): readonly RepoFleet[] {
  const byPath = new Map<string, JobSummary[]>();
  for (const job of jobs) {
    const path = job.workspacePath ?? "";
    const list = byPath.get(path) ?? [];
    list.push(job);
    byPath.set(path, list);
  }
  const rows: RepoFleet[] = [];
  const seen = new Set<string>();
  for (const workspace of workspaces) {
    seen.add(workspace.path);
    rows.push(
      repoFleet(
        workspace.path,
        workspace.label,
        byPath.get(workspace.path) ?? [],
        workspace.error,
      ),
    );
  }
  for (const [path, list] of byPath) {
    if (seen.has(path)) continue;
    rows.push(
      repoFleet(path, list[0]?.workspaceLabel ?? path, list, undefined),
    );
  }
  return rows;
}

export function reposWithJobsInRange(
  repos: readonly RepoFleet[],
  range: FleetRange,
  nowMs: number,
): readonly RepoFleet[] {
  return repos.filter(
    (repo) => ganttBarsForRepo(repo.jobs, range, nowMs).length > 0,
  );
}

export function preferredWorkspace(
  workspaces: readonly { readonly path: string; readonly label: string }[],
  jobs: readonly JobSummary[],
): string {
  if (workspaces.length === 0) return "";
  const counts = new Map<string, number>();
  for (const job of jobs) {
    const path = job.workspacePath ?? "";
    counts.set(path, (counts.get(path) ?? 0) + 1);
  }
  const ranked = [...workspaces].sort((a, b) => {
    const byJobs = (counts.get(b.path) ?? 0) - (counts.get(a.path) ?? 0);
    if (byJobs !== 0) return byJobs;
    const prism =
      Number(/^prism$/i.test(b.label)) - Number(/^prism$/i.test(a.label));
    if (prism !== 0) return prism;
    return a.label.localeCompare(b.label);
  });
  return ranked[0]?.path ?? "";
}

function repoFleet(
  path: string,
  label: string,
  jobs: readonly JobSummary[],
  error: string | undefined,
): RepoFleet {
  const last = [...jobs].sort((a, b) => {
    const aAt = Date.parse(a.updatedAt ?? a.createdAt ?? "");
    const bAt = Date.parse(b.updatedAt ?? b.createdAt ?? "");
    return (Number.isFinite(bAt) ? bAt : 0) - (Number.isFinite(aAt) ? aAt : 0);
  })[0];
  const settled = [...jobs].reverse().find((job) => isSettledJob(job.status));
  return {
    path,
    label,
    jobs: jobsChronological(jobs),
    live: jobs.filter((job) => isLiveJob(job.status)).length,
    waiting: jobs.filter(
      (job) =>
        job.status === "needs_confirm" || job.status === "waiting_on_you",
    ).length,
    ...(error ? { error } : {}),
    ...(last ? { last } : {}),
    ...(settled?.verification ? { verify: settled.verification } : {}),
  };
}

export function sparklineValues(
  jobs: readonly JobSummary[],
  range: FleetRange,
  nowMs: number,
  buckets = 14,
): number[] {
  const start =
    range === "all" ? rangeStartForAll(jobs, nowMs) : nowMs - RANGE_MS[range];
  const span = Math.max(1, nowMs - start);
  const width = span / buckets;
  const values = Array.from({ length: buckets }, () => 0);
  for (const job of jobs) {
    const at = Date.parse(job.createdAt ?? job.queuedAt ?? job.updatedAt ?? "");
    if (!Number.isFinite(at) || at < start || at > nowMs) continue;
    const index = Math.min(buckets - 1, Math.floor((at - start) / width));
    values[index] = (values[index] ?? 0) + 1;
  }
  return values;
}

export function attentionJobs(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return jobs.filter(
    (job) => job.status === "needs_confirm" || job.status === "waiting_on_you",
  );
}

export function matchesFilter(job: JobSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    job.title.toLowerCase().includes(q) ||
    (job.workspaceLabel ?? "").toLowerCase().includes(q) ||
    job.status.toLowerCase().includes(q) ||
    job.id.toLowerCase().includes(q)
  );
}

export function waitedWorkedLabel(
  job: JobSummary,
  nowMs: number,
): {
  readonly waited: string;
  readonly worked: string;
} {
  const d = jobDurations(
    {
      createdAt:
        job.createdAt ?? job.updatedAt ?? new Date(nowMs).toISOString(),
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
      lastHeartbeat: job.lastHeartbeat,
      status: job.status,
    },
    nowMs,
  );
  const fmt = (ms: number | undefined): string => {
    if (ms === undefined || ms < 1000) return "0s";
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
    return `${(ms / 3_600_000).toFixed(1)}h`;
  };
  return {
    waited: fmt(d.queued),
    worked: fmt(d.working),
  };
}

export function repoLabel(feed: {
  readonly loading: boolean;
  readonly jobs: readonly unknown[];
  readonly errors: readonly unknown[];
  readonly fatal?: string | undefined;
}): string {
  if (feed.loading) {
    return feed.fatal
      ? "Could not read your repositories"
      : "Reading your repositories…";
  }
  const jobs = `${feed.jobs.length} job${feed.jobs.length === 1 ? "" : "s"}`;
  if (feed.errors.length > 0) {
    const repos = `${feed.errors.length} repo${feed.errors.length === 1 ? "" : "s"}`;
    return `${jobs} · ${repos} unreadable`;
  }
  return `${jobs} across your repositories`;
}

export const PLAYBOOKS = [
  { id: "ticket", label: "None" },
  { id: "console", label: "Blank brief" },
  { id: "finding", label: "From a finding" },
  { id: "prism-review-pr", label: "Review a PR" },
  { id: "prism-safe-change", label: "Safe change" },
  { id: "prism-verify-regression", label: "Verify regression" },
  { id: "prism-ship", label: "Ship" },
  { id: "prism-onboard", label: "Onboard" },
] as const;
