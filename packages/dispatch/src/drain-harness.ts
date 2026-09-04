/**
 * Test harness for the two-phase dispatch (M-067 P-S1, ADR-0047).
 *
 * `start_job` used to run the whole pipeline before returning, so a test could
 * assert on its return value directly. It now returns as soon as the job is
 * durable, and the drain loop does the rest. Tests that care about the outcome
 * have to await the drain, which is exactly what a real caller experiences —
 * chat gets an instant "queued", the board fills in a moment later.
 *
 * Not exported from the package index: this exists for tests only.
 */

import { loadJobs } from "./jobs.js";
import { drainWorkspace } from "./queue.js";
import type { DispatchRuntime } from "./runtime.js";
import type { JobRecord } from "./types.js";

export type DispatchResult = {
  /** What chat saw immediately — a `queued` job, or a bare message. */
  readonly accepted: { job?: JobRecord; message: string };
  /** The job after the drain ran, reloaded from disk. */
  readonly job: JobRecord | undefined;
  readonly message: string;
};

/**
 * Dispatch a job and run one drain pass, then report the outcome.
 *
 * Exactly one pass on purpose. Each pass begins with `reapJobs`, which marks a
 * `running` job whose pid is dead as `error` — correct in production, but test
 * workers return a synthetic pid, so a second pass would "kill" a job that had
 * just started. Tests that need the queue to move again (a job parked behind
 * the cap, a gate answered) call `drain` explicitly.
 */
export async function dispatchAndDrain(
  runtime: DispatchRuntime,
  args: Record<string, unknown>,
): Promise<DispatchResult> {
  const accepted = (await runtime.handle("start_job", args)) as {
    job?: JobRecord;
    message: string;
  };
  await drainWorkspace(runtime.drainDeps());
  const jobs = await loadJobs(runtime.workspaceRoot);
  const id = accepted.job?.id;
  return {
    accepted,
    job: id ? jobs.find((row) => row.id === id) : undefined,
    message: accepted.message,
  };
}

/** Run the queue without dispatching anything new. */
export async function drain(runtime: DispatchRuntime): Promise<JobRecord[]> {
  await drainWorkspace(runtime.drainDeps());
  return await loadJobs(runtime.workspaceRoot);
}
