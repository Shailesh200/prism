import type { JobLifecycleEvent, JobRecord, JobStatus } from "./types.js";

export type { JobLifecycleEvent };

/**
 * Append-only job graph (pause / resume / stuck never rewind a previous node).
 *
 * The four ADR-0047 stamps still drive durations. This list is the story the
 * Console draws: Accepted → Queued → Working → (Queued after pause) →
 * Waiting → Review / Finished.
 */
export const JOB_LIFECYCLE_KINDS = [
  "accepted",
  "queued",
  "working",
  "waiting",
  "review",
  "finished",
  "failed",
  "cancelled",
] as const;
export type JobLifecycleKind = (typeof JOB_LIFECYCLE_KINDS)[number];

export function kindForStatus(status: JobStatus): JobLifecycleKind {
  switch (status) {
    case "booting":
    case "running":
    case "ready":
      return "working";
    case "waiting_on_you":
    case "blocked":
      return "waiting";
    case "needs_review":
      return "review";
    case "done":
      return "finished";
    case "error":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      // queued, needs_confirm, paused — pause is a new Queued node.
      return "queued";
  }
}

export function seedLifecycle(job: JobRecord): JobLifecycleEvent[] {
  const events: JobLifecycleEvent[] = [];
  if (job.createdAt) {
    events.push({ kind: "accepted", at: job.createdAt });
  }
  if (job.queuedAt) {
    events.push({ kind: "queued", at: job.queuedAt });
  } else if (job.createdAt) {
    events.push({ kind: "queued", at: job.createdAt });
  }
  if (job.startedAt) {
    events.push({ kind: "working", at: job.startedAt });
  }
  return appendStatusEvent(events, job, job.updatedAt || job.createdAt);
}

function extraFor(status: JobStatus): Pick<JobLifecycleEvent, "by" | "note"> {
  if (status === "paused") return { by: "user", note: "paused" };
  if (status === "waiting_on_you" || status === "blocked") {
    return { note: "stuck" };
  }
  return {};
}

/**
 * Append a node when status moves forward (or sideways after Working).
 * Consecutive identical kinds are skipped so a job sitting in the queue does
 * not grow a new Queued node every drain tick.
 */
export function appendStatusEvent(
  events: readonly JobLifecycleEvent[],
  job: Pick<JobRecord, "status" | "startedAt">,
  at: string,
): JobLifecycleEvent[] {
  const kind = kindForStatus(job.status);
  const last = events.at(-1);
  if (kind === "accepted") return [...events];
  if (
    kind === "queued" &&
    last?.kind === "queued" &&
    last.note !== "paused" &&
    job.status !== "paused"
  ) {
    return [...events];
  }
  if (last?.kind === kind) return [...events];
  // Never rewind: after Working, Queued / Waiting are new nodes.
  // After a pause Queued, Working is a new node too (resume).
  if (
    (kind === "queued" || kind === "waiting") &&
    !job.startedAt &&
    last?.kind === "queued"
  ) {
    return [...events];
  }
  const extra = extraFor(job.status);
  const note =
    kind === "working" && last?.note === "paused" ? "resumed" : extra.note;
  return [
    ...events,
    {
      kind,
      at,
      ...(extra.by ? { by: extra.by } : {}),
      ...(note ? { note } : {}),
    },
  ];
}

export function withLifecycleEvents(
  prev: JobRecord | undefined,
  next: JobRecord,
  now: string,
): JobRecord {
  const prior = prev?.lifecycle?.length
    ? [...prev.lifecycle]
    : prev
      ? seedLifecycle(prev)
      : seedLifecycle(next);
  if (!prev) {
    return { ...next, lifecycle: prior };
  }
  return { ...next, lifecycle: appendStatusEvent(prior, next, now) };
}
