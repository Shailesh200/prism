import { z } from "zod";

export const DISPATCH_DIR = ".prism/dispatch";

export const DriverIdSchema = z.enum([
  "github",
  "linear",
  "jira",
  "slack",
  "notion",
  "google-calendar",
]);
export type DriverId = z.infer<typeof DriverIdSchema>;

/** Chat phrasing ("google calendar") maps onto the canonical driver id. */
const DRIVER_ALIASES: Record<string, DriverId> = {
  github: "github",
  gh: "github",
  linear: "linear",
  jira: "jira",
  slack: "slack",
  notion: "notion",
  "google-calendar": "google-calendar",
  "google calendar": "google-calendar",
  googlecalendar: "google-calendar",
  gcal: "google-calendar",
  calendar: "google-calendar",
  google: "google-calendar",
};

export function parseDriverId(value: unknown): DriverId | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  const spaced = trimmed.replaceAll("_", " ").replace(/\s+/g, " ");
  const dashed = spaced.replaceAll(" ", "-");
  const compact = spaced.replaceAll(" ", "");
  const aliased =
    DRIVER_ALIASES[spaced] ?? DRIVER_ALIASES[dashed] ?? DRIVER_ALIASES[compact];
  if (aliased) return aliased;
  const parsed = DriverIdSchema.safeParse(dashed);
  return parsed.success ? parsed.data : undefined;
}

export const DRIVER_CONSENT: Record<DriverId, string> = {
  github: "network.github-user",
  linear: "network.linear",
  jira: "network.jira",
  slack: "network.slack",
  notion: "network.notion",
  "google-calendar": "network.google-calendar",
};

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
   * Job-behavior rules belong in `remember`, not here.
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
  /**
   * Dirty paths snapshotted at pause (and merged on a confirmed dirty
   * resume). Resume asks before working alongside anything not in this set,
   * preExistingChanges, or the review (ADR-0045 §4).
   */
  knownDirtyPaths: z.array(z.string()).optional(),
  workerPid: z.number().int().optional(),
  runId: z.string().optional(),
  lastActivity: z.string().optional(),
  resultSummary: z.string().optional(),
  errorMessage: z.string().optional(),
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
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;

export const DriverItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  detail: z.string().default(""),
});
export type DriverItem = z.infer<typeof DriverItemSchema>;

export const DriverSnapshotSchema = z.object({
  id: DriverIdSchema,
  connected: z.boolean(),
  available: z.boolean(),
  error: z.string().optional(),
  items: z.array(DriverItemSchema).default([]),
  recentlyDone: z.array(DriverItemSchema).optional(),
  viewerName: z.string().optional(),
});
export type DriverSnapshot = z.infer<typeof DriverSnapshotSchema>;

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

export const DayBriefingSchema = z.object({
  message: z.string(),
  generatedAt: z.string(),
  git: GitSnapshotSchema,
  jobs: z.array(JobRecordSchema),
  drivers: z.array(DriverSnapshotSchema),
  memories: z.array(MemoryItemSchema),
  suggestedFocus: z.string(),
  connectCtas: z.array(z.string()),
  configureHint: z.string().optional(),
});
export type DayBriefing = z.infer<typeof DayBriefingSchema>;
