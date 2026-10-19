import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  PrepareChange,
  SignalProvenance,
  WorkOrder,
} from "@repo-prism/shared";
import { prismHomeDir as prismHome } from "@repo-prism/shared/prism-home";

/** Runs kept per workspace (newest first) — enough for real history, not unbounded disk growth. */
export const PREPARE_HISTORY_LIMIT = 20;

export type LastPrepareSummary = {
  readonly workspace: string;
  readonly task: string;
  readonly generatedAt: string;
  readonly packFiles: readonly {
    readonly path: string;
    readonly symbols: readonly string[];
    readonly why: readonly string[];
    readonly tokenWeight: number;
    readonly provenance: SignalProvenance;
  }[];
  readonly reuse: readonly {
    readonly symbol: string;
    readonly path: string;
    readonly kind: string;
    readonly score: number;
    readonly evidence: string;
    readonly provenance: SignalProvenance;
  }[];
  readonly conventions: readonly {
    readonly path: string;
    readonly patternId: string;
    readonly whyCanonical: string;
  }[];
  readonly ambiguous: {
    readonly query: string;
    readonly candidates: readonly {
      readonly path: string;
      readonly symbol: string;
    }[];
  } | null;
  readonly truncated: boolean;
  readonly totalCount: number;
  readonly order?: WorkOrder | null;
};

function prepareHistoryPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHome(env), "prepare-history.json");
}

function skipPersist(env: NodeJS.ProcessEnv): boolean {
  if (env.PRISM_HOME?.trim()) return false;
  return env.VITEST === "true" || env.BUN_TEST === "1";
}

export function summarizePrepareChange(
  workspace: string,
  prep: PrepareChange,
): LastPrepareSummary {
  return {
    workspace,
    task: prep.pack.task,
    generatedAt: prep.generatedAt,
    packFiles: prep.pack.files.map((f) => ({
      path: f.path,
      symbols: f.symbols,
      why: f.why,
      tokenWeight: f.tokenWeight,
      provenance: f.provenance,
    })),
    reuse: prep.reuse.map((r) => ({
      symbol: r.symbol,
      path: r.path,
      kind: r.kind,
      score: r.score,
      evidence: r.evidence,
      provenance: r.provenance,
    })),
    conventions: (prep.conventions ?? []).map((c) => ({
      path: c.path,
      patternId: c.patternId,
      whyCanonical: c.whyCanonical,
    })),
    ambiguous: prep.ambiguous
      ? {
          query: prep.ambiguous.query,
          candidates: prep.ambiguous.candidates.map((c) => ({
            path: c.path,
            symbol: c.symbol,
          })),
        }
      : null,
    truncated: prep.pack.truncated,
    totalCount: prep.pack.totalCount,
    order: prep.order,
  };
}

async function readHistoryFile(
  env: NodeJS.ProcessEnv,
): Promise<Record<string, LastPrepareSummary[]>> {
  try {
    return JSON.parse(
      await readFile(prepareHistoryPath(env), "utf8"),
    ) as Record<string, LastPrepareSummary[]>;
  } catch {
    return {};
  }
}

/**
 * Appends this run to the workspace's history (newest first), capped at
 * {@link PREPARE_HISTORY_LIMIT}. Each `prepare_change` call used to overwrite
 * a single record — every prior pack, reuse hit, and House Style call was
 * lost the moment the next one ran.
 */
export async function writeLastPrepareChange(
  workspaceRoot: string,
  prep: PrepareChange,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (skipPersist(env)) return;
  const path = prepareHistoryPath(env);
  await mkdir(dirname(path), { recursive: true });
  const all = await readHistoryFile(env);
  const existing = all[workspaceRoot] ?? [];
  all[workspaceRoot] = [
    summarizePrepareChange(workspaceRoot, prep),
    ...existing,
  ].slice(0, PREPARE_HISTORY_LIMIT);
  await writeFile(path, `${JSON.stringify(all)}\n`, "utf8");
}

/** Every persisted run for this workspace, newest first. */
export async function readPrepareHistory(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<readonly LastPrepareSummary[]> {
  const all = await readHistoryFile(env);
  return all[workspaceRoot] ?? [];
}

/** The most recent run only — back-compat for callers that don't need history. */
export async function readLastPrepareChange(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LastPrepareSummary | undefined> {
  const history = await readPrepareHistory(workspaceRoot, env);
  return history[0];
}
