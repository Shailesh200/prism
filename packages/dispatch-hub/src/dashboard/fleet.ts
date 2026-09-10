import {
  isLiveJob,
  isSettledJob,
  jobBadgeTone,
  jobDisplayLabel,
  type JobSummary,
} from "@repo-prism/app-shell";
import { formatDuration, jobDurations } from "@repo-prism/shared";
import { formatPrismDate, ganttSegmentPercents } from "@repo-prism/ui";

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

export const RANGE_MENU_LABELS: Record<FleetRange, string> = {
  "30m": "Last 30 minutes",
  "1h": "Last 1 hour",
  "6h": "Last 6 hours",
  "12h": "Last 12 hours",
  "24h": "Last 24 hours",
  "7d": "Last 7 days",
  all: "All time",
};

export const FLEET_RANGE_PRESETS = FLEET_RANGES.map((id) => ({
  id,
  label: RANGE_MENU_LABELS[id],
  shortLabel: RANGE_LABELS[id],
}));

export const DEFAULT_FLEET_RANGE: FleetRange = "1h";

export type FleetTimeRange = FleetRange | TimeWindow;

export function isTimeWindow(value: unknown): value is TimeWindow {
  return (
    typeof value === "object" &&
    value !== null &&
    "startMs" in value &&
    "endMs" in value &&
    typeof (value as TimeWindow).startMs === "number" &&
    typeof (value as TimeWindow).endMs === "number"
  );
}

export function resolveRangeWindow(
  range: FleetTimeRange,
  nowMs: number,
): TimeWindow {
  return isTimeWindow(range) ? range : selectedRangeWindow(range, nowMs);
}

export function rangeStartForAll(
  jobs: readonly JobSummary[],
  nowMs: number,
): number {
  return contentTimeWindow(jobs, "all", nowMs).startMs;
}

export type TimeWindow = {
  readonly startMs: number;
  readonly endMs: number;
};

/** The filter window: All is unbounded, 7d is now-minus-7d → now. */
export function selectedRangeWindow(
  range: FleetRange,
  nowMs: number,
): TimeWindow {
  return {
    startMs:
      range === "all" ? Number.NEGATIVE_INFINITY : nowMs - RANGE_MS[range],
    endMs: nowMs,
  };
}

/**
 * Crop a repo's axis to the jobs that actually sit in the selected range.
 *
 * All, or a filter wider than the work (7d with only 3d of jobs), paints
 * first job → last job in chronological order. Empty pad out to now, or
 * out to a sibling repo's older work, is not part of this window.
 */
export function contentTimeWindow(
  jobs: readonly JobSummary[],
  range: FleetTimeRange,
  nowMs: number,
): TimeWindow {
  const selected = resolveRangeWindow(range, nowMs);
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  for (const job of jobs) {
    const win = jobWindow(job, nowMs);
    if (win.endMs < selected.startMs || win.startMs > selected.endMs) continue;
    start = Math.min(start, win.startMs);
    end = Math.max(end, win.endMs);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    if (isTimeWindow(range)) {
      const span = range.endMs - range.startMs;
      if (Number.isFinite(span) && span > 0 && Number.isFinite(range.startMs)) {
        return range;
      }
      return { startMs: nowMs - 60 * 60 * 1000, endMs: nowMs };
    }
    return {
      startMs:
        range === "all" ? nowMs - 60 * 60 * 1000 : nowMs - RANGE_MS[range],
      endMs: nowMs,
    };
  }
  const pad = Math.max((end - start) * 0.03, 15_000);
  return { startMs: start - pad, endMs: end + pad };
}

/** Quarter-marks for the Nowboard track grid. The playhead is drawn separately. */
export const TRACK_GRID_MARKS = [0, 25, 50, 75] as const;

/**
 * Where `now` sits on a cropped axis, or `undefined` when it is off the crop
 * (All / a finished span that does not reach the present).
 *
 * Clamped in from 100% so the 2px hairline is not clipped by overflow.
 */
export function nowPlayheadPercent(
  window: TimeWindow,
  nowMs: number,
): number | undefined {
  const span = window.endMs - window.startMs;
  if (span <= 0) return undefined;
  if (nowMs < window.startMs || nowMs > window.endMs) return undefined;
  const raw = ((nowMs - window.startMs) / span) * 100;
  return Math.min(99.5, Math.max(0, raw));
}

/** Faint vertical lines; skip any mark that would sit on the playhead. */
export function trackGridPercents(nowPercent?: number): readonly number[] {
  if (nowPercent === undefined) return [...TRACK_GRID_MARKS];
  return TRACK_GRID_MARKS.filter((mark) => Math.abs(mark - nowPercent) > 2);
}

/** Worked-segment pulse: executing, not queued / gated / blocked. */
export function isWorkingJob(status: JobSummary["status"]): boolean {
  return status === "running" || status === "booting" || status === "ready";
}

/** Queue a sibling job from this one's write-up. Not for a live run. */
export function canStartFromJob(status: JobSummary["status"]): boolean {
  return status !== "running";
}

/** Follow-up text for a teammate that is already working. */
export function canInstructJob(status: JobSummary["status"]): boolean {
  return status === "running";
}

/** Height of one job lane (Magic Patterns Axis & Lanes). */
export const LANE_HEIGHT = 28;

/** Lanes shown before the repo is expanded. */
export const MAX_VISIBLE_LANES = 3;

export function laneTag(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function visibleTimelineLanes<T>(
  lanes: readonly T[],
  expanded: boolean,
): readonly T[] {
  if (expanded || lanes.length <= MAX_VISIBLE_LANES) return lanes;
  return lanes.slice(0, MAX_VISIBLE_LANES);
}

/**
 * Shared time window for the Timeline axis so every repo paints on the
 * same clock. Finite ranges are now-minus-range → now unless the visible
 * work is a small slice of that filter — then crop to the jobs so a
 * 3-minute error is readable. All crops to first → last job.
 */
export function fleetAxisWindow(
  jobs: readonly JobSummary[],
  range: FleetRange,
  nowMs: number,
): TimeWindow {
  if (range === "all") {
    return contentTimeWindow(jobs, "all", nowMs);
  }
  const startMs = nowMs - RANGE_MS[range];
  const pad = Math.max((nowMs - startMs) * 0.03, 15_000);
  const selected: TimeWindow = { startMs, endMs: nowMs + pad };
  if (jobs.length === 0) return selected;
  const content = contentTimeWindow(jobs, range, nowMs);
  const selectedSpan = selected.endMs - selected.startMs;
  const contentSpan = Math.max(0, content.endMs - content.startMs);
  // A 3-minute error on a 1h clock is a hairline. When the work itself is a
  // small slice of the filter, crop to it so start→end can be read.
  if (contentSpan > 0 && contentSpan < selectedSpan * 0.2) {
    return content;
  }
  return selected;
}

/** Timestamp under a Grafana-style hover playhead. */
export function hoverTimeMs(window: TimeWindow, percent: number): number {
  const span = Math.max(1, window.endMs - window.startMs);
  const pct = Math.max(0, Math.min(100, percent));
  return window.startMs + (pct / 100) * span;
}

export function pointerPercent(
  clientX: number,
  rect: { readonly left: number; readonly width: number },
): number {
  if (rect.width <= 0) return 0;
  return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
}

function latestTimestampMs(
  ...values: readonly (string | undefined)[]
): number | undefined {
  let best: number | undefined;
  for (const value of values) {
    if (!value) continue;
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) continue;
    if (best === undefined || ms > best) best = ms;
  }
  return best;
}

export function axisTickMarks(
  window: TimeWindow,
): readonly { readonly left: number; readonly atMs: number }[] {
  const span = Math.max(1, window.endMs - window.startMs);
  return TRACK_GRID_MARKS.map((left) => ({
    left,
    atMs: window.startMs + (left / 100) * span,
  }));
}

const AXIS_DATE_SPAN_MS = 36 * 60 * 60 * 1000;

/** Finite ranges stay on a clock; spans longer than ~1.5 days use dates. */
export function axisLabelStyle(window: TimeWindow): "time" | "date" {
  return window.endMs - window.startMs <= AXIS_DATE_SPAN_MS ? "time" : "date";
}

export type FleetViewMode = "timeline" | "board" | "list";

export const VIEW_STORAGE_KEY = "prism.console.view";
export const TILES_STORAGE_KEY = "prism.console.tiles";

export function parseFleetView(raw: string | null): FleetViewMode {
  if (raw === "pulse" || raw === "timeline") return "timeline";
  if (raw === "board" || raw === "list") return raw;
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
  const endRaw = isLiveJob(job.status)
    ? nowMs
    : (latestTimestampMs(job.finishedAt, job.lastHeartbeat, job.updatedAt) ??
      nowMs);
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
  axis?: TimeWindow,
): readonly GanttBar[] {
  const selected = selectedRangeWindow(range, nowMs);
  const window = axis ?? contentTimeWindow(jobs, range, nowMs);
  const bars: GanttBar[] = [];
  for (const job of jobs) {
    const win = jobWindow(job, nowMs);
    if (win.endMs < selected.startMs || win.startMs > selected.endMs) continue;
    const mid = win.midMs ?? (isLiveJob(job.status) ? nowMs : win.endMs);
    const waited = ganttSegmentPercents(
      window.startMs,
      window.endMs,
      win.startMs,
      mid,
    );
    const worked = ganttSegmentPercents(
      window.startMs,
      window.endMs,
      mid,
      win.endMs,
    );
    bars.push({
      job,
      ...(waited ? { waited } : {}),
      ...(worked ? { worked } : {}),
    });
  }
  return bars;
}

function jobLaneTime(job: JobSummary): number {
  const at = Date.parse(
    job.startedAt ?? job.queuedAt ?? job.createdAt ?? job.updatedAt ?? "",
  );
  return Number.isFinite(at) ? at : 0;
}

/** One colour bar per in-range job, latest first on the lane stack. */
export function timelineLanesForRepo(
  jobs: readonly JobSummary[],
  range: FleetRange,
  nowMs: number,
  axis: TimeWindow,
): readonly GanttBar[] {
  return [...ganttBarsForRepo(jobs, range, nowMs, axis)].sort(
    (a, b) => jobLaneTime(b.job) - jobLaneTime(a.job),
  );
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
  const waitedEnd = bar.waited ? bar.waited.left + bar.waited.width : undefined;
  const workedEnd = bar.worked ? bar.worked.left + bar.worked.width : undefined;
  return Math.max(waitedEnd ?? 0, workedEnd ?? 0);
}

function barSpan(bar: GanttBar): number {
  return Math.max(0, barEnd(bar) - barStart(bar));
}

/** Live job if any, else the longest bar — the Calendar "top" event. */
function primaryBar(group: readonly GanttBar[]): GanttBar {
  const first = group[0];
  if (!first) {
    throw new Error("empty gantt group");
  }
  const live = group.find((bar) => isLiveJob(bar.job.status));
  if (live) return live;
  return group.reduce(
    (best, bar) => (barSpan(bar) >= barSpan(best) ? bar : best),
    first,
  );
}

function clusterFromGroup(group: readonly GanttBar[]): GanttCluster {
  const primary = primaryBar(group);
  const jobs = group.map((bar) => bar.job);
  const atMs = Date.parse(
    primary.job.startedAt ??
      primary.job.queuedAt ??
      primary.job.createdAt ??
      primary.job.updatedAt ??
      "",
  );
  const stamp = Number.isFinite(atMs) ? atMs : 0;
  if (group.length === 1) {
    return {
      jobs,
      ...(primary.waited ? { waited: primary.waited } : {}),
      ...(primary.worked ? { worked: primary.worked } : {}),
      atMs: stamp,
    };
  }
  const left = Math.min(...group.map(barStart));
  const right = Math.max(...group.map(barEnd));
  return {
    jobs,
    worked: { left, width: Math.max(0.35, right - left) },
    atMs: stamp,
  };
}

function groupOverlappingBars(
  bars: readonly GanttBar[],
  nowMs: number,
): GanttBar[][] {
  const sorted = [...bars].sort((a, b) => {
    const aWin = jobWindow(a.job, nowMs);
    const bWin = jobWindow(b.job, nowMs);
    return aWin.startMs - bWin.startMs || aWin.endMs - bWin.endMs;
  });
  const groups: GanttBar[][] = [];
  for (const bar of sorted) {
    const last = groups[groups.length - 1];
    const start = jobWindow(bar.job, nowMs).startMs;
    const lastEnd = last
      ? Math.max(...last.map((item) => jobWindow(item.job, nowMs).endMs))
      : 0;
    if (last && start < lastEnd) {
      last.push(bar);
    } else {
      groups.push([bar]);
    }
  }
  return groups;
}

/**
 * Jobs that overlap in real time share a cluster. Sequential jobs keep their
 * own duration even when a long range paints them on the same pixels.
 */
export function clusterGanttBars(
  bars: readonly GanttBar[],
  nowMs = Date.now(),
): readonly GanttCluster[] {
  return groupOverlappingBars(bars, nowMs).map(clusterFromGroup);
}

/** How many job bars share a Timeline row before leftover jobs become +N more. */
export const TIMELINE_MAX_LANES = 2;

/** Chips shown on Recent failures before +N more. */
export const FAILURES_VISIBLE = 3;

export type TimelineLaneBar = GanttBar & {
  readonly lane: number;
};

export type TimelineOverflow = {
  readonly jobs: readonly JobSummary[];
  readonly left: number;
  readonly width: number;
  readonly atMs: number;
};

/** Matches `.fleet-bar--more` so title slots and chip placement agree. */
export const OVERFLOW_CHIP_REM = 4.5;

export type TimelinePack = {
  readonly bars: readonly TimelineLaneBar[];
  readonly overflows: readonly TimelineOverflow[];
  readonly laneCount: number;
};

/**
 * Pack jobs onto one horizontal track.
 *
 * Sequential jobs share the row. Concurrent jobs keep their own span and
 * colour and overlay in z-order (later lane on top). Past `maxLanes` visible
 * bars, leftover concurrent jobs become +N more chips on that same row.
 */
export function packTimelineLanes(
  bars: readonly GanttBar[],
  nowMs = Date.now(),
  maxLanes = TIMELINE_MAX_LANES,
): TimelinePack {
  const sorted = [...bars].sort((a, b) => {
    const aWin = jobWindow(a.job, nowMs);
    const bWin = jobWindow(b.job, nowMs);
    return aWin.startMs - bWin.startMs || aWin.endMs - bWin.endMs;
  });
  const laneEnds: number[] = [];
  const assigned: TimelineLaneBar[] = [];
  for (const bar of sorted) {
    const win = jobWindow(bar.job, nowMs);
    let lane = laneEnds.findIndex((end) => win.startMs >= end);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(win.endMs);
    } else {
      laneEnds[lane] = win.endMs;
    }
    assigned.push({ ...bar, lane });
  }
  const visible = assigned.filter((row) => row.lane < maxLanes);
  const overflowBars: GanttBar[] = assigned
    .filter((row) => row.lane >= maxLanes)
    .map((row) => ({
      job: row.job,
      ...(row.waited ? { waited: row.waited } : {}),
      ...(row.worked ? { worked: row.worked } : {}),
    }));
  const overflows: TimelineOverflow[] = groupOverlappingBars(
    overflowBars,
    nowMs,
  ).map((group) => {
    const left = Math.min(100, Math.max(0, Math.max(...group.map(barEnd))));
    const primary = primaryBar(group);
    const atMs = Date.parse(
      primary.job.startedAt ??
        primary.job.queuedAt ??
        primary.job.createdAt ??
        primary.job.updatedAt ??
        "",
    );
    return {
      jobs: group.map((item) => item.job),
      left,
      width: 0,
      atMs: Number.isFinite(atMs) ? atMs : 0,
    };
  });
  return { bars: visible, overflows, laneCount: 1 };
}

/** First `limit` items, plus how many are hidden behind +N more. */
export function stackVisible<T>(
  items: readonly T[],
  limit: number,
): { readonly visible: readonly T[]; readonly hidden: number } {
  if (items.length <= limit) return { visible: items, hidden: 0 };
  return {
    visible: items.slice(0, limit),
    hidden: items.length - limit,
  };
}

/** Overflow caption — Calendar's "+2 more", not a total count. */
export function overflowMoreLabel(hidden: number): string {
  return hidden > 0 ? `+${hidden} more` : "";
}

/** Calendar-style caption inside a Timeline bar. */
export function timelineBarLabel(job: JobSummary | undefined): string {
  return job?.title.trim() ?? "";
}

/**
 * Paint a title only when the visible remainder of the bar can hold a few
 * letters. Tight ticks stay colour + HoverTip, like Calendar.
 */
export const TIMELINE_TITLE_MIN_PCT = 12;

export function timelineBarShowsTitle(widthPct: number, insetPct = 0): boolean {
  const remaining = widthPct * Math.max(0, 1 - insetPct / 100);
  return remaining >= TIMELINE_TITLE_MIN_PCT;
}

export function timelineBarTip(
  job: Pick<
    JobSummary,
    "title" | "verification" | "queuedAt" | "createdAt" | "updatedAt"
  >,
  times: { readonly waited: string; readonly worked: string },
  nowMs: number = Date.now(),
): { readonly label: string; readonly detail: string } {
  const verify =
    job.verification === "passed"
      ? "verify passed"
      : job.verification === "failed"
        ? "verify failed"
        : job.verification === "skipped"
          ? "verify NA"
          : "";
  const startIso = job.queuedAt ?? job.createdAt ?? job.updatedAt ?? "";
  const startMs = Date.parse(startIso);
  const start = Number.isFinite(startMs)
    ? `Started ${formatPrismDate(
        startIso,
        new Date(startMs).toDateString() === new Date(nowMs).toDateString()
          ? "time"
          : "datetime",
      )}`
    : "";
  return {
    label: job.title.trim() || "Job",
    detail: [start, `Waited ${times.waited}`, `worked ${times.worked}`, verify]
      .filter(Boolean)
      .join(" · "),
  };
}

export type TitleSlot = {
  /** Left edge of the title, as a percent of this bar. */
  readonly left: number;
  /** Width of the title, as a percent of this bar. */
  readonly width: number;
  /** Same span as a percent of the track — used for the 12% paint gate. */
  readonly trackWidth: number;
};

type TrackSpan = { from: number; to: number };

function mergeSpans(spans: readonly TrackSpan[]): TrackSpan[] {
  const sorted = [...spans]
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);
  const out: TrackSpan[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.from <= last.to + 1e-9) {
      last.to = Math.max(last.to, span.to);
    } else {
      out.push({ from: span.from, to: span.to });
    }
  }
  return out;
}

function gapsIn(
  start: number,
  end: number,
  covered: readonly TrackSpan[],
): TrackSpan[] {
  const gaps: TrackSpan[] = [];
  let cursor = start;
  for (const span of mergeSpans(covered)) {
    const from = Math.max(start, span.from);
    const to = Math.min(end, span.to);
    if (to <= from) continue;
    if (from > cursor) gaps.push({ from: cursor, to: from });
    cursor = Math.max(cursor, to);
  }
  if (end > cursor) gaps.push({ from: cursor, to: end });
  return gaps;
}

/**
 * Where a +N more chip actually sits after clamping so it is not clipped
 * off the left of the track.
 */
export function overflowChipRange(
  overflow: Pick<TimelineOverflow, "left">,
  chipWidthPct: number,
): { readonly left: number; readonly right: number } {
  const width = Math.max(0, chipWidthPct);
  const right = Math.min(100, Math.max(overflow.left, width));
  return { left: right - width, right };
}

/**
 * First uncovered stretch of a bar that can hold a title: past higher-lane
 * overlays and past +N more chips. Returns undefined when nothing that wide
 * is left (tight ticks stay colour + HoverTip).
 */
export function barTitleSlot(
  bar: TimelineLaneBar,
  others: readonly TimelineLaneBar[],
  overflows: readonly TimelineOverflow[] = [],
  chipWidthPct = 0,
): TitleSlot | undefined {
  const start = barStart(bar);
  const end = barEnd(bar);
  const width = end - start;
  if (width <= 0) return undefined;
  const covered: TrackSpan[] = [];
  for (const other of others) {
    if (other.lane <= bar.lane) continue;
    const from = Math.max(start, barStart(other));
    const to = Math.min(end, barEnd(other));
    if (to > from) covered.push({ from, to });
  }
  for (const overflow of overflows) {
    const chip = overflowChipRange(overflow, chipWidthPct);
    const from = Math.max(start, chip.left);
    const to = Math.min(end, chip.right);
    if (to > from) covered.push({ from, to });
  }
  const gap = gapsIn(start, end, covered).find(
    (item) => item.to - item.from >= TIMELINE_TITLE_MIN_PCT,
  );
  if (!gap) return undefined;
  return {
    left: ((gap.from - start) / width) * 100,
    width: ((gap.to - gap.from) / width) * 100,
    trackWidth: gap.to - gap.from,
  };
}

/**
 * How much of this bar's left edge is covered by a higher lane. The title
 * starts after that so the first letter is never hidden under an overlay.
 */
export function barTitleInset(
  bar: TimelineLaneBar,
  others: readonly TimelineLaneBar[],
): number {
  return barTitleSlot(bar, others)?.left ?? 0;
}

export function jobChecksRunning(
  job: Pick<JobSummary, "lastActivity"> | undefined,
): boolean {
  return job?.lastActivity === "Running checks…";
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
export function jobsChronological(jobs: readonly JobSummary[]): JobSummary[] {
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

/** Board / Timeline pill: live job if any, else the repo's latest job — not verify. */
export function timelineRepoStatus(
  repo: Pick<RepoFleet, "live" | "error" | "last" | "jobs">,
): {
  readonly label: string;
  readonly tone: ReturnType<typeof jobBadgeTone>;
} {
  if (repo.error) return { label: "Error", tone: "rose" };
  const live = repo.jobs.find((job) => isLiveJob(job.status));
  const job = live ?? repo.last;
  if (!job) return { label: "NA", tone: "neutral" };
  return {
    label: jobDisplayLabel(job),
    tone: jobBadgeTone(job.status, job.nextStep),
  };
}

/** @deprecated Use timelineRepoStatus — Board shows job status, not verify. */
export function repoStatusTag(
  repo: Pick<RepoFleet, "live" | "error" | "last" | "jobs">,
): ReturnType<typeof timelineRepoStatus> {
  return timelineRepoStatus(repo);
}

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
  for (const workspace of workspaces) {
    rows.push(
      repoFleet(
        workspace.path,
        workspace.label,
        byPath.get(workspace.path) ?? [],
        workspace.error,
      ),
    );
  }
  return rows;
}

export function jobsInRange(
  jobs: readonly JobSummary[],
  range: FleetTimeRange,
  nowMs: number,
): JobSummary[] {
  const selected = resolveRangeWindow(range, nowMs);
  return jobs.filter((job) => {
    const win = jobWindow(job, nowMs);
    return win.endMs >= selected.startMs && win.startMs <= selected.endMs;
  });
}

/** Jobs that exist but sit outside the Pulse / List time window. */
export function jobsOutsideRange(
  jobs: readonly JobSummary[],
  range: FleetTimeRange,
  nowMs: number,
): number {
  return Math.max(0, jobs.length - jobsInRange(jobs, range, nowMs).length);
}

export function reposWithJobsInRange(
  repos: readonly RepoFleet[],
  range: FleetTimeRange,
  nowMs: number,
): readonly RepoFleet[] {
  return repos.filter(
    (repo) => jobsInRange(repo.jobs, range, nowMs).length > 0,
  );
}

/** Registered repos stay visible even when the range has no bars. */
export function visibleFleetRepos(
  jobs: readonly JobSummary[],
  workspaces: readonly {
    readonly path: string;
    readonly label: string;
    readonly error?: string;
  }[],
  filter: string,
  repoFilter: string | undefined,
): readonly RepoFleet[] {
  const visible = jobs.filter(
    (job) =>
      matchesFilter(job, filter) &&
      (!repoFilter || repoFilter === "all" || job.workspacePath === repoFilter),
  );
  const scoped =
    repoFilter && repoFilter !== "all"
      ? workspaces.filter((row) => row.path === repoFilter)
      : workspaces;
  const groups = groupRepos(visible, scoped);
  if (!filter.trim()) return groups;
  return groups.filter(
    (repo) =>
      repo.label.toLowerCase().includes(filter.trim().toLowerCase()) ||
      repo.jobs.length > 0,
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
  range: FleetTimeRange,
  nowMs: number,
  buckets = 14,
): number[] {
  const window = contentTimeWindow(jobs, range, nowMs);
  const span = Math.max(1, window.endMs - window.startMs);
  const width = span / buckets;
  const values = Array.from({ length: buckets }, () => 0);
  const selected = resolveRangeWindow(range, nowMs);
  for (const job of jobs) {
    const at = Date.parse(job.createdAt ?? job.queuedAt ?? job.updatedAt ?? "");
    if (!Number.isFinite(at) || at < selected.startMs || at > selected.endMs) {
      continue;
    }
    const index = Math.min(
      buckets - 1,
      Math.max(0, Math.floor((at - window.startMs) / width)),
    );
    values[index] = (values[index] ?? 0) + 1;
  }
  return values;
}

export { attentionJobs } from "./attention.js";

export function compactJobPrd(prd: string, maxChars = 160): string {
  const flat = prd.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
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

/** When work actually began — `startedAt`, else the last Working lifecycle stamp. */
export function jobWorkStartedAt(job: JobSummary): string | undefined {
  if (job.startedAt) return job.startedAt;
  const fromLifecycle = [...(job.lifecycle ?? [])]
    .reverse()
    .find((event) => event.kind === "working")?.at;
  if (fromLifecycle) return fromLifecycle;
  if (isWorkingJob(job.status)) return job.queuedAt ?? job.createdAt;
  return undefined;
}

export function waitedWorkedLabel(
  job: JobSummary,
  nowMs: number,
): {
  readonly waited: string;
  readonly worked: string;
  readonly waitVerb: "waiting" | "waited";
  readonly workVerb: "working" | "worked";
} {
  const startedAt = jobWorkStartedAt(job);
  const d = jobDurations(
    {
      createdAt:
        job.createdAt ?? job.updatedAt ?? new Date(nowMs).toISOString(),
      queuedAt: job.queuedAt,
      startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
      lastHeartbeat: job.lastHeartbeat,
      status: job.status,
    },
    nowMs,
  );
  const waitingNow = job.status === "queued" || job.status === "needs_confirm";
  return {
    waited: formatDuration(d.queued) ?? "—",
    worked: formatDuration(d.working) ?? "—",
    waitVerb: waitingNow ? "waiting" : "waited",
    workVerb: isWorkingJob(job.status) ? "working" : "worked",
  };
}

export type PulseBucket = "live" | "needsYou" | "settled";

/** Pulse splits gates out of the live set — `isLiveJob` still counts them. */
export function pulseBucket(job: Pick<JobSummary, "status">): PulseBucket {
  if (
    job.status === "needs_confirm" ||
    job.status === "waiting_on_you" ||
    job.status === "paused" ||
    job.status === "blocked" ||
    job.status === "needs_review"
  ) {
    return "needsYou";
  }
  if (isLiveJob(job.status)) return "live";
  return "settled";
}

function byUpdatedDesc(a: JobSummary, b: JobSummary): number {
  const tb = Date.parse(b.updatedAt ?? b.createdAt ?? "");
  const ta = Date.parse(a.updatedAt ?? a.createdAt ?? "");
  return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
}

export function pulseSections(
  jobs: readonly JobSummary[],
  range: FleetTimeRange,
  nowMs: number,
): {
  readonly live: readonly JobSummary[];
  readonly needsYou: readonly JobSummary[];
  readonly settled: readonly JobSummary[];
} {
  const live: JobSummary[] = [];
  const needsYou: JobSummary[] = [];
  const settled: JobSummary[] = [];
  for (const job of jobsInRange(jobs, range, nowMs)) {
    const bucket = pulseBucket(job);
    if (bucket === "live") live.push(job);
    else if (bucket === "needsYou") needsYou.push(job);
    else settled.push(job);
  }
  live.sort(byUpdatedDesc);
  needsYou.sort(byUpdatedDesc);
  settled.sort(byUpdatedDesc);
  return { live, needsYou, settled };
}

export type RepoJobGroup = {
  readonly path: string;
  readonly label: string;
  readonly jobs: readonly JobSummary[];
};

/** Preserve caller order; first-seen repo stays first. */
export function groupJobsByRepo(
  jobs: readonly JobSummary[],
): readonly RepoJobGroup[] {
  const groups: RepoJobGroup[] = [];
  const index = new Map<string, number>();
  for (const job of jobs) {
    const path = job.workspacePath ?? "";
    const at = index.get(path);
    if (at === undefined) {
      index.set(path, groups.length);
      groups.push({
        path,
        label: job.workspaceLabel ?? "Repo",
        jobs: [job],
      });
      continue;
    }
    const current = groups[at];
    if (!current) continue;
    groups[at] = { ...current, jobs: [...current.jobs, job] };
  }
  return groups;
}

export function jobTreeLabel(job: JobSummary): {
  readonly label: string;
  readonly you: boolean;
  readonly worktree: boolean;
} {
  if (job.placement === "worktree") {
    return {
      label: job.branch?.trim() || "worktree",
      you: false,
      worktree: true,
    };
  }
  return { label: "This checkout", you: true, worktree: false };
}

export function pulseIdleRepos(
  repos: readonly RepoFleet[],
  range: FleetTimeRange,
  nowMs: number,
): readonly RepoFleet[] {
  return repos.filter(
    (repo) => jobsInRange(repo.jobs, range, nowMs).length === 0,
  );
}

export function waitWorkMeter(
  job: JobSummary,
  nowMs: number,
): {
  readonly waited: string;
  readonly worked: string;
  readonly waitVerb: "waiting" | "waited";
  readonly workVerb: "working" | "worked";
  readonly waitPct: number;
  readonly workPct: number;
  readonly outcomePct: number;
  readonly outcome?: "error" | "cancelled";
} {
  const label = waitedWorkedLabel(job, nowMs);
  const startedAt = jobWorkStartedAt(job);
  const d = jobDurations(
    {
      createdAt:
        job.createdAt ?? job.updatedAt ?? new Date(nowMs).toISOString(),
      queuedAt: job.queuedAt,
      startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt,
      lastHeartbeat: job.lastHeartbeat,
      status: job.status,
    },
    nowMs,
  );
  const wait = d.queued ?? 0;
  const work = d.working ?? 0;
  const total = wait + work;
  const outcome =
    job.status === "error"
      ? ("error" as const)
      : job.status === "cancelled"
        ? ("cancelled" as const)
        : undefined;
  const outcomePct = outcome ? 10 : 0;
  if (total <= 0) {
    return {
      ...label,
      waitPct: 0,
      workPct: 0,
      outcomePct: outcome ? 100 : 0,
      ...(outcome ? { outcome } : {}),
    };
  }
  const scale = (100 - outcomePct) / 100;
  return {
    ...label,
    waitPct: (wait / total) * 100 * scale,
    workPct: (work / total) * 100 * scale,
    outcomePct,
    ...(outcome ? { outcome } : {}),
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

export type PlaybookOption = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
};

export const SKILL_PLAYBOOK = "skill";

export const PLAYBOOKS: readonly PlaybookOption[] = [
  {
    id: "console",
    label: "Blank brief",
    hint: "A clean prompt with no extra skill.",
  },
  {
    id: "finding",
    label: "From a finding",
    hint: "Attach a write-up as context.",
  },
  {
    id: SKILL_PLAYBOOK,
    label: "Skills",
    hint: "Write a Prism skill stored globally. Skip dirty-tree approval and repo checks for this job only — it does not change the repository.",
  },
  {
    id: "prism-review-pr",
    label: "Review",
    hint: "Audit a PR, uncommitted changes, or a test pass.",
  },
  {
    id: "prism-audit",
    label: "Audit",
    hint: "Survey the repo for issues without changing code.",
  },
  {
    id: "prism-test",
    label: "Test",
    hint: "Add or run tests and report what failed.",
  },
  {
    id: "prism-safe-change",
    label: "Safe change",
    hint: "Blast-radius and test-impact before editing.",
  },
  {
    id: "prism-verify-regression",
    label: "Verify regression",
    hint: "Re-run checks and fix what fails.",
  },
  {
    id: "prism-ship",
    label: "Ship",
    hint: "Land a finished change.",
  },
  {
    id: "prism-onboard",
    label: "Onboard",
    hint: "Learn the repo and write a first-pass map.",
  },
  {
    id: "prism-investigate",
    label: "Investigate",
    hint: "Trace a bug or odd behaviour and report what you find.",
  },
];

export function playbookOf(id: string): PlaybookOption | undefined {
  return PLAYBOOKS.find((row) => row.id === id);
}

export function playbookHint(id: string): string {
  return playbookOf(id)?.hint ?? PLAYBOOKS[0]!.hint;
}

export type ReviewTarget = {
  readonly id: string;
  readonly label: string;
  readonly seed: string;
};

export const REVIEW_TARGETS: readonly ReviewTarget[] = [
  {
    id: "pr",
    label: "Pull request",
    seed: "Review the open pull request. Audit the diff, tests, and risk before anything lands.",
  },
  {
    id: "uncommitted",
    label: "Uncommitted changes",
    seed: "Review the uncommitted changes in this checkout. Call out bugs, missing tests, and what is safe to keep.",
  },
  {
    id: "audit",
    label: "Audit",
    seed: "Audit this area. Find issues; do not change code unless the brief says to.",
  },
  {
    id: "test",
    label: "Test and review",
    seed: "Run the relevant tests and review what failed. Report gaps; fix only what the brief asks.",
  },
];

export function reviewTargetOf(id: string): ReviewTarget | undefined {
  return REVIEW_TARGETS.find((row) => row.id === id);
}

/** Build the queued brief: user prompt plus optional review/finding context. */
export function composeQueuedPrd(input: {
  readonly prd: string;
  readonly reviewSeed?: string;
  readonly finding?: { readonly title: string; readonly text: string };
}): string {
  const parts: string[] = [];
  if (input.reviewSeed?.trim()) parts.push(input.reviewSeed.trim());
  if (input.finding?.text.trim()) {
    parts.push(
      `Context from finding: ${input.finding.title}\n\n${input.finding.text.trim()}`,
    );
  }
  if (input.prd.trim()) parts.push(input.prd.trim());
  return parts.join("\n\n");
}
