import {
  assembleDnaReport,
  buildDependencyGraph,
  buildFeatureGraph,
  buildKnowledgeGraph,
  findReferences as queryReferences,
  findSymbol as querySymbols,
  type DependencyGraphOptions,
  type FeatureInfo,
  type FindReferencesQuery,
  type FindSymbolQuery,
  type KnowledgeGraphStats,
  type ReferenceHit,
  type SymbolHit,
} from "@prism/intelligence";
import {
  PrismErrorCode,
  type BlastRadiusReport,
  type DnaReport,
  type GraphSnapshotDto,
  type HealthScore,
  type IndexProgressEvent,
  type IndexSnapshot,
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
import type { IndexWorkspaceOptions, PrismEnginePorts } from "./ports.js";

export type KnowledgeGraphView = {
  readonly graph: GraphSnapshotDto;
  readonly stats: KnowledgeGraphStats;
};

export type FeatureGraphView = {
  readonly graph: GraphSnapshotDto;
  readonly features: FeatureInfo[];
};

export type WorkspaceStatus = {
  readonly open: boolean;
  readonly rootPath: string;
  readonly repoId: RepoId;
  readonly lastIndexedAt: string | null;
  readonly coreVersion: string;
  readonly apiLevel: number;
  readonly capabilities: PrismCapabilities;
};

export type PrismWorkspace = {
  readonly rootPath: string;
  readonly repoId: RepoId;
  status(): WorkspaceStatus;
  /** Full index job → in-memory snapshot (M-007). */
  index(
    options?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSnapshot, PrismError>>;
  /** Last snapshot from `index()` / `analyze()`; `INDEX_REQUIRED` if none. */
  getIndex(): Result<IndexSnapshot, PrismError>;
  /**
   * File (default) or package-aggregated dependency graph from the last index.
   * `INDEX_REQUIRED` if none.
   */
  getDependencyGraph(
    options?: DependencyGraphOptions,
  ): Result<GraphSnapshotDto, PrismError>;
  /** Import/re-export cycles from the last index. `INDEX_REQUIRED` if none. */
  getCycles(options?: DependencyGraphOptions): Result<string[][], PrismError>;
  /**
   * Symbol-centric knowledge graph + stats from the last index.
   * `INDEX_REQUIRED` if none.
   */
  getKnowledgeGraph(): Result<KnowledgeGraphView, PrismError>;
  /** Find indexed symbols by name (optional path/kind filters). */
  findSymbol(query: FindSymbolQuery): Result<SymbolHit[], PrismError>;
  /** Find resolved references to a symbol. */
  findReferences(
    query: FindReferencesQuery,
  ): Result<ReferenceHit[], PrismError>;
  /**
   * Inferred feature graph (ADR-0011 heuristics) from the last index.
   * `INDEX_REQUIRED` if none.
   */
  getFeatureGraph(): Result<FeatureGraphView, PrismError>;
  /** List inferred features with member files and confidence. */
  listFeatures(): Result<FeatureInfo[], PrismError>;
  /** Lightweight summary (runs index when needed). */
  analyze(
    options?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSummary, PrismError>>;
  reindex(
    options?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSummary, PrismError>>;
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
  return prismError(PrismErrorCode.UNSUPPORTED, `${op} is not implemented yet`);
}

function toSummary(snapshot: IndexSnapshot): IndexSummary {
  return {
    repoId: snapshot.repoId,
    rootPath: snapshot.rootPath,
    indexedAt: snapshot.indexedAt,
    stats: snapshot.stats,
    warnings: [...snapshot.warnings],
  };
}

export function createWorkspace(options: {
  rootPath: string;
  capabilities: PrismCapabilities;
  ports: PrismEnginePorts;
  coreVersion: string;
  apiLevel: number;
}): PrismWorkspace {
  const rootPath = options.rootPath;
  const repoId = unsafeRepoId(`repo:${rootPath}`);
  let open = true;
  let lastIndexedAt: string | null = null;
  let lastSnapshot: IndexSnapshot | null = null;

  const ensureOpen = (): Result<true, PrismError> => {
    if (!open) {
      return err(
        prismError(PrismErrorCode.WORKSPACE_NOT_OPEN, "Workspace is closed"),
      );
    }
    return ok(true);
  };

  const runIndex = async (
    indexOptions?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSnapshot, PrismError>> => {
    const gate = ensureOpen();
    if (!gate.ok) return gate;

    if (!options.ports.indexer) {
      return err(
        prismError(PrismErrorCode.UNSUPPORTED, "Indexer is not wired"),
      );
    }

    const result = await options.ports.indexer.indexWorkspace(
      rootPath,
      indexOptions,
    );
    if (result.ok) {
      lastSnapshot = result.value;
      lastIndexedAt = result.value.indexedAt;
    }
    return result;
  };

  const runAnalyze = async (
    indexOptions?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSummary, PrismError>> => {
    const snapshot = await runIndex(indexOptions);
    if (!snapshot.ok) return snapshot;
    return ok(toSummary(snapshot.value));
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
        coreVersion: options.coreVersion,
        apiLevel: options.apiLevel,
        capabilities: options.capabilities,
      };
    },
    index: runIndex,
    getIndex() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(lastSnapshot);
    },
    getDependencyGraph(graphOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(buildDependencyGraph(lastSnapshot, graphOptions).graph);
    },
    getCycles(graphOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(buildDependencyGraph(lastSnapshot, graphOptions).cycles);
    },
    getKnowledgeGraph() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      const kg = buildKnowledgeGraph(lastSnapshot);
      return ok({ graph: kg.graph, stats: kg.stats });
    },
    findSymbol(query) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(querySymbols(buildKnowledgeGraph(lastSnapshot), query));
    },
    findReferences(query) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(queryReferences(buildKnowledgeGraph(lastSnapshot), query));
    },
    getFeatureGraph() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      const fg = buildFeatureGraph(lastSnapshot);
      return ok({ graph: fg.graph, features: fg.features });
    },
    listFeatures() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      return ok(buildFeatureGraph(lastSnapshot).features);
    },
    analyze: runAnalyze,
    reindex: runAnalyze,
    async getDna() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!options.ports.stack) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            "Stack detection is not wired",
          ),
        );
      }
      const profile = await options.ports.stack.detectProfile(rootPath);
      if (!profile.ok) return profile;
      const filePaths = lastSnapshot?.files.map((f) => f.path);
      return ok(
        assembleDnaReport({
          profile: profile.value,
          ...(filePaths === undefined ? {} : { filePaths }),
        }),
      );
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

/** Re-export for tests that assert progress typing. */
export type { IndexProgressEvent };
