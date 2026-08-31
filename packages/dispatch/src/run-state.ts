import { execFileSync, spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { z } from "zod";
import { clip, textFromUnknown, toolNameFrom } from "./event-text.js";
import { readJsonFile, writeJsonFile } from "./json-file.js";
import { loadJobs, saveJobs } from "./jobs.js";
import { jobRef } from "./job-voice.js";
import { runStatePath, runsDir } from "./paths.js";
import { JobReviewSchema, type JobRecord } from "./types.js";

export const RunPhaseSchema = z.enum([
  "starting",
  "running",
  "thinking",
  "tool",
  "editing",
  "done",
  "failed",
  "cancelled",
]);
export type RunPhase = z.infer<typeof RunPhaseSchema>;

export const VerificationStatusSchema = z.enum(["passed", "failed", "skipped"]);

export const RunStateSchema = z.object({
  jobId: z.string(),
  pid: z.number().int().optional(),
  agentId: z.string().optional(),
  runId: z.string().optional(),
  phase: RunPhaseSchema,
  lastActivity: z.string().default(""),
  resultSummary: z.string().default(""),
  errorMessage: z.string().default(""),
  gitSummary: z.string().default(""),
  /** What the job branch carries, for the human to review before it lands. */
  review: JobReviewSchema.optional(),
  /** Supervisor-run checks after the agent stopped (ADR-0042 §3). */
  verification: VerificationStatusSchema.optional(),
  verificationDetail: z.string().optional(),
  /** Short sha of the job commit, when the run produced one (ADR-0042 §1). */
  commitSha: z.string().optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});
export type RunState = z.infer<typeof RunStateSchema>;

const WRITE_THROTTLE_MS = 400;

/**
 * How long a live worker may emit nothing before we stop calling it "running".
 *
 * Liveness alone is not progress: a wedged agent keeps its pid, so the old code
 * showed "Thinking" for an hour with no way to tell a slow model from a dead
 * one. Generous enough that a long tool call is not flagged.
 */
export const STALL_AFTER_MS = 10 * 60_000;

export function runStallMs(
  run: RunState | undefined,
  now: number = Date.now(),
): number {
  if (!run) return 0;
  const updated = Date.parse(run.updatedAt);
  if (!Number.isFinite(updated)) return 0;
  return Math.max(0, now - updated);
}

export function isRunStalled(
  run: RunState | undefined,
  now: number = Date.now(),
  thresholdMs: number = STALL_AFTER_MS,
): boolean {
  if (!run) return false;
  const active =
    run.phase === "running" ||
    run.phase === "thinking" ||
    run.phase === "tool" ||
    run.phase === "editing" ||
    run.phase === "starting";
  return active && runStallMs(run, now) >= thresholdMs;
}

export function formatStallDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export function isProcessAlive(pid: number | undefined): boolean {
  if (pid == null || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function killWorkerTree(pid: number): void {
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      detached: true,
    }).unref();
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    /* not a group leader */
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

export function killWorkerTreeForce(pid: number): void {
  if (process.platform === "win32") {
    killWorkerTree(pid);
    return;
  }
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
}

/** Kill children only (not this pid). Used when the worker-child exits. */
export function killDirectChildren(pid: number): void {
  if (process.platform === "win32") return;
  let stdout = "";
  try {
    stdout = execFileSync("pgrep", ["-P", String(pid)], {
      encoding: "utf8",
      timeout: 2_000,
    });
  } catch {
    return;
  }
  for (const line of stdout.split("\n")) {
    const child = Number.parseInt(line.trim(), 10);
    if (Number.isInteger(child) && child > 0 && child !== pid) {
      killWorkerTree(child);
    }
  }
}

export async function readRunState(
  workspaceRoot: string,
  jobId: string,
): Promise<RunState | undefined> {
  const raw = await readJsonFile<unknown>(
    runStatePath(workspaceRoot, jobId),
    null,
  );
  if (!raw) return undefined;
  const parsed = RunStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function writeRunState(
  workspaceRoot: string,
  jobId: string,
  state: RunState,
): Promise<void> {
  await writeJsonFile(runStatePath(workspaceRoot, jobId), state);
}

export async function patchRunState(
  workspaceRoot: string,
  jobId: string,
  patch: Partial<RunState>,
): Promise<RunState> {
  const now = new Date().toISOString();
  const current = (await readRunState(workspaceRoot, jobId)) ?? {
    jobId,
    phase: "starting" as const,
    lastActivity: "",
    resultSummary: "",
    errorMessage: "",
    gitSummary: "",
    startedAt: now,
    updatedAt: now,
  };
  const next: RunState = {
    ...current,
    ...patch,
    jobId,
    updatedAt: now,
  };
  await writeRunState(workspaceRoot, jobId, next);
  return next;
}

export function createRunWriter(
  workspaceRoot: string,
  jobId: string,
  initial: RunState,
): {
  snapshot(): RunState;
  patch(
    partial: Partial<RunState>,
    options?: { immediate?: boolean },
  ): Promise<RunState>;
} {
  let current = initial;
  let lastWrite = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = async (): Promise<RunState> => {
    lastWrite = Date.now();
    await writeRunState(workspaceRoot, jobId, current);
    return current;
  };

  return {
    snapshot: () => current,
    async patch(partial, options) {
      current = {
        ...current,
        ...partial,
        jobId,
        updatedAt: new Date().toISOString(),
      };
      if (options?.immediate) {
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        return flush();
      }
      const now = Date.now();
      if (now - lastWrite >= WRITE_THROTTLE_MS) {
        return flush();
      }
      if (!timer) {
        timer = setTimeout(() => {
          timer = undefined;
          void flush();
        }, WRITE_THROTTLE_MS);
        timer.unref();
      }
      return current;
    },
  };
}

export function activityFromEvent(
  event: unknown,
): { phase: RunPhase; lastActivity: string } | undefined {
  if (!event || typeof event !== "object") return undefined;
  const row = event as Record<string, unknown>;
  const type = String(row.type ?? row.kind ?? "").toLowerCase();

  if (type === "thinking" || type === "reason" || type === "reasoning") {
    return { phase: "thinking", lastActivity: "Thinking" };
  }
  if (
    type.includes("tool_call") ||
    type === "tool" ||
    type === "function_call"
  ) {
    const name = toolNameFrom(event);
    return {
      phase: "tool",
      lastActivity: name ? `Using ${name}` : "Using a tool",
    };
  }
  if (type.includes("tool_result") || type === "tool_response") {
    const name = toolNameFrom(event);
    return {
      phase: "tool",
      lastActivity: name ? `Finished ${name}` : "Finished a tool",
    };
  }
  if (type.includes("edit") || type === "write" || type === "apply") {
    return { phase: "editing", lastActivity: "Editing files" };
  }
  if (type === "assistant" || type === "delta") {
    const text = clip(textFromUnknown(event), 140);
    if (!text) return { phase: "thinking", lastActivity: "Thinking" };
    return { phase: "thinking", lastActivity: text };
  }
  return undefined;
}

export function composeResultSummary(
  gitSummary: string,
  assistant: string,
): string {
  const git = gitSummary.trim();
  const text = clip(assistant, 400);
  if (text && git && !/^No file changes/i.test(git)) {
    return clip(`${git} ${text}`, 500);
  }
  return text || git || "Wrapped up with no file changes.";
}

export type JobResultInput = {
  /** `git show --stat` totals for the job commit, "" when nothing committed. */
  readonly gitSummary: string;
  /** The agent's closing text, already stripped of worktree paths. */
  readonly assistant: string;
  readonly committed: boolean;
  readonly verification?: VerificationStatus;
  readonly verificationDetail?: string;
  /** Claimed-but-absent artifacts, from `fabricationNote`. */
  readonly fabricationNote?: string;
};

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

/**
 * The user-facing result. A run that committed nothing says so plainly rather
 * than dressing up an empty branch as success (ADR-0042 §1), and a failing
 * check is never hidden behind "done".
 */
export function composeJobResult(input: JobResultInput): string {
  const parts: string[] = [];

  if (input.committed && input.gitSummary.trim()) {
    parts.push(input.gitSummary.trim());
  } else if (!input.committed) {
    parts.push("Produced no reviewable change.");
  }

  const text = clip(input.assistant, 360);
  if (text) parts.push(text);

  if (input.verification === "failed") {
    parts.push(
      `Checks failed: ${input.verificationDetail || "see the branch"}.`,
    );
  } else if (input.verification === "passed") {
    parts.push(input.verificationDetail || "Checks passed.");
  }

  if (input.fabricationNote) parts.push(input.fabricationNote);

  return clip(parts.filter(Boolean).join(" "), 700);
}

export function applyRunToJob(
  job: JobRecord,
  run: RunState | undefined,
): JobRecord {
  const pid = run?.pid ?? job.workerPid;
  const alive = isProcessAlive(pid);
  const base: JobRecord = {
    ...job,
    ...(run?.agentId ? { cursorAgentId: run.agentId } : {}),
    ...(typeof run?.pid === "number" ? { workerPid: run.pid } : {}),
    ...(run?.runId ? { runId: run.runId } : {}),
    ...(run?.lastActivity ? { lastActivity: run.lastActivity } : {}),
  };

  if (run?.phase === "done") {
    const review = run.review ?? job.review;
    const changed = (review?.files.length ?? 0) > 0;
    return {
      ...base,
      // The supervisor commits so the work survives worktree pruning
      // (ADR-0042 §1), but landing it is the human's decision — a branch with
      // commits is a review, not a closed job.
      status: changed ? "needs_review" : "done",
      ...(review ? { review } : {}),
      resultSummary: run.resultSummary || run.gitSummary || job.resultSummary,
      errorMessage: undefined,
      nextStep: changed ? "review the changes" : "",
      waitingOn: "",
      ...(run.verification ? { verification: run.verification } : {}),
      ...(run.verificationDetail
        ? { verificationDetail: run.verificationDetail }
        : {}),
      ...(run.commitSha ? { commitSha: run.commitSha } : {}),
    };
  }
  if (run?.phase === "failed") {
    return {
      ...base,
      status: "error",
      errorMessage:
        run.errorMessage ||
        job.errorMessage ||
        "The teammate hit an error. Say resume to try again.",
      resultSummary: run.gitSummary || job.resultSummary,
      nextStep: "say resume to try again",
    };
  }
  if (run?.phase === "cancelled") {
    if (job.status === "paused") {
      return { ...base, status: "paused" };
    }
    if (job.status === "cancelled") return base;
    return { ...base, status: "cancelled", nextStep: "" };
  }

  const inFlight =
    job.status === "running" ||
    job.status === "booting" ||
    job.status === "ready";
  if (inFlight && !alive) {
    const hadPid = pid != null;
    const stale = !hadPid && !run && isStaleIso(job.updatedAt, 120_000);
    if (hadPid || stale) {
      return {
        ...base,
        status: "error",
        errorMessage:
          "The teammate stopped unexpectedly. Say resume to try again.",
        lastActivity: undefined,
        nextStep: "say resume to try again",
      };
    }
  }

  // Alive but silent for too long: say so instead of reporting progress that
  // is not happening. The pid is left alone — resume/cancel is the user's call.
  if (inFlight && alive && isRunStalled(run)) {
    const stalledFor = formatStallDuration(runStallMs(run));
    return {
      ...base,
      status: "waiting_on_you",
      lastActivity: `No activity for ${stalledFor}`,
      nextStep: "say resume to nudge it, or cancel",
      waitingOn: "stalled",
    };
  }

  if (
    job.status === "booting" &&
    run &&
    (run.phase === "running" ||
      run.phase === "thinking" ||
      run.phase === "tool" ||
      run.phase === "editing")
  ) {
    return { ...base, status: "running" };
  }

  return base;
}

function isStaleIso(iso: string, ms: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && Date.now() - t > ms;
}

function jobChanged(a: JobRecord, b: JobRecord): boolean {
  return (
    a.status !== b.status ||
    a.lastActivity !== b.lastActivity ||
    a.resultSummary !== b.resultSummary ||
    a.errorMessage !== b.errorMessage ||
    a.workerPid !== b.workerPid ||
    a.cursorAgentId !== b.cursorAgentId ||
    a.runId !== b.runId ||
    a.nextStep !== b.nextStep
  );
}

export async function reapJobs(workspaceRoot: string): Promise<JobRecord[]> {
  const jobs = await loadJobs(workspaceRoot);
  const next: JobRecord[] = [];
  let changed = false;
  for (const job of jobs) {
    const run = await readRunState(workspaceRoot, job.id);
    const merged = applyRunToJob(job, run);
    if (jobChanged(job, merged)) changed = true;
    next.push(merged);
  }
  if (changed) await saveJobs(workspaceRoot, next);
  return changed ? next : jobs;
}

export type JobNotice = {
  readonly text: string;
  readonly level: "info" | "error";
};

export async function drainNewNotices(
  workspaceRoot: string,
  seen: Map<string, string>,
): Promise<JobNotice[]> {
  const jobs = await loadJobs(workspaceRoot);
  const byId = new Map(jobs.map((job) => [job.id, job]));
  let names: string[] = [];
  try {
    names = await readdir(runsDir(workspaceRoot));
  } catch {
    return [];
  }
  const notices: JobNotice[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name.endsWith(".spawn.json")) continue;
    const jobId = name.slice(0, -".json".length);
    const run = await readRunState(workspaceRoot, jobId);
    if (!run) continue;
    if (
      run.phase !== "done" &&
      run.phase !== "failed" &&
      run.phase !== "cancelled"
    ) {
      continue;
    }
    const key = `${run.jobId}:${run.phase}:${run.completedAt ?? run.updatedAt}`;
    if (seen.has(key)) continue;
    seen.set(key, key);
    const job = byId.get(run.jobId);
    const label = job ? jobRef(job) : run.jobId;
    if (run.phase === "done") {
      notices.push({
        level: "info",
        text: `${label} finished. ${run.resultSummary || "Wrapped up."} Say “where are we” in chat for the result.`,
      });
    } else if (run.phase === "failed") {
      notices.push({
        level: "error",
        text: `${label} failed. ${run.errorMessage || "The teammate hit an error."} Say “where are we” in chat.`,
      });
    } else {
      notices.push({
        level: "info",
        text: `${label} was cancelled.`,
      });
    }
  }
  return notices;
}

export function startJobNoticeWatcher(
  workspaceRoot: string | (() => string),
  emit: (notice: JobNotice) => void,
  intervalMs = 2_000,
): () => void {
  const root = (): string =>
    typeof workspaceRoot === "function" ? workspaceRoot() : workspaceRoot;
  const seen = new Map<string, string>();
  const tick = async (): Promise<void> => {
    try {
      await reapJobs(root());
      const notices = await drainNewNotices(root(), seen);
      for (const notice of notices) emit(notice);
    } catch {
      /* host MCP must stay up even if a sidecar file is mid-write */
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
