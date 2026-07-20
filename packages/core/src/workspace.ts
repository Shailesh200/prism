import {
  PrismErrorCode,
  type BlastRadiusReport,
  type DnaReport,
  type HealthScore,
  type IndexSummary,
  type PrismError,
  type RepoId,
  type Result,
  err,
  ok,
  prismError,
  unsafeRepoId,
} from "@prism/shared";
import type { PrismCapabilities } from "./capabilities.js";
import type { PrismEnginePorts } from "./ports.js";
import { PRISM_API_LEVEL, PRISM_CORE_VERSION } from "./version.js";

export type WorkspaceStatus = {
  readonly open: boolean;
  readonly rootPath: string;
  readonly repoId: RepoId;
  readonly lastIndexedAt: string | null;
  readonly coreVersion: typeof PRISM_CORE_VERSION;
  readonly apiLevel: typeof PRISM_API_LEVEL;
  readonly capabilities: PrismCapabilities;
};

export type PrismWorkspace = {
  readonly rootPath: string;
  readonly repoId: RepoId;
  status(): WorkspaceStatus;
  /** Stub analyze / reindex — empty structured result until indexer lands. */
  analyze(): Promise<Result<IndexSummary, PrismError>>;
  reindex(): Promise<Result<IndexSummary, PrismError>>;
  getDna(): Promise<Result<DnaReport, PrismError>>;
  getHealth(): Promise<Result<HealthScore, PrismError>>;
  blastRadius(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }): Promise<Result<BlastRadiusReport, PrismError>>;
  close(): void;
};

function notImplemented(op: string): PrismError {
  return prismError(
    PrismErrorCode.UNSUPPORTED,
    `${op} is not implemented yet (Core skeleton M-003)`,
  );
}

function emptyIndexSummary(rootPath: string, repoId: RepoId): IndexSummary {
  return {
    repoId,
    rootPath,
    indexedAt: new Date(0).toISOString(),
    stats: {
      filesTotal: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      durationMs: 0,
    },
    warnings: ["stub: no indexer wired (M-003)"],
  };
}

export function createWorkspace(options: {
  rootPath: string;
  capabilities: PrismCapabilities;
  ports: PrismEnginePorts;
}): PrismWorkspace {
  const rootPath = options.rootPath;
  const repoId = unsafeRepoId(`repo:${rootPath}`);
  let open = true;
  let lastIndexedAt: string | null = null;

  const ensureOpen = (): Result<true, PrismError> => {
    if (!open) {
      return err(
        prismError(PrismErrorCode.WORKSPACE_NOT_OPEN, "Workspace is closed"),
      );
    }
    return ok(true);
  };

  const runAnalyze = async (): Promise<Result<IndexSummary, PrismError>> => {
    const gate = ensureOpen();
    if (!gate.ok) return gate;

    if (options.ports.indexer) {
      const result = await options.ports.indexer.indexWorkspace(rootPath);
      if (result.ok) lastIndexedAt = result.value.indexedAt;
      return result;
    }

    // No-op stub: structured empty summary (consumers can open fixture paths today)
    const summary = emptyIndexSummary(rootPath, repoId);
    lastIndexedAt = summary.indexedAt;
    return ok(summary);
  };

  return {
    rootPath,
    repoId,
    status() {
      return {
        open,
        rootPath,
        repoId,
        lastIndexedAt,
        coreVersion: PRISM_CORE_VERSION,
        apiLevel: PRISM_API_LEVEL,
        capabilities: options.capabilities,
      };
    },
    analyze: runAnalyze,
    reindex: runAnalyze,
    async getDna() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return err(notImplemented("getDna"));
    },
    async getHealth() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return err(notImplemented("getHealth"));
    },
    async blastRadius() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return err(notImplemented("blastRadius"));
    },
    close() {
      open = false;
    },
  };
}
