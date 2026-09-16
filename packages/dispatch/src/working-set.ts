/**
 * Working Set (M-073 W1/W2): the files, symbols, decisions and neighbors a
 * job (or an inline session with no job at all) has accumulated, so the
 * next `start_job` / resume prompt does not start from zero.
 *
 * Job-scoped sets live on `JobRecord.workingSet` and are merged in at reap
 * time (`run-state.ts`) from what the worker actually touched. The
 * standalone, workspace-keyed set below is for inline sessions — mirrors
 * `prepare-last.ts`'s one-file-per-workspace convention exactly.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { WorkingSetSchema, type WorkingSet } from "@repo-prism/shared";
import { prismHome } from "./paths.js";

const EMPTY_WORKING_SET: WorkingSet = {
  files: [],
  symbols: [],
  decisions: [],
  neighbors: [],
};

const CAP = 50;

function capped(values: readonly string[]): string[] {
  return [...new Set(values)].slice(-CAP);
}

/** Union two working sets, deduping and capping each list at 50 entries. */
export function mergeWorkingSet(
  existing: WorkingSet | undefined,
  patch: Partial<WorkingSet>,
): WorkingSet {
  const base = existing ?? EMPTY_WORKING_SET;
  return {
    ...((patch.jobId ?? base.jobId)
      ? { jobId: patch.jobId ?? base.jobId }
      : {}),
    files: capped([...base.files, ...(patch.files ?? [])]),
    symbols: capped([...base.symbols, ...(patch.symbols ?? [])]),
    decisions: capped([...base.decisions, ...(patch.decisions ?? [])]),
    neighbors: capped([...base.neighbors, ...(patch.neighbors ?? [])]),
  };
}

function standaloneWorkingSetPath(env: NodeJS.ProcessEnv): string {
  return join(prismHome(env), "working-set.json");
}

async function readStore(
  env: NodeJS.ProcessEnv,
): Promise<Record<string, WorkingSet>> {
  try {
    const raw = JSON.parse(
      await readFile(standaloneWorkingSetPath(env), "utf8"),
    ) as Record<string, unknown>;
    const store: Record<string, WorkingSet> = {};
    for (const [key, value] of Object.entries(raw)) {
      const parsed = WorkingSetSchema.safeParse(value);
      if (parsed.success) store[key] = parsed.data;
    }
    return store;
  } catch {
    return {};
  }
}

/** The standalone, inline-session working set for a workspace (M-073 W2). */
export async function readStandaloneWorkingSet(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkingSet> {
  const store = await readStore(env);
  return store[workspaceRoot] ?? EMPTY_WORKING_SET;
}

export async function writeStandaloneWorkingSet(
  workspaceRoot: string,
  patch: Partial<WorkingSet>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<WorkingSet> {
  const store = await readStore(env);
  const merged = mergeWorkingSet(store[workspaceRoot], patch);
  store[workspaceRoot] = merged;
  const path = standaloneWorkingSetPath(env);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(store)}\n`, "utf8");
  return merged;
}
