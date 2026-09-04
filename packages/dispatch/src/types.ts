import { z } from "zod";

export const DISPATCH_DIR = ".prism/dispatch";

export const BriefingSectionIdSchema = z.enum([
  "jobs",
  "git",
  "tickets",
  "github",
  "slack",
  "notion",
  "calendar",
  "focus",
  "memories",
]);
export type BriefingSectionId = z.infer<typeof BriefingSectionIdSchema>;

export const DEFAULT_SECTION_ORDER: readonly BriefingSectionId[] = [
  "jobs",
  "git",
  "tickets",
  "github",
  "slack",
  "notion",
  "calendar",
  "focus",
  "memories",
];

export const TicketHostSchema = z.enum(["linear", "jira"]);
export type TicketHost = z.infer<typeof TicketHostSchema>;

/** Agent CLI that runs a Dispatch job's worker child (ADR-0044). */
export const WorkerBackendSchema = z.enum(["cursor", "claude"]);
export type WorkerBackend = z.infer<typeof WorkerBackendSchema>;

/** Config setting: explicit backend, or "auto" to match the MCP host. */
export const WorkerBackendSettingSchema = z.enum(["auto", "cursor", "claude"]);
export type WorkerBackendSetting = z.infer<typeof WorkerBackendSettingSchema>;

/**
 * How the chat decides between a teammate and an inline edit.
 *
 * `ask` offers the choice in one line before any work starts. `auto` dispatches
 * code changes without asking. `inline` never dispatches unless the user asks
 * for a job outright.
 */
export const DispatchModeSchema = z.enum(["ask", "auto", "inline"]);
export type DispatchMode = z.infer<typeof DispatchModeSchema>;

/** Where a job works (ADR-0045): the user's checkout, or an isolated worktree. */
export const JobPlacementSchema = z.enum(["checkout", "worktree"]);
export type JobPlacement = z.infer<typeof JobPlacementSchema>;

export const DispatchConfigSchema = z.object({
  sectionOrder: z
    .array(BriefingSectionIdSchema)
    .default([...DEFAULT_SECTION_ORDER]),
  sectionsOff: z.array(BriefingSectionIdSchema).default([]),
  standupTemplate: z.string().default(""),
  /**
   * Standing instructions for every Dispatch job (how the teammate should
   * work). Injected into the worker prompt. Ad-hoc facts still belong in
   * `remember`.
   */
  jobInstructions: z.string().default(""),
  hints: z.boolean().default(true),
  maxJobs: z.number().int().min(1).max(20).default(4),
  /**
   * In-process subagents inside one worker (ADR-0042 §4). No extra OS
   * process, no extra worktree, so the ADR-0041 resource findings do not
   * apply — on by default.
   */
  subagents: z.boolean().default(true),
  /**
   * Host fan-out: one brief becomes sibling jobs, each with its own worktree
   * and supervisor. This is the shape that exhausted RAM, so it stays off
   * until the owner turns it on (ADR-0042 §4).
   */
  fanout: z.boolean().default(false),
  /** Supervisor-run typecheck/test after the agent stops (ADR-0042 §3). */
  verifyJobs: z.boolean().default(true),
  /**
   * Which agent CLI runs job workers (ADR-0044). "auto" matches the MCP
   * host: claude-code chats get Claude workers, everything else Cursor.
   */
  workerBackend: WorkerBackendSettingSchema.default("auto"),
  /**
   * Where jobs work (ADR-0045). "checkout" (default) edits the user's tree
   * and leaves changes uncommitted; "worktree" restores the pre-M-066
   * isolated branch + commit-on-finish default.
   */
  placement: JobPlacementSchema.default("checkout"),
  /**
   * Who decides between a background teammate and an inline edit.
   *
   * Guessing is what went wrong in practice: the agent read a change request,
   * decided the task was small or read-only, and silently did it in chat — and
   * an MCP server cannot intercept a host agent's edits to prevent that. So the
   * default is to ask, in one line, before touching anything. Asking fails safe
   * where guessing does not.
   */
  dispatchMode: DispatchModeSchema.default("ask"),
  ticketHost: TicketHostSchema.default("linear"),
  mentionWindowHours: z.number().int().min(1).max(168).default(24),
  mentionLimit: z.number().int().min(1).max(50).default(10),
  trackedMessageLimit: z.number().int().min(1).max(50).default(15),
  slackTrackChannelIds: z.array(z.string()).max(5).default([]),
  /**
   * Standing free-form wishes (M-066 P-P9): "standup: terse", "greet me by
   * name". Surfaced in the standup so the presenting agent applies them.
   * The Console Settings tab edits these together with `standupTemplate`.
   * Job-behavior rules belong in `jobInstructions` or `remember`.
   */
  preferences: z.array(z.string()).default([]),
});
export type DispatchConfig = z.infer<typeof DispatchConfigSchema>;

export const MemoryScopeSchema = z.enum(["job", "repo", "user"]);
export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryItemSchema = z.object({
  id: z.string(),
  scope: MemoryScopeSchema,
  text: z.string().min(1),
  source: z.string().default("user"),
  jobId: z.string().optional(),
  createdAt: z.string(),
});
export type MemoryItem = z.infer<typeof MemoryItemSchema>;

export const JobStatusSchema = z.enum([
  /**
   * Accepted and durable, waiting for the drain loop to pick it up (ADR-0047).
   * `start_job` returns here — auth, git and worker spawn all happen after.
   * A job also returns to `queued` when it was blocked and the block clears.
   */
  "queued",
  /**
   * A gate needs a human answer before this job can run (ADR-0047): a dirty
   * checkout, or an overlap with another job's paths. Before M-067 these
   * returned a message and created no job at all, so the work vanished.
   */
  "needs_confirm",
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
  "paused",
  /**
   * Finished, with commits on the job branch that are not on the user's
   * branch. ADR-0042 §1 makes the supervisor commit so work survives worktree
   * pruning; landing it anywhere the user did not ask for is still their call.
   */
  "needs_review",
  "done",
  "cancelled",
  "error",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/** One file carried by a job branch's own commits. */
export const ReviewFileSchema = z.object({
  path: z.string(),
  added: z.number().int().min(0).default(0),
  removed: z.number().int().min(0).default(0),
  change: z
    .enum(["added", "modified", "deleted", "renamed", "untracked"])
    .default("modified"),
});
export type ReviewFile = z.infer<typeof ReviewFileSchema>;

export const JobReviewSchema = z.object({
  files: z.array(ReviewFileSchema).default([]),
  totalAdded: z.number().int().min(0).default(0),
  totalRemoved: z.number().int().min(0).default(0),
  /** True when the file list was capped for display. */
  truncated: z.boolean().default(false),
  /** Branch holding the work. Never the branch the user is on. */
  branch: z.string().default(""),
  /** What the branch was compared against. */
  baseRef: z.string().default(""),
  /** True once the supervisor committed (ADR-0042 §1). */
  committed: z.boolean().default(false),
  /** Always false: Prism does not merge a job for the user. */
  merged: z.literal(false).default(false),
  /**
   * Paths dirty at dispatch that the job also touched (ADR-0045 §3) — the
   * user's change and the job's change are genuinely mixed there.
   */
  mixedPaths: z.array(z.string()).default([]),
  /** Files the user kept from this review (checkout Keep). */
  keptPaths: z.array(z.string()).optional(),
});
export type JobReview = z.infer<typeof JobReviewSchema>;

export const WorktreeSourceSchema = z.enum([
  "cursor",
  "claude",
  "prism",
  /** The user's own checkout — no worktree at all (ADR-0045). */
  "checkout",
]);
export type WorktreeSource = z.infer<typeof WorktreeSourceSchema>;

/**
 * A gate waiting on a human (ADR-0047). Carried on the job record so the
 * question survives the chat turn that asked it — the board can show it, and
 * any surface can answer it.
 */
export const JobConfirmSchema = z.object({
  kind: z.enum(["dirty-checkout", "path-overlap"]),
  /** The argument `start_job` must be re-called with to clear this gate. */
  arg: z.enum(["confirmDirty", "confirmOverlap"]),
  question: z.string().default(""),
  /** Dirty paths, for `dirty-checkout`. */
  dirtyPaths: z.array(z.string()).default([]),
  /** The job already holding the overlapping paths, for `path-overlap`. */
  overlapJobId: z.string().optional(),
  overlapTitle: z.string().optional(),
});
export type JobConfirm = z.infer<typeof JobConfirmSchema>;

export const JobRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  playbook: z.string().default("ticket"),
  prd: z.string().default(""),
  branch: z.string(),
  worktreePath: z.string(),
  source: WorktreeSourceSchema,
  cursorAgentId: z.string().optional(),
  claudeSession: z.string().optional(),
  /** Backend running this job (ADR-0044). Absent on pre-M-065 records = cursor. */
  workerBackend: WorkerBackendSchema.optional(),
  /** Claude session_id, captured from stream-json init; the resume handle. */
  workerSessionId: z.string().optional(),
  /** Model id the worker reported (e.g. claude-sonnet-4-5). */
  workerModel: z.string().optional(),
  /** Thinking / effort the worker reported. */
  workerThinking: z.string().optional(),
  /**
   * Where this job works (ADR-0045). Absent on pre-M-066 records = worktree
   * (every job was isolated then).
   */
  placement: JobPlacementSchema.optional(),
  /**
   * Paths already dirty in the checkout when the job was dispatched. The
   * review and any later commit subtract them (ADR-0045 §3).
   */
  preExistingChanges: z.array(z.string()).optional(),
  workerPid: z.number().int().optional(),
  runId: z.string().optional(),
  lastActivity: z.string().optional(),
  /**
   * When the worker last wrote to its run sidecar (M-067 P-S2).
   *
   * `status: "running"` is a claim about right now, and a stored status cannot
   * make that claim on its own. This is the evidence behind it: the UI can say
   * "running, last output 8s ago" instead of asking the reader to trust a
   * string that was written some unknown time ago.
   */
  lastHeartbeat: z.string().optional(),
  resultSummary: z.string().optional(),
  errorMessage: z.string().optional(),
  /** Write-ups under `.prism/dispatch/notes/`, when the job left any. */
  notes: z.array(z.string()).optional(),
  /** Cited paths the agent claimed but did not write. */
  citedMissing: z.array(z.string()).optional(),
  pendingContext: z.string().optional(),
  /** Supervisor-run checks and the job commit (ADR-0042 §1, §3). */
  review: JobReviewSchema.optional(),
  verification: z.enum(["passed", "failed", "skipped"]).optional(),
  verificationDetail: z.string().optional(),
  commitSha: z.string().optional(),
  status: JobStatusSchema,
  lastStep: z.string().default(""),
  nextStep: z.string().default(""),
  waitingOn: z.string().default(""),
  /**
   * The gate currently waiting on a human, when `status` is `needs_confirm`.
   * The board renders a Confirm action from this. Cleared once answered.
   */
  confirm: JobConfirmSchema.optional(),
  /**
   * Gates the user has already granted, by argument name. Kept separate from
   * `confirm` so "the question" and "the answer" cannot be confused: a job can
   * hold a granted `confirmDirty` while a fresh `confirmOverlap` question is
   * still pending.
   */
  confirmed: z.array(z.string()).optional(),
  /**
   * The four timestamps (ADR-0047). Before M-067 there was only `createdAt`,
   * stamped at enqueue, and every surface measured elapsed time from it —
   * which counted a 180-second login as work the agent was doing.
   *
   * `createdAt` accepted · `queuedAt` entered the queue · `startedAt` worker
   * launched · `finishedAt` reached a terminal state. Elapsed derives from
   * `startedAt` and freezes at `finishedAt`; see `@repo-prism/shared`
   * `jobDurations`. All three new fields are optional so pre-M-067 records on
   * disk still parse.
   */
  createdAt: z.string(),
  queuedAt: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  updatedAt: z.string(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

/** Statuses a job cannot leave without a human or a worker acting. */
export const TERMINAL_JOB_STATUSES = [
  "done",
  "cancelled",
  "error",
  "needs_review",
] as const satisfies readonly JobStatus[];

export function isTerminalJobStatus(status: JobStatus): boolean {
  return (TERMINAL_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

/**
 * Statuses where no worker is burning time, so the duration clock must stop.
 *
 * Wider than terminal on purpose: a `paused` job has a live record but no
 * running process, and letting its "worked" time climb overnight would be the
 * same class of lie M-067 set out to remove. `finishedAt` is stamped on entry
 * to any of these and cleared when the job starts moving again, so it reads as
 * "when the clock stopped" rather than strictly "when it ended".
 */
export const CLOCK_STOPPED_JOB_STATUSES = [
  ...TERMINAL_JOB_STATUSES,
  "paused",
] as const satisfies readonly JobStatus[];

export function isClockStoppedStatus(status: JobStatus): boolean {
  return (CLOCK_STOPPED_JOB_STATUSES as readonly JobStatus[]).includes(status);
}

export const GitSnapshotSchema = z.object({
  branch: z.string(),
  dirtyCount: z.number().int(),
  dirtySample: z.array(z.string()),
  ahead: z.number().int().optional(),
  behind: z.number().int().optional(),
  recent: z.array(z.string()),
  sinceYesterday: z.array(z.string()).optional(),
  userName: z.string().optional(),
  error: z.string().optional(),
});
export type GitSnapshot = z.infer<typeof GitSnapshotSchema>;

/**
 * A connector the host agent has, as discovery found it (ADR-0049).
 *
 * Names and capabilities only. There is no token field and there will not be
 * one: the host makes the call, so a credential never reaches Prism.
 */
export const HostConnectorSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  hosts: z.array(z.enum(["cursor", "claude"])),
  skills: z.array(z.string()),
  transport: z.string().optional(),
  source: z.string(),
});

export const FillRequestSchema = z.object({
  section: z.enum(["tickets", "reviews", "messages", "calendar", "docs"]),
  heading: z.string(),
  ask: z.string(),
  connectors: z.array(z.string()),
});

export const FillContractSchema = z.object({
  requests: z.array(FillRequestSchema),
  unfillable: z.array(
    z.enum(["tickets", "reviews", "messages", "calendar", "docs"]),
  ),
});

export const DayBriefingSchema = z.object({
  message: z.string(),
  generatedAt: z.string(),
  git: GitSnapshotSchema,
  jobs: z.array(JobRecordSchema),
  memories: z.array(MemoryItemSchema),
  suggestedFocus: z.string(),
  /** What the host has connected, so a surface can show it. */
  connectors: z.array(HostConnectorSchema),
  /** The sections the host agent should fill, and with what. */
  fill: FillContractSchema,
  configureHint: z.string().optional(),
});
export type DayBriefing = z.infer<typeof DayBriefingSchema>;
