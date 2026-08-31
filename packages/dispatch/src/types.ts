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
  ticketHost: TicketHostSchema.default("linear"),
  mentionWindowHours: z.number().int().min(1).max(168).default(24),
  mentionLimit: z.number().int().min(1).max(50).default(10),
  trackedMessageLimit: z.number().int().min(1).max(50).default(15),
  slackTrackChannelIds: z.array(z.string()).max(5).default([]),
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
});
export type JobReview = z.infer<typeof JobReviewSchema>;

export const WorktreeSourceSchema = z.enum(["cursor", "claude", "prism"]);
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
