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
  maxJobs: z.number().int().min(1).max(20).default(1),
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
  "done",
  "cancelled",
  "error",
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

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
});
export type DriverSnapshot = z.infer<typeof DriverSnapshotSchema>;

export const GitSnapshotSchema = z.object({
  branch: z.string(),
  dirtyCount: z.number().int(),
  dirtySample: z.array(z.string()),
  ahead: z.number().int().optional(),
  behind: z.number().int().optional(),
  recent: z.array(z.string()),
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
