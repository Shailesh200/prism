/** Stages shown on the Skills generating chip (Stitch Title Integration). */
export type SkillGenerateStage =
  | "Waiting"
  | "Thinking"
  | "Writing"
  | "Finalising"
  | "Done"
  | "Failed";

export const GENERATE_STEPS = [
  "Waiting",
  "Thinking",
  "Writing",
  "Finalising",
] as const;

export type GenerateLiveStage = (typeof GENERATE_STEPS)[number];

export function generateStepFlags(stage: SkillGenerateStage): {
  readonly index: number;
  readonly done: boolean;
  readonly failed: boolean;
} {
  if (stage === "Failed") {
    return { index: GENERATE_STEPS.length - 1, done: false, failed: true };
  }
  if (stage === "Done") {
    return { index: GENERATE_STEPS.length - 1, done: true, failed: false };
  }
  const index = GENERATE_STEPS.indexOf(stage as GenerateLiveStage);
  return { index: index < 0 ? 0 : index, done: false, failed: false };
}

/** Cancel was clicked before the Skill: job record showed up on the board. */
export function shouldCancelArrivingSkillJob(
  cancelledName: string | undefined,
  skillName: string,
): boolean {
  const want = skillName.trim();
  const cancelled = cancelledName?.trim();
  return Boolean(want && cancelled && want === cancelled);
}

const GENERATE_LIVE = new Set([
  "queued",
  "needs_confirm",
  "ready",
  "booting",
  "running",
  "waiting_on_you",
  "blocked",
  "paused",
  "needs_review",
]);

const GENERATE_SETTLED = new Set(["done", "failed", "error", "cancelled"]);

export function isSkillJobTitle(
  job: { readonly title: string },
  skillName: string,
): boolean {
  const want = skillJobTitle(skillName).toLowerCase();
  return job.title.toLowerCase().startsWith(want);
}

/** Queue/create stamp — not startedAt, which jumps when the worker boots. */
export function generateElapsedFrom(job?: {
  readonly queuedAt?: string;
  readonly createdAt?: string;
  readonly startedAt?: string;
}): string | undefined {
  const stamp = job?.queuedAt ?? job?.createdAt ?? job?.startedAt;
  return stamp?.trim() || undefined;
}

/** A live or just-settled Skill: job that belongs to this queued generate. */
export function skillJobCoversPending(
  job: {
    readonly title: string;
    readonly status: string;
    readonly queuedAt?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
  },
  skillName: string,
  pendingQueuedAt: string | undefined,
): boolean {
  if (!isSkillJobTitle(job, skillName)) return false;
  if (GENERATE_LIVE.has(job.status)) return true;
  if (!GENERATE_SETTLED.has(job.status)) return false;
  if (!pendingQueuedAt?.trim()) return false;
  const jobAt = Date.parse(
    job.queuedAt ?? job.createdAt ?? job.updatedAt ?? "",
  );
  const pendingAt = Date.parse(pendingQueuedAt);
  if (!Number.isFinite(jobAt) || !Number.isFinite(pendingAt)) return false;
  return jobAt >= pendingAt - 15_000;
}

export function skillGenerateStage(job: {
  readonly status: string;
  readonly lastActivity?: string;
}): { readonly stage: SkillGenerateStage; readonly progress: number } {
  const status = job.status;
  const activity = (job.lastActivity ?? "").toLowerCase();
  if (status === "failed" || status === "error" || status === "cancelled") {
    return { stage: "Failed", progress: 1 };
  }
  if (status === "done") return { stage: "Done", progress: 1 };
  if (
    status === "needs_confirm" ||
    status === "waiting_on_you" ||
    status === "blocked" ||
    status === "paused"
  ) {
    return { stage: "Waiting", progress: 0.12 };
  }
  if (
    /check|verif|final|review/.test(activity) ||
    status === "needs_review" ||
    status === "ready"
  ) {
    return { stage: "Finalising", progress: 0.88 };
  }
  if (/edit|writ|file|using |finished /.test(activity)) {
    return { stage: "Writing", progress: 0.58 };
  }
  if (/think/.test(activity) || status === "queued" || status === "booting") {
    return { stage: "Thinking", progress: 0.22 };
  }
  if (status === "running") {
    return { stage: "Writing", progress: 0.58 };
  }
  return { stage: "Thinking", progress: 0.22 };
}

export function formatElapsed(
  fromIso: string | undefined,
  nowMs: number,
): string {
  if (!fromIso) return "0:00";
  const started = Date.parse(fromIso);
  if (!Number.isFinite(started)) return "0:00";
  const seconds = Math.max(0, Math.floor((nowMs - started) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function skillJobTitle(name: string): string {
  return `Skill: ${name.trim()}`;
}

export function isSkillGenerateJob(
  job: { readonly title: string; readonly status: string },
  skillName: string,
): boolean {
  if (!isSkillJobTitle(job, skillName)) return false;
  return GENERATE_LIVE.has(job.status);
}

export function isPendingSkillGenerate(
  composeTitle: string | undefined,
  skillName: string,
): boolean {
  const title = composeTitle?.trim().toLowerCase();
  const name = skillName.trim();
  if (!title || !name) return false;
  return title.startsWith(skillJobTitle(name).toLowerCase());
}

export function isFinishedSkillJob(
  job: { readonly title: string; readonly status: string },
  skillName: string,
): boolean {
  return isSkillJobTitle(job, skillName) && job.status === "done";
}

export function latestFinishedSkillJob<
  T extends { readonly title: string; readonly status: string; readonly updatedAt?: string; readonly finishedAt?: string },
>(jobs: readonly T[] | undefined, skillName: string): T | undefined {
  const key = skillName.trim();
  if (!key || !jobs) return undefined;
  let latest: T | undefined;
  let latestMs = 0;
  for (const job of jobs) {
    if (!isFinishedSkillJob(job, key)) continue;
    const ms = Date.parse(job.finishedAt ?? job.updatedAt ?? "");
    const stamp = Number.isFinite(ms) ? ms : 0;
    if (!latest || stamp >= latestMs) {
      latest = job;
      latestMs = stamp;
    }
  }
  return latest;
}

export const PENDING_GENERATE = {
  stage: "Waiting" as const,
  progress: 0.12,
};

export const APPLIED_GENERATE = {
  stage: "Done" as const,
  progress: 1,
};
