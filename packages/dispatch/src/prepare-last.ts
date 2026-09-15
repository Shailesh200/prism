import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { PrepareChange } from "@repo-prism/shared";
import { prismHome } from "./paths.js";

export type LastPrepareSummary = {
  readonly workspace: string;
  readonly task: string;
  readonly generatedAt: string;
  readonly packFiles: readonly {
    readonly path: string;
    readonly why: readonly string[];
  }[];
  readonly reuse: readonly {
    readonly symbol: string;
    readonly path: string;
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
};

function lastPreparePath(env: NodeJS.ProcessEnv = process.env): string {
  return join(prismHome(env), "prepare-last.json");
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
    packFiles: prep.pack.files.map((f) => ({ path: f.path, why: f.why })),
    reuse: prep.reuse.map((r) => ({ symbol: r.symbol, path: r.path })),
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
  };
}

export async function writeLastPrepareChange(
  workspaceRoot: string,
  prep: PrepareChange,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (skipPersist(env)) return;
  const path = lastPreparePath(env);
  await mkdir(dirname(path), { recursive: true });
  let all: Record<string, LastPrepareSummary> = {};
  try {
    all = JSON.parse(await readFile(path, "utf8")) as Record<
      string,
      LastPrepareSummary
    >;
  } catch {
    all = {};
  }
  all[workspaceRoot] = summarizePrepareChange(workspaceRoot, prep);
  await writeFile(path, `${JSON.stringify(all)}\n`, "utf8");
}

export async function readLastPrepareChange(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<LastPrepareSummary | undefined> {
  try {
    const all = JSON.parse(
      await readFile(lastPreparePath(env), "utf8"),
    ) as Record<string, LastPrepareSummary>;
    return all[workspaceRoot];
  } catch {
    return undefined;
  }
}
