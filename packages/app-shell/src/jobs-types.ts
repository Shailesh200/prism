import {
  durationMs,
  formatDuration,
  formatDurationOr,
  jobDurations,
  primaryDurationMs,
  type JobTimestamps,
} from "@repo-prism/shared";

/**
 * Dispatch job shapes as the UI needs them.
 *
 * Declared structurally rather than imported from `@repo-prism/dispatch`: this
 * package is presentation for every surface, and Dispatch is a host concern
 * (ADR-0035). The host passes data in; the screen never opens a worktree.
 */

export type JobRunPhase =
  | "starting"
  | "running"
  | "thinking"
  | "tool"
  | "editing"
  | "done"
  | "failed"
  | "cancelled";

export type JobStatus =
  /** Accepted and durable, waiting for the drain loop (ADR-0047). */
  | "queued"
  /** Parked on a gate only a human can clear (ADR-0047). */
  | "needs_confirm"
  | "ready"
  | "booting"
  | "running"
  | "waiting_on_you"
  | "blocked"
  | "paused"
  | "needs_review"
  | "done"
  | "cancelled"
  | "error";

/** The question a `needs_confirm` job is waiting on. */
export type JobConfirm = {
  readonly kind: "dirty-checkout" | "path-overlap";
  readonly question: string;
  readonly dirtyPaths?: readonly string[];
  readonly overlapTitle?: string;
};

export type JobReviewFileChange =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "untracked";

export type JobReviewFile = {
  readonly path: string;
  readonly added: number;
  readonly removed: number;
  readonly change: JobReviewFileChange;
};

export type JobReview = {
  readonly files: readonly JobReviewFile[];
  readonly totalAdded: number;
  readonly totalRemoved: number;
  readonly truncated: boolean;
  /** Branch holding the work. Never the branch the user is on. */
  readonly branch?: string;
  readonly baseRef?: string;
  /** True once the supervisor committed it (ADR-0042 §1). */
  readonly committed?: boolean;
  /** Always false: Prism does not merge a job for the user. */
  readonly merged?: false;
  /** Paths the user already had dirty that the job also touched. */
  readonly mixedPaths?: readonly string[];
  /** Files the user kept from this review. */
  readonly keptPaths?: readonly string[];
};

export type JobConsoleEntry = {
  readonly ts: string;
  readonly phase: JobRunPhase;
  readonly text: string;
  readonly tool?: string;
  readonly level: "info" | "error";
};

export type JobSummary = {
  readonly id: string;
  readonly title: string;
  readonly status: JobStatus;
  readonly branch: string;
  /**
   * The four lifecycle stamps (ADR-0047). Durations derive from these on the
   * client, so a running job ticks and a finished one stays put.
   */
  readonly createdAt?: string;
  readonly queuedAt?: string;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly updatedAt?: string;
  readonly lastActivity?: string;
  readonly nextStep?: string;
  readonly resultSummary?: string;
  readonly errorMessage?: string;
  readonly review?: JobReview;
  readonly confirm?: JobConfirm;
  readonly verification?: "passed" | "failed" | "skipped";
  readonly verificationDetail?: string;
  /** Which repository this job belongs to, when the host watches several. */
  readonly workspacePath?: string;
  readonly workspaceLabel?: string;
  /** Where the branch is checked out, so a reviewer can go open it. */
  readonly worktreePath?: string;
  /** When the worker last wrote output — the evidence behind a live badge. */
  readonly lastHeartbeat?: string;
  /** checkout = your working tree; worktree = an isolated branch. */
  readonly placement?: "checkout" | "worktree";
  /** Agent CLI that ran this job (ADR-0044). Absent on older records. */
  readonly workerBackend?: "cursor" | "claude";
  /** Model id reported by the worker, e.g. `claude-sonnet-4-5`. */
  readonly workerModel?: string;
  /** Thinking / effort the worker reported, e.g. `10000` or `adaptive`. */
  readonly workerThinking?: string;
  /** Write-ups under `.prism/dispatch/notes/`. */
  readonly notes?: readonly string[];
  /** Cited paths the agent claimed but did not write. */
  readonly citedMissing?: readonly string[];
};

export type JobConsolePage = {
  readonly entries: readonly JobConsoleEntry[];
  readonly totalCount: number;
  readonly truncated: boolean;
};

export type JobControlAction =
  | "pause"
  | "resume"
  | "cancel"
  | "delete"
  /** Answer a `needs_confirm` gate and return the job to the queue. */
  | "confirm"
  | "accept_file"
  | "accept_all"
  | "reject_file"
  | "reject_all";

export type JobControlExtra = {
  readonly path?: string;
};

export type JobsPort = {
  /** `since` is the ISO ts of the newest entry already shown. */
  jobLogs(jobId: string, since?: string): Promise<JobConsolePage>;
  control?(
    action: JobControlAction,
    jobId: string,
    extra?: JobControlExtra,
  ): Promise<void>;
  /** Notes the job wrote under `.prism/dispatch/notes/`. */
  jobNotes?(
    jobId: string,
  ): Promise<{ notes: readonly { path: string; title: string }[] }>;
  jobNote?(
    jobId: string,
    path: string,
  ): Promise<{ path: string; text: string; truncated?: boolean }>;
};

const LIVE_STATUSES = new Set<JobStatus>([
  // Accepted work the user is waiting on, whether or not a process exists yet.
  // Leaving `queued` and `needs_confirm` out is what let a header say "nothing
  // running" directly above a list with rows in it.
  "queued",
  "needs_confirm",
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
]);

export function isLiveJob(status: JobStatus): boolean {
  return LIVE_STATUSES.has(status);
}

/**
 * Jobs parked on a gate only the user can clear (ADR-0047).
 *
 * These used to exist only in chat after "where are we". The Jobs board pins
 * them above the list so an approval is not invisible the moment the agent
 * stops talking.
 */
export function isWaitingOnYou(status: JobStatus): boolean {
  return status === "needs_confirm";
}

export function jobsWaitingOnYou(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return jobs.filter((job) => isWaitingOnYou(job.status));
}

/**
 * Board order: approvals first, then other live work, then history.
 *
 * A `needs_confirm` row buried under a finished audit is how a parked job
 * looked like it had vanished during the M-067 smoke test.
 */
export function orderJobsForBoard(
  jobs: readonly JobSummary[],
): readonly JobSummary[] {
  return [...jobs].sort((a, b) => {
    const rank = (status: JobStatus): number => {
      if (status === "needs_confirm") return 0;
      if (status === "waiting_on_you") return 1;
      if (isLiveJob(status)) return 2;
      return 3;
    };
    const byStatus = rank(a.status) - rank(b.status);
    if (byStatus !== 0) return byStatus;
    // Trigger time, not last mutation. Keep/accept used to bump `updatedAt`
    // and jump the card to the top of history.
    const aAt = Date.parse(a.createdAt ?? a.queuedAt ?? a.updatedAt ?? "");
    const bAt = Date.parse(b.createdAt ?? b.queuedAt ?? b.updatedAt ?? "");
    if (Number.isFinite(aAt) && Number.isFinite(bAt)) return bAt - aAt;
    return 0;
  });
}

/** Stable identity when two repositories reuse a slug. */
export function jobBoardKey(
  job: Pick<JobSummary, "id" | "workspacePath">,
): string {
  return `${job.workspacePath ?? ""}::${job.id}`;
}

export type JobBoardLane = "all" | "live" | "waiting" | "finished";

export function matchesBoardLane(job: JobSummary, lane: JobBoardLane): boolean {
  if (lane === "all") return true;
  if (lane === "waiting") return isWaitingOnYou(job.status);
  if (lane === "live") return isLiveJob(job.status);
  return (
    job.status === "done" ||
    job.status === "error" ||
    job.status === "cancelled" ||
    job.status === "needs_review"
  );
}

/** True while Keep / Restore still have files to decide. */
export function jobReviewPending(
  job: Pick<JobSummary, "status" | "review">,
): boolean {
  if (job.status !== "needs_review") return false;
  const files = job.review?.files ?? [];
  if (files.length === 0) return false;
  const kept = new Set(job.review?.keptPaths ?? []);
  return files.some((file) => !kept.has(file.path));
}

const SETTLED_STATUSES = new Set<JobStatus>([
  "done",
  "error",
  "cancelled",
  "needs_review",
]);

/** Worker has stopped — including review, which is finished work waiting on you. */
export function isSettledJob(status: JobStatus): boolean {
  return SETTLED_STATUSES.has(status);
}

export function jobAgentLabel(
  backend: JobSummary["workerBackend"] | undefined,
): string {
  if (backend === "claude") return "Claude Code";
  if (backend === "cursor") return "Cursor";
  return "Host default";
}

/**
 * Turn a vendor model id into the name people actually say.
 *
 * `claude-sonnet-4-20250514` → "Sonnet 4". Date suffixes are dropped so two
 * snapshots of the same family do not look like different models. Unknown
 * third-party ids stay as reported — inventing a pretty name would hide the
 * model that actually ran.
 */
export function formatWorkerModel(raw: string): string {
  const id = raw.trim();
  if (!id) return "Unknown";
  const lower = id.toLowerCase();
  if (lower === "auto") return "Auto";
  const family = lower.includes("opus")
    ? "Opus"
    : lower.includes("sonnet")
      ? "Sonnet"
      : lower.includes("haiku")
        ? "Haiku"
        : lower.includes("composer")
          ? "Composer"
          : undefined;
  const stripped = lower.replace(/[-_]\d{8}\b.*$/, "");
  const version = stripped.match(/(\d+)(?:[-_.](\d+))?/);
  const numbered = (name: string): string => {
    if (!version) return name;
    const major = version[1];
    const minor = version[2];
    return minor ? `${name} ${major}.${minor}` : `${name} ${major}`;
  };
  if (family) return numbered(family);
  const vendors: readonly [RegExp, string][] = [
    [/\bgpt-5\b/, "GPT-5"],
    [/\bgpt-4o\b/, "GPT-4o"],
    [/\bgpt-4\b/, "GPT-4"],
    [/\bgemini\b/, "Gemini"],
    [/\bgrok\b/, "Grok"],
    [/\bkimi\b/, "Kimi"],
    [/\bdeepseek\b/, "DeepSeek"],
    [/\bqwen/, "Qwen"],
    [/\bllama/, "Llama"],
    [/\bmistral/, "Mistral"],
    [/\bglm/, "GLM"],
    [/\bcodex/, "Codex"],
  ];
  for (const [pattern, name] of vendors) {
    if (pattern.test(lower)) return name;
  }
  return id;
}

/**
 * Thinking / effort as a short suffix: `10k thinking`, `high thinking`.
 *
 * Empty when the worker said thinking was off — showing "thinking" next to
 * a model that did not think is the same class of lie as inventing a name.
 */
export function formatWorkerThinking(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (["disabled", "off", "none", "false"].includes(lower)) return "";
  if (["enabled", "on", "true", "thinking"].includes(lower)) return "thinking";
  if (lower === "adaptive") return "adaptive thinking";
  if (["low", "medium", "high", "max"].includes(lower)) {
    return `${lower} thinking`;
  }
  if (/^\d+$/.test(lower)) {
    const tokens = Number(lower);
    return tokens >= 1000
      ? `${Math.round(tokens / 1000)}k thinking`
      : `${tokens} token thinking`;
  }
  if (/^\d+k$/.test(lower)) return `${lower} thinking`;
  return value;
}

export function jobModelLabel(
  backend: JobSummary["workerBackend"] | undefined,
  model?: string | undefined,
  thinking?: string | undefined,
): string {
  const name = model?.trim()
    ? formatWorkerModel(model)
    : backend === "claude"
      ? "Claude"
      : backend === "cursor"
        ? "Auto"
        : "Unknown";
  const suffix = thinking?.trim() ? formatWorkerThinking(thinking) : "";
  return suffix ? `${name} · ${suffix}` : name;
}

/**
 * Insert line breaks into a summary that was stored as one flattened blob.
 *
 * `composeJobResult` used to join with spaces and `clip()` collapsed
 * whitespace, so older jobs arrive as a single paragraph. New jobs keep their
 * newlines; this still helps those records.
 */
export function unfoldJobSummary(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\s+Summary of findings:\s*/gi, "\n\nSummary of findings:\n")
    .replace(/\s+(This was a read-only[^.]*\.)/g, "\n$1")
    .replace(/\s+(I wrote the findings[^.]*\.)/g, "\n$1")
    .replace(/\s+\*\*([^*]{1,48}):\*\*\s*/g, "\n\n**$1:** ")
    .replace(/\s+-\s+\*\*/g, "\n- **")
    .replace(/\s+(Checks (?:passed|failed)[^.]*\.)/gi, "\n\n$1")
    .replace(/\s+(\(your uncommitted changes were present\))/gi, "\n$1")
    .replace(/\s+(It mentioned )/g, "\n\n$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export type JobSummaryBlocks = {
  readonly meta: readonly string[];
  readonly body: string;
  readonly checks: readonly string[];
};

function summaryLineKind(line: string): "meta" | "check" | "body" {
  if (
    /^Checks (?:passed|failed)/i.test(line) ||
    /typecheck and test passed/i.test(line) ||
    /^\(your uncommitted/i.test(line)
  ) {
    return "check";
  }
  if (
    /^Produced no reviewable change/i.test(line) ||
    /^This was a read-only/i.test(line) ||
    /^\d+ files? changed/i.test(line) ||
    /^It mentioned /i.test(line)
  ) {
    return "meta";
  }
  return "body";
}

/**
 * Split Prism's own wrap-up from the teammate's words so the card can show
 * them as separate blocks instead of one dense paragraph.
 */
export function splitJobSummary(
  text: string,
  hideChecks = false,
): JobSummaryBlocks {
  const meta: string[] = [];
  const checks: string[] = [];
  const body: string[] = [];
  for (const line of unfoldJobSummary(text).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (body.at(-1) !== "") body.push("");
      continue;
    }
    const kind = summaryLineKind(trimmed);
    if (kind === "check") {
      if (!hideChecks) checks.push(trimmed);
      continue;
    }
    if (kind === "meta") {
      meta.push(trimmed);
      continue;
    }
    body.push(line);
  }
  return {
    meta,
    checks,
    body: body
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}

const NOTE_PREFIX = ".prism/dispatch/notes/";

export function isDispatchNotePath(value: string): boolean {
  const n = value.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!n.startsWith(NOTE_PREFIX) || !n.endsWith(".md")) return false;
  if (n.includes("..") || n.includes("//")) return false;
  return n.slice(NOTE_PREFIX.length).length > 0;
}

export function notePathsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/`([^`\n]{2,200})`/g)) {
    const raw = match[1]?.trim();
    if (raw && isDispatchNotePath(raw)) {
      found.add(raw.replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }
  for (const match of text.matchAll(
    /\.prism\/dispatch\/notes\/[\w./-]+\.md/g,
  )) {
    if (isDispatchNotePath(match[0])) {
      found.add(match[0].replace(/\\/g, "/").replace(/^\.\//, ""));
    }
  }
  return [...found];
}

export function jobNotePaths(job: JobSummary): string[] {
  return [
    ...new Set([
      ...(job.notes ?? []),
      ...notePathsFromText(job.resultSummary ?? ""),
    ]),
  ].filter(isDispatchNotePath);
}

export type FabricationMention = {
  readonly shown: readonly string[];
  readonly extra: number;
};

/** Split `It mentioned a, b (+2 more), which was not written.` */
export function parseFabricationMention(
  line: string,
): FabricationMention | undefined {
  const match = line
    .trim()
    .match(/^It mentioned (.+), which was not written\.?$/i);
  if (!match?.[1]) return undefined;
  const body = match[1];
  const extraMatch = body.match(/ \(\+(\d+) more\)$/);
  const extra = extraMatch ? Number(extraMatch[1]) : 0;
  const listed = extraMatch ? body.slice(0, extraMatch.index) : body;
  const shown = listed
    .split(/,\s*/)
    .map((part) => part.replace(/`/g, "").trim())
    .filter(Boolean);
  return { shown, extra };
}

export type JobWorkspaceChip = {
  readonly path: string;
  readonly label: string;
  readonly jobCount?: number;
  readonly error?: string;
};

export function workspaceChipsForBoard(
  jobs: readonly JobSummary[],
  workspaces?: readonly JobWorkspaceChip[],
): readonly JobWorkspaceChip[] {
  if (workspaces && workspaces.length > 0) return workspaces;
  const byPath = new Map<string, JobWorkspaceChip>();
  for (const job of jobs) {
    const path = job.workspacePath;
    if (!path) continue;
    const current = byPath.get(path);
    byPath.set(path, {
      path,
      label: job.workspaceLabel ?? current?.label ?? path,
      jobCount: (current?.jobCount ?? 0) + 1,
    });
  }
  return [...byPath.values()];
}

export function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "Queued";
    case "needs_confirm":
      return "Needs your OK";
    case "booting":
      return "Starting";
    case "waiting_on_you":
      return "Needs you";
    case "needs_review":
      return "Ready for review";
    case "blocked":
      return "Stuck";
    case "error":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "paused":
      return "Paused";
    case "done":
      return "Done";
    case "ready":
      return "Ready";
    default:
      return "Running";
  }
}

/**
 * Badge text for a job card — status, refined by why it is waiting.
 *
 * A job parked on the RAM gate stays `queued` so the drain retries when
 * memory frees, but "Queued" next to a low-memory warning reads as a
 * pipeline stall rather than a machine one. Same for disk.
 */
export function jobDisplayLabel(job: {
  readonly status: JobStatus;
  readonly nextStep?: string | undefined;
}): string {
  if (job.status === "queued" && job.nextStep) {
    if (/low on memory/i.test(job.nextStep)) return "Waiting for memory";
    if (/low on disk/i.test(job.nextStep)) return "Waiting for disk";
    if (/job cap/i.test(job.nextStep)) return "Waiting for a slot";
  }
  return jobStatusLabel(job.status);
}

/** Grouping for the status pill colour. */
export function jobStatusTone(
  status: JobStatus,
  nextStep?: string | undefined,
): "live" | "attention" | "good" | "bad" | "idle" {
  if (
    status === "queued" &&
    nextStep &&
    /low on (memory|disk)|job cap/i.test(nextStep)
  ) {
    return "attention";
  }
  switch (status) {
    case "running":
    case "booting":
    case "ready":
    case "queued":
      return "live";
    case "waiting_on_you":
    case "blocked":
    case "needs_review":
    case "needs_confirm":
      return "attention";
    case "done":
      return "good";
    case "error":
      return "bad";
    default:
      return "idle";
  }
}

/**
 * How long this job has taken, and whether that number is still moving.
 *
 * Delegates to the one formatter in `@repo-prism/shared` (ADR-0047) so the
 * board, the job detail, `list_jobs` and the Claude statusline cannot disagree
 * about the same job. An unmeasurable duration returns an empty string, and
 * the caller renders an em dash — never a confident `0s`.
 */
/**
 * The lifecycle stamps a duration needs. Written with explicit `| undefined`
 * rather than `Pick<JobSummary, …>` because callers hand these straight from
 * parsed JSON, where a missing field really is present-and-undefined.
 */
export type JobTiming = {
  readonly createdAt?: string | undefined;
  readonly queuedAt?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly finishedAt?: string | undefined;
  /**
   * Needed to stop the clock on jobs recorded before P-S1 split the stamps
   * apart: those end in a terminal status with no `finishedAt`, and without
   * these two fields the board counts them up against the present.
   */
  readonly status?: string | undefined;
  readonly updatedAt?: string | undefined;
  /** Last worker output. Evidence of life a stale `updatedAt` does not carry. */
  readonly lastHeartbeat?: string | undefined;
};

export function jobElapsed(job: JobTiming, now: number): string {
  return formatDurationOr(primaryDurationMs(timestampsOf(job), now), "");
}

function timestampsOf(job: JobTiming): JobTimestamps {
  return {
    createdAt: job.createdAt ?? "",
    queuedAt: job.queuedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    status: job.status,
    updatedAt: job.updatedAt,
    lastHeartbeat: job.lastHeartbeat,
  };
}

/**
 * The queued-versus-working split for a finished job.
 *
 * "It took 12 minutes" is ambiguous; "waited 9, worked 3" says whether the
 * pipeline or the agent was slow. Returns undefined when there is nothing
 * honest to show.
 */
export function jobTimeBreakdown(
  job: JobTiming,
  now: number,
): string | undefined {
  const split = jobDurations(timestampsOf(job), now);
  const queued = formatDuration(split.queued);
  const working = formatDuration(split.working);
  if (!queued && !working) return undefined;
  if (!queued) return `worked ${working}`;
  if (!working) return `waited ${queued}`;
  return `waited ${queued} · worked ${working}`;
}

/**
 * How long since the worker last said anything.
 *
 * A `running` badge is a claim about the present tense that a stored string
 * cannot support on its own. This is the evidence: "running · 8s ago" is
 * checkable, "running" is trust. Returns undefined when there is no heartbeat
 * to report, because an invented "0s ago" would be the exact failure this is
 * meant to prevent.
 */
export function heartbeatAge(
  job: { readonly lastHeartbeat?: string | undefined },
  now: number,
): string | undefined {
  const ms = durationMs(job.lastHeartbeat, now);
  if (ms === undefined) return undefined;
  return `${formatDuration(ms) ?? "0s"} ago`;
}

/**
 * One rung of the job lifecycle rail.
 *
 * `reached` is the honest bit: a stage without a timestamp is drawn but not
 * claimed, so a job that skipped the queue does not get a fabricated queue
 * time. `span` is how long the job sat at that stage — measured to the next
 * stamp, or to `now` for the stage it is still on.
 */
export type JobStage = {
  readonly id: "created" | "queued" | "started" | "finished";
  readonly label: string;
  readonly at?: string;
  readonly reached: boolean;
  /** The stage the job is sitting on right now, if it is still moving. */
  readonly current: boolean;
  readonly span?: string;
};

/**
 * The four lifecycle stamps as a rail (ADR-0047, ADR-0051).
 *
 * The stamps were already on the detail pane as a flat definition list, which
 * shows *when* each thing happened but not *where the job is*. The rail
 * answers the question people actually open a job to ask: is it moving, and
 * what is it waiting on. Motion is CSS on the current rung only — the rail is
 * information, and only the live rung is allowed to draw the eye.
 *
 * The final rung takes its name from the outcome, because "Finished" over a
 * job that crashed is the kind of cheerful inaccuracy this milestone exists to
 * remove.
 */
export function jobStages(job: JobSummary, now: number): readonly JobStage[] {
  const finalLabel =
    job.status === "error"
      ? "Failed"
      : job.status === "cancelled"
        ? "Cancelled"
        : "Finished";

  const settled = Boolean(job.finishedAt) || isSettledJob(job.status);
  const finishedAt =
    job.finishedAt ??
    (settled ? (job.updatedAt ?? job.startedAt ?? job.createdAt) : undefined);

  const raw: {
    id: JobStage["id"];
    label: string;
    at: string | undefined;
  }[] = [
    { id: "created", label: "Accepted", at: job.createdAt },
    { id: "queued", label: "Queued", at: job.queuedAt },
    { id: "started", label: "Working", at: job.startedAt },
    { id: "finished", label: finalLabel, at: finishedAt },
  ];

  const lastReached = raw.reduce(
    (acc, stage, i) => (stage.at ? i : acc),
    Number.NaN,
  );

  return raw.map((stage, i) => {
    // A settled job with missing intermediate stamps still passed those
    // rungs — leaving them hollow under a full bar looks like the timeline
    // broke. Do not invent times; just mark them reached.
    const reached = Boolean(stage.at) || settled;
    const current = Boolean(stage.at) && i === lastReached && !settled;
    const nextAt = raw.slice(i + 1).find((s) => s.at)?.at;
    const until = current ? now : nextAt;
    const span = reached
      ? formatDuration(durationMs(stage.at, until))
      : undefined;
    return {
      id: stage.id,
      label: stage.label,
      ...(stage.at ? { at: stage.at } : {}),
      reached,
      current,
      ...(span ? { span } : {}),
    };
  });
}

/** How many dirty paths a confirm gate lists before it summarises the rest. */
export const GATE_PATH_SAMPLE = 8;

/**
 * What to say about the paths the gate did not list.
 *
 * States the hidden count rather than the total, so the sentence stays true
 * next to the sample above it instead of restating a number the card already
 * showed.
 */
export function gateOverflowNote(total: number): string {
  const hidden = total - GATE_PATH_SAMPLE;
  return `and ${hidden} more ${hidden === 1 ? "file" : "files"}.`;
}

/** How far the lifecycle rail should fill (0–1). Settled jobs are always 1. */
export function jobRailFill(stages: readonly JobStage[]): number {
  if (stages.length === 0) return 0;
  if (stages.at(-1)?.reached) return 1;
  const reached = stages.filter((stage) => stage.reached).length;
  const last = Math.max(stages.length - 1, 1);
  return Math.min(1, Math.max(0, (reached - 1) / last));
}

export function reviewFileTotals(review: JobReview): string {
  const count = review.files.length;
  const noun = count === 1 ? "file" : "files";
  return `${count}${review.truncated ? "+" : ""} ${noun} · +${review.totalAdded} -${review.totalRemoved}`;
}

/** Newest timestamp in a page, for the next `since` poll. */
export function newestEntryTs(
  entries: readonly JobConsoleEntry[],
): string | undefined {
  return entries.length > 0 ? entries[entries.length - 1]!.ts : undefined;
}

/** Append a tailed page, de-duplicating by timestamp+text. */
export function mergeConsoleEntries(
  existing: readonly JobConsoleEntry[],
  incoming: readonly JobConsoleEntry[],
  cap = 2_000,
): JobConsoleEntry[] {
  if (incoming.length === 0) return existing as JobConsoleEntry[];
  const seen = new Set(existing.map((entry) => `${entry.ts}|${entry.text}`));
  const merged = [...existing];
  for (const entry of incoming) {
    const key = `${entry.ts}|${entry.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(entry);
  }
  return merged.length > cap ? merged.slice(-cap) : merged;
}
