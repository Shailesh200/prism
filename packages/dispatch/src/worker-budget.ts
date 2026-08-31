import { freemem } from "node:os";
import { statfs } from "node:fs/promises";

/** Refuse to start a job when the volume cannot absorb a runaway install. */
export const MIN_FREE_BYTES = 1_000_000_000;

/** Refuse a second Cursor agent when the machine is already swapping. */
export const MIN_FREE_RAM_BYTES = 400_000_000;

export async function diskBudgetMessage(
  path: string,
  minBytes: number = MIN_FREE_BYTES,
): Promise<string | undefined> {
  try {
    const stats = await statfs(path);
    const free = Number(stats.bavail) * Number(stats.bsize);
    if (!Number.isFinite(free) || free >= minBytes) return undefined;
    const gb = Math.max(0, Math.round((free / 1_000_000_000) * 10) / 10);
    return `This machine is low on disk (${gb} GB free). Free some space, then start the job again.`;
  } catch {
    return undefined;
  }
}

export function ramBudgetMessage(
  freeBytes: number = freemem(),
  minBytes: number = MIN_FREE_RAM_BYTES,
): string | undefined {
  if (!Number.isFinite(freeBytes) || freeBytes >= minBytes) return undefined;
  const gb = Math.max(0, Math.round((freeBytes / 1_000_000_000) * 10) / 10);
  return `This machine is low on memory (${gb} GB free). Close extra Cursor windows, then start the job. A local teammate is a second Cursor agent — do not start one for a repo-wide audit (say “how healthy is this repo” instead).`;
}

/** Headroom a further concurrent teammate needs beyond the floor. */
export const PER_JOB_RESERVE_BYTES = 1_500_000_000;

/**
 * Admit a job on live free memory rather than a constant (ADR-0042 §5).
 *
 * ADR-0041 capped `maxJobs` at 1 because a second agent could exhaust an 8 GB
 * machine. The cap was a proxy for "is there room" — measuring directly is
 * both safer on small machines and unblocks parallelism on large ones.
 */
export function admissionMessage(input: {
  readonly activeCount: number;
  readonly maxJobs: number;
  readonly freeBytes?: number;
}): string | undefined {
  if (input.activeCount >= input.maxJobs) {
    return `At the job cap (${input.maxJobs}). Finish or cancel one, or raise maxJobs with configure.`;
  }
  if (input.activeCount === 0) return undefined;

  const free = input.freeBytes ?? freemem();
  if (!Number.isFinite(free)) return undefined;
  const needed = MIN_FREE_RAM_BYTES + PER_JOB_RESERVE_BYTES;
  if (free >= needed) return undefined;

  const gb = Math.max(0, Math.round((free / 1_000_000_000) * 10) / 10);
  const plural = input.activeCount === 1 ? "teammate is" : "teammates are";
  return `${input.activeCount} ${plural} already running and only ${gb} GB of memory is free. Let one finish, or cancel it, before starting another.`;
}

export function workerChildEnv(
  env: NodeJS.ProcessEnv,
  apiKey?: string,
): NodeJS.ProcessEnv {
  const next: NodeJS.ProcessEnv = { ...env };
  const stripped = (env.NODE_OPTIONS ?? "")
    .split(/\s+/)
    .filter((part) => part && !/max-old-space-size/i.test(part))
    .join(" ");
  if (stripped) next.NODE_OPTIONS = stripped;
  else delete next.NODE_OPTIONS;
  if (apiKey) next.CURSOR_API_KEY = apiKey;
  return next;
}
