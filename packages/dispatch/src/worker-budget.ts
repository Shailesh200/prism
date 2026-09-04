import { freemem, totalmem } from "node:os";
import { execFileSync } from "node:child_process";
import { statfs } from "node:fs/promises";

/** Refuse to start a job when the volume cannot absorb a runaway install. */
export const MIN_FREE_BYTES = 1_000_000_000;

/**
 * Floor before spawning a teammate.
 *
 * Measured against *available* memory (see `availableMemoryBytes`), not
 * Node's `freemem()`. On macOS `freemem()` is only unused pages — inactive
 * and purgeable pages that the kernel will reclaim are ignored, so an 8 GB
 * Mac under normal Cursor + Chrome load often reports ~0.1 GB free while
 * still having a gigabyte of reclaimable headroom. That false alarm parked
 * jobs forever during the M-067 smoke test.
 */
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

/**
 * Memory the kernel can give a new process without swapping hard.
 *
 * On Darwin this is free + inactive + speculative + purgeable pages from
 * `vm_stat`. Elsewhere it falls back to `os.freemem()`.
 *
 * Never reads pressure APIs that need sudo. Returns `undefined` only when
 * every probe fails — callers then skip the gate rather than invent a zero.
 */
export function availableMemoryBytes(
  env: NodeJS.ProcessEnv = process.env,
): number | undefined {
  if (process.platform === "darwin") {
    const fromVm = darwinAvailableBytes(env);
    if (fromVm !== undefined) return fromVm;
  }
  const free = freemem();
  return Number.isFinite(free) ? free : undefined;
}

function darwinAvailableBytes(env: NodeJS.ProcessEnv): number | undefined {
  // Tests inject a fixture so we do not depend on the host's vm_stat.
  const fixture = env.PRISM_VM_STAT?.trim();
  let raw: string;
  try {
    raw =
      fixture ??
      execFileSync("/usr/bin/vm_stat", [], {
        encoding: "utf8",
        timeout: 2_000,
      });
  } catch {
    return undefined;
  }
  return parseDarwinVmStat(raw);
}

/**
 * Parse `vm_stat` output into reclaimable bytes.
 *
 * Page size is in the header (`page size of N bytes`). Counts that the
 * kernel will hand out under pressure: free, inactive, speculative,
 * purgeable. Active and wired stay reserved for what is already running.
 */
export function parseDarwinVmStat(raw: string): number | undefined {
  const sizeMatch = /page size of (\d+) bytes/i.exec(raw);
  const pageSize = sizeMatch ? Number(sizeMatch[1]) : 16_384;
  if (!Number.isFinite(pageSize) || pageSize <= 0) return undefined;

  const count = (label: string): number => {
    const match = new RegExp(`${label}:\\s+([\\d.]+)`, "i").exec(raw);
    const rawCount = match?.[1];
    if (!rawCount) return 0;
    return Number(rawCount.replace(/\./g, ""));
  };

  const pages =
    count("Pages free") +
    count("Pages inactive") +
    count("Pages speculative") +
    count("Pages purgeable");
  if (pages <= 0) return undefined;
  return pages * pageSize;
}

export function ramBudgetMessage(
  freeBytes: number | undefined = availableMemoryBytes(),
  minBytes: number = MIN_FREE_RAM_BYTES,
): string | undefined {
  if (freeBytes === undefined) return undefined;
  if (!Number.isFinite(freeBytes) || freeBytes >= minBytes) return undefined;
  const gb = Math.max(0, Math.round((freeBytes / 1_000_000_000) * 10) / 10);
  const totalGb = Math.round((totalmem() / 1_000_000_000) * 10) / 10;
  return `This machine is low on memory (${gb} GB available of ${totalGb} GB). Close extra Cursor or browser windows, then the job will start on its own. A local teammate is a second agent — do not start one for a repo-wide audit (say “how healthy is this repo” instead).`;
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

  const free = input.freeBytes ?? availableMemoryBytes();
  if (free === undefined || !Number.isFinite(free)) return undefined;
  const needed = MIN_FREE_RAM_BYTES + PER_JOB_RESERVE_BYTES;
  if (free >= needed) return undefined;

  const gb = Math.max(0, Math.round((free / 1_000_000_000) * 10) / 10);
  const plural = input.activeCount === 1 ? "teammate is" : "teammates are";
  return `${input.activeCount} ${plural} already running and only ${gb} GB of memory is available. Let one finish, or cancel it, before starting another.`;
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
