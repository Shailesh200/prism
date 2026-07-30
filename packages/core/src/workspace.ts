import {
  assembleDnaReport,
  assembleIntelligenceReport,
  buildDependencyGraph,
  buildFeatureGraph,
  buildKnowledgeGraph,
  buildPersonaPresets,
  buildUtilityOverlay,
  buildBackendReport,
  buildCodeExplorerReport,
  buildHealthHistorySnapshot,
  buildTestingReport,
  buildSecurityReport,
  buildSoftImpactIndex,
  computeEngineeringHealth,
  computeHealthScore,
  computeRegionMovers,
  createUtilitiesSession,
  discoverLocalPackages,
  findReferences as queryReferences,
  findSymbol as querySymbols,
  getCwvReport as loadCwvReport,
  discoverFrontendAppRoutes,
  ingestCoverageFromWorkspace,
  listUtilityOverlayKinds as catalogUtilityOverlayKinds,
  parseUtilityOverlayKind,
  pickRegionMoverWindow,
  type DependencyGraphOptions,
  type FindReferencesQuery,
  type FindSymbolQuery,
  type ReferenceHit,
  type StartUtilityJobInput,
  type SymbolHit,
  type UtilitiesSession,
} from "@prism/intelligence";
import {
  appendHealthHistory,
  hasHealthHistorySha,
  listHealthHistory,
  openIndexCache,
} from "@prism/indexer";
import {
  computeBlastRadius,
  computeBreakingChangeHints,
  computeRenameImpact,
  computeSafeDelete,
  computeTestImpact,
} from "@prism/impact";
import {
  findPaths,
  listLandmarks as collectLandmarks,
  navigateFeature as routeBetweenFeatures,
  resolveEndpointNodeId,
  type RouteEndpoint,
} from "@prism/navigation";
import {
  buildRepositoryMap,
  emptyBookmarkStore,
  parseBookmarkStore,
  sortBookmarks,
  type MapPackageInfo,
} from "@prism/repository-map";
import {
  PrismErrorCode,
  CodeExplorerTargetSchema,
  classifyFileRole,
  fileRoleLabel,
  type BlastRadiusReport,
  type BreakingChangeHint,
  type BackendReport,
  type ChangeReviewItem,
  type ChangeReviewReport,
  type CodeExplorerReport,
  type CodeExplorerTarget,
  type ConsentRecord,
  type CwvReport,
  type DnaReport,
  type EngineeringHealthReport,
  type ExplainAreaSummary,
  type FeatureInfo,
  type GitActivity,
  type GitCommitRef,
  type GraphSnapshotDto,
  type HealthHistoryBackfillStatus,
  type HealthHistoryReport,
  type HealthScore,
  type IndexProgressEvent,
  type IndexSnapshot,
  type IndexSummary,
  type IngestArtifact,
  type IngestArtifactMeta,
  type IntelligenceReport,
  type KnowledgeGraphStats,
  type Landmark,
  type MapBookmark,
  type MapBookmarkStore,
  type MapZoomLevel,
  type NavigationRouteResult,
  type PersonaPresets,
  type PrismError,
  type RegionMoversReport,
  type RenameImpactReport,
  type RepoId,
  type RepositoryMap,
  type Result,
  type SafeDeleteReport,
  type SecurityReport,
  type TestImpactReport,
  type TestingReport,
  type StackPackageProfile,
  type StackProfile,
  type UtilityJob,
  type UtilityOverlayKindInfo,
  type UtilityOverlayReport,
  err,
  ok,
  prismError,
  unsafeRepoId,
} from "@prism/shared";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrismCapabilities } from "./capabilities.js";
import { readGitSignals, type GitSignals } from "./git/git-signals.js";
import {
  HEALTH_HISTORY_BACKFILL_DEFAULT_COMMITS,
  readHeadCommitSha,
  sampleGitCommits,
} from "./git/history-sample.js";
import type { IndexWorkspaceOptions, PrismEnginePorts } from "./ports.js";

/**
 * Coarse path → domain keyword heuristics for `explainArea` (M-048 Phase 5).
 * Intersected with the repo's detected {@link DnaReport.rankedDomains} so a
 * generic-looking path never surfaces a domain the repo doesn't have.
 */
const DOMAIN_PATH_HINTS: Readonly<Record<string, RegExp>> = {
  frontend: /\b(components?|pages?|views?|ui|frontend|hooks?)\b/i,
  backend: /\b(api|server|controllers?|routes?|services?|backend|handlers?)\b/i,
  mobile: /\b(screens?|navigators?|mobile)\b/i,
  desktop: /\b(main|preload|renderer|desktop)\b/i,
  devops_platform: /(\.github\/workflows|docker|k8s|terraform|infra|devops)/i,
  data_ml_ai: /\b(pipelines?|models?|notebooks?|\bml\b|\bdata\b)\b/i,
};

function matchDomainsForPath(
  path: string,
  candidateDomains: readonly string[],
): string[] {
  return candidateDomains.filter((d) => DOMAIN_PATH_HINTS[d]?.test(path));
}

export type FindRouteQuery = {
  readonly from: RouteEndpoint;
  readonly to: RouteEndpoint;
  readonly maxAlternatives?: number;
  readonly maxHops?: number;
};

export type GetRepositoryMapOptions = {
  readonly zoom?: MapZoomLevel;
  readonly layers?: readonly string[];
  readonly bookmarks?: readonly MapBookmark[];
};

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

/** Index freshness for watch / status bar (M-048 / ADR-0026). */
export type IndexFreshness = {
  readonly watching: boolean;
  readonly status: "fresh" | "stale" | "indexing";
  readonly lastIndexedAt: string | null;
  readonly pendingDirtyCount: number;
  readonly dirtyPaths: readonly string[];
};

export type StartWatchOptions = {
  readonly debounceMs?: number;
  readonly onChange?: (freshness: IndexFreshness) => void;
};

export type NotifyWatchPathsInput = {
  readonly changedPaths?: readonly string[];
  readonly deletedPaths?: readonly string[];
};

/** Package entry for Mono-v1 selector (MR-03). */
export type WorkspacePackageInfo = {
  readonly id: string;
  readonly name?: string;
  readonly rootDir: string;
  readonly domains: readonly string[];
  readonly personas: readonly string[];
};

export type GetStackProfileOptions = {
  /** Explicit package id; overrides session selection when set. */
  readonly packageId?: string | null;
};

export type GetUtilityOverlayOptions = {
  readonly packageId?: string | null;
};

/** Multi-path change review input (M-048 Phase 4). */
export type ReviewChangesInput = {
  readonly paths: readonly string[];
  /** Diff base label to stamp on the report (display only). */
  readonly base?: string;
};

/** Upsert input for `saveBookmark` — `id` omitted creates a new bookmark. */
export type SaveBookmarkInput = {
  readonly id?: string;
  readonly label: string;
  readonly path?: string;
  readonly nodeId?: string;
  readonly zoom?: MapZoomLevel;
  readonly note?: string;
  readonly createdAt?: string;
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
  /**
   * Aggregate Repository Intelligence report (DNA + graphs + consistency).
   * Requires a prior `index()`. `INDEX_REQUIRED` if none.
   */
  intelligence(): Promise<Result<IntelligenceReport, PrismError>>;
  /** Lightweight summary (runs index when needed). */
  analyze(
    options?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSummary, PrismError>>;
  reindex(
    options?: IndexWorkspaceOptions,
  ): Promise<Result<IndexSummary, PrismError>>;
  /**
   * Start watch mode (M-048 / ADR-0026). Surfaces may also push FS events via
   * {@link notifyWatchPaths}. Debounced dirty set triggers a warm/dirty reindex.
   */
  startWatch(options?: StartWatchOptions): Result<void, PrismError>;
  stopWatch(): Result<void, PrismError>;
  /** Forward host FS events into the dirty set while watching. */
  notifyWatchPaths(input: NotifyWatchPathsInput): Result<void, PrismError>;
  getIndexFreshness(): Result<IndexFreshness, PrismError>;
  getDna(): Promise<Result<DnaReport, PrismError>>;
  /**
   * Persona / domain Map+insights presets from the stack profile (M-041 P0).
   * Honors selected package when set (Mono-v1).
   */
  getPersonaPresets(): Promise<Result<PersonaPresets, PrismError>>;
  /**
   * Workspace stack rollup, or a single package profile when `packageId`
   * / session selection is set (M-041 Mono-v1).
   */
  getStackProfile(
    options?: GetStackProfileOptions,
  ): Promise<Result<StackProfile, PrismError>>;
  /** List packages from the workspace rollup (MR-01/02). */
  listPackages(): Promise<Result<WorkspacePackageInfo[], PrismError>>;
  /**
   * Select package scope for utilities / presets (`null` = whole workspace).
   */
  selectPackage(
    packageId: string | null,
  ): Promise<Result<string | null, PrismError>>;
  /** Current package selection (`null` = workspace). */
  getSelectedPackage(): Result<string | null, PrismError>;
  /** Start an async utility job (echo-ingest in P0; Lighthouse in P1). */
  startUtilityJob(
    input: StartUtilityJobInput,
  ): Promise<Result<UtilityJob, PrismError>>;
  getUtilityJob(jobId: string): Result<UtilityJob, PrismError>;
  listUtilityJobs(): Result<UtilityJob[], PrismError>;
  listIngestArtifacts(filter?: {
    kind?: string;
    packageId?: string;
  }): Promise<Result<IngestArtifactMeta[], PrismError>>;
  getIngestArtifact(id: string): Promise<Result<IngestArtifact, PrismError>>;
  /** Load a lighthouse-cwv ingest artifact as a typed CWV report (M-041 P1). */
  getCwvReport(artifactId: string): Promise<Result<CwvReport, PrismError>>;
  /**
   * Discover frontend URL paths for lab Routes UI (Next pages + React Router /
   * SEO path literals under the workspace).
   */
  discoverFrontendRoutes(): Result<string[], PrismError>;
  /** Catalog of Map/MCP utility overlay kinds (M-041 P2–P7 / Mono-v2). */
  listUtilityOverlayKinds(): Result<UtilityOverlayKindInfo[], PrismError>;
  /**
   * Build a domain utility overlay for Map layers (local FS / index heuristics).
   */
  getUtilityOverlay(
    kind: string,
    options?: GetUtilityOverlayOptions,
  ): Promise<Result<UtilityOverlayReport, PrismError>>;
  /**
   * Route-granular backend intelligence (M-044 / ADR-0015). Local static
   * heuristics (Express / Nest / Fastify + data/env/background facets).
   */
  getBackendReport(
    options?: GetUtilityOverlayOptions,
  ): Promise<Result<BackendReport, PrismError>>;
  /**
   * Testing structure + optional on-disk coverage (M-046 / ADR-0022).
   * Does not require a prior index (walks the workspace tree).
   */
  getTestingReport(): Promise<Result<TestingReport, PrismError>>;
  /**
   * Left-shift tooling + fundamental security checklist (M-046 / ADR-0022).
   */
  getSecurityReport(): Promise<Result<SecurityReport, PrismError>>;
  /**
   * Re-read coverage artifacts after an external test run and return an
   * updated TestingReport (M-046 / ADR-0022).
   */
  ingestCoverageFromWorkspace(): Promise<Result<TestingReport, PrismError>>;
  setConsent(
    purpose: string,
    granted: boolean,
  ): Promise<Result<ConsentRecord, PrismError>>;
  getConsent(
    purpose: string,
  ): Promise<Result<ConsentRecord | null, PrismError>>;
  getHealth(): Promise<Result<HealthScore, PrismError>>;
  /**
   * Persisted health-over-time points from index snapshots + optional git
   * backfill (M-046 / ADR-0023). Requires prior `index()` for forward points;
   * empty report when the cache has none.
   */
  getHealthHistory(options?: {
    since?: string;
    limit?: number;
  }): Promise<Result<HealthHistoryReport, PrismError>>;
  /**
   * Improving / regressing regions between the latest two (or first/last)
   * region snapshots in history.
   */
  getRegionMovers(): Promise<Result<RegionMoversReport, PrismError>>;
  /**
   * Start a background backfill that stamps current-index health at sampled
   * historical commit dates (v1 approximation — see ADR-0023).
   */
  startHealthHistoryBackfill(options?: {
    maxCommits?: number;
  }): Promise<Result<HealthHistoryBackfillStatus, PrismError>>;
  /** Current health-history backfill job status. */
  getHealthHistoryBackfillStatus(): Result<
    HealthHistoryBackfillStatus,
    PrismError
  >;
  /**
   * Engineering-health metrics (entropy, drift, debt, churn, conflict,
   * knowledge decay + hotspots). Complementary to `getHealth` (ADR-0017).
   * Requires prior `index()`. Git metrics fail soft when history is missing.
   */
  getEngineeringHealth(): Promise<Result<EngineeringHealthReport, PrismError>>;
  /**
   * Selection-scoped Code Explorer report (usages, ownership, related *,
   * similar, timeline). Requires prior `index()`. Git sections fail soft.
   */
  exploreCode(
    target: CodeExplorerTarget,
  ): Promise<Result<CodeExplorerReport, PrismError>>;
  /**
   * Shortest / k-simple dependency routes between files or symbols (M-016).
   * Requires `index()`. Empty routes when no path exists.
   */
  findRoute(query: FindRouteQuery): Result<NavigationRouteResult, PrismError>;
  /** Feature → feature routes via shared file dependencies (M-016). */
  navigateFeature(
    fromFeatureId: string,
    toFeatureId: string,
    options?: { maxAlternatives?: number; maxHops?: number },
  ): Result<NavigationRouteResult, PrismError>;
  /** Named entrypoints / package roots / feature anchors (M-016). */
  listLandmarks(): Result<Landmark[], PrismError>;
  /**
   * Repository Map model at a zoom level (M-017). Requires `index()`.
   */
  getRepositoryMap(
    options?: GetRepositoryMapOptions,
  ): Result<RepositoryMap, PrismError>;
  /**
   * Repo-wide local git activity (recent files/commits + summary) for
   * dashboards (M-042). Requires `index()`. `available: false` on non-git roots;
   * never touches the network.
   */
  getGitActivity(): Result<GitActivity, PrismError>;
  blastRadius(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
    /** Edit vs delete emphasis (default edit). */
    intent?: "edit" | "delete";
  }): Promise<Result<BlastRadiusReport, PrismError>>;
  /**
   * Whether a file/symbol can be deleted safely (M-021). Requires `index()`.
   * `blockers` list transitive dependents; `orphans` list files left dead.
   */
  safeDelete(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }): Promise<Result<SafeDeleteReport, PrismError>>;
  /**
   * Edit sites + breaking-change hints for renaming a file/symbol (M-021).
   * Requires `index()`. Report only — never writes.
   */
  renameImpact(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
    newName?: string;
  }): Promise<Result<RenameImpactReport, PrismError>>;
  /**
   * Test files transitively reachable from a change (M-021). Requires `index()`.
   */
  testImpact(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }): Promise<Result<TestImpactReport, PrismError>>;
  /**
   * Heuristic breaking-change hints for a change target (M-021).
   * Requires `index()`.
   */
  breakingChangeHints(input: {
    kind: "file" | "symbol";
    id: string;
    path?: string;
  }): Promise<Result<BreakingChangeHint[], PrismError>>;
  /**
   * Multi-path aggregate review (M-048 Phase 4): `blastRadius` + `testImpact`
   * + `breakingChangeHints` per path, rolled up into one report for SCM /
   * editor "Review Changes". Requires `index()`.
   */
  reviewChanges(
    input: ReviewChangesInput,
  ): Promise<Result<ChangeReviewReport, PrismError>>;
  /**
   * Deterministic module/folder summary (M-048 Phase 5): domain overlap from
   * DNA signals, dependency in/out degree, and local git ownership. Requires
   * `index()`.
   */
  explainArea(path: string): Promise<Result<ExplainAreaSummary, PrismError>>;
  /** Bookmarks persisted at `.prism/bookmarks.json` (M-048 Phase 6). */
  listBookmarks(): Promise<Result<MapBookmark[], PrismError>>;
  /** Upsert a bookmark (by `id` when set) and return the updated list. */
  saveBookmark(
    input: SaveBookmarkInput,
  ): Promise<Result<MapBookmark[], PrismError>>;
  /** Remove a bookmark by id and return the updated list. */
  removeBookmark(id: string): Promise<Result<MapBookmark[], PrismError>>;
  close(): void;
};

function toSummary(snapshot: IndexSnapshot): IndexSummary {
  return {
    repoId: snapshot.repoId,
    rootPath: snapshot.rootPath,
    indexedAt: snapshot.indexedAt,
    stats: snapshot.stats,
    warnings: [...snapshot.warnings],
  };
}

/**
 * Assemble the `@prism/impact` context from an index snapshot. Symbol-level
 * queries also need the knowledge graph (symbols + references). Soft index is
 * cached per snapshot identity and invalidated when the index refreshes.
 */
function impactContextFor(
  snapshot: IndexSnapshot,
  withSymbols: boolean,
  softCache: {
    key: string | null;
    value: ReturnType<typeof buildSoftImpactIndex> | null;
  },
  intent?: "edit" | "delete",
) {
  const analyzedPaths = snapshot.files
    .filter((f) => f.status === "analyzed")
    .map((f) => f.path);
  const inventoryPaths = snapshot.files.map((f) => f.path);
  const dependencyGraph = buildDependencyGraph(snapshot).graph;
  const softKey = `${snapshot.rootPath}\0${snapshot.indexedAt}\0${inventoryPaths.length}`;
  if (softCache.key !== softKey || !softCache.value) {
    softCache.key = softKey;
    softCache.value = buildSoftImpactIndex({
      workspaceRoot: snapshot.rootPath,
      filePaths: inventoryPaths,
    });
  }
  const soft = softCache.value;
  const softEdges = soft.edges;
  const base = {
    dependencyGraph,
    analyzedPaths,
    inventoryPaths,
    softEdges,
    ...(soft.truncated ? { softTruncated: true as const } : {}),
    ...(soft.coverageNote ? { coverageNote: soft.coverageNote } : {}),
    ...(intent ? { intent } : {}),
  };
  if (!withSymbols) return base;
  const kg = buildKnowledgeGraph(snapshot);
  return {
    ...base,
    symbols: kg.symbols,
    references: kg.references,
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
  let utilities: UtilitiesSession | null = null;
  let selectedPackageId: string | null = null;
  let gitCache: { at: string | null; value: GitSignals | null } | null = null;
  const softImpactCache: {
    key: string | null;
    value: ReturnType<typeof buildSoftImpactIndex> | null;
  } = { key: null, value: null };
  let backfillStatus: HealthHistoryBackfillStatus = {
    status: "idle",
    progress: 0,
    message: "Not started",
  };
  let backfillRunning = false;

  // —— Incremental watch (M-048 / ADR-0026) ——
  let watching = false;
  let watchStatus: IndexFreshness["status"] = "fresh";
  let pendingChanged = new Set<string>();
  let pendingDeleted = new Set<string>();
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  let watchDebounceMs = 1500;
  let watchOnChange: ((freshness: IndexFreshness) => void) | null = null;
  let watchRunning = false;

  const freshnessSnapshot = (): IndexFreshness => ({
    watching,
    status: watchStatus,
    lastIndexedAt,
    pendingDirtyCount: pendingChanged.size + pendingDeleted.size,
    dirtyPaths: [...pendingChanged, ...pendingDeleted].sort(),
  });

  const emitFreshness = (): void => {
    watchOnChange?.(freshnessSnapshot());
  };

  const flushWatch = async (): Promise<void> => {
    if (!open || !watching || watchRunning) return;
    const changed = [...pendingChanged];
    const deleted = [...pendingDeleted];
    pendingChanged.clear();
    pendingDeleted.clear();
    if (changed.length === 0 && deleted.length === 0) {
      watchStatus = lastIndexedAt ? "fresh" : "stale";
      emitFreshness();
      return;
    }
    watchRunning = true;
    watchStatus = "indexing";
    emitFreshness();
    try {
      await runIndex({
        changedPaths: changed,
        deletedPaths: deleted,
      });
      watchStatus =
        pendingChanged.size + pendingDeleted.size > 0 ? "stale" : "fresh";
    } finally {
      watchRunning = false;
      emitFreshness();
      if (pendingChanged.size + pendingDeleted.size > 0 && watching) {
        scheduleWatchFlush();
      }
    }
  };

  const scheduleWatchFlush = (): void => {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      void flushWatch();
    }, watchDebounceMs);
  };

  const bookmarksFilePath = (): string =>
    join(rootPath, ".prism", "bookmarks.json");

  const readBookmarkStore = async (): Promise<MapBookmarkStore> => {
    try {
      const raw = await readFile(bookmarksFilePath(), "utf8");
      const parsed = parseBookmarkStore(JSON.parse(raw));
      if (parsed.ok) return parsed.value;
    } catch {
      /* missing / unreadable / invalid file → empty store */
    }
    return emptyBookmarkStore();
  };

  const writeBookmarkStore = async (store: MapBookmarkStore): Promise<void> => {
    await mkdir(join(rootPath, ".prism"), { recursive: true });
    await writeFile(
      bookmarksFilePath(),
      `${JSON.stringify(store, null, 2)}\n`,
      "utf8",
    );
  };

  const ensureOpen = (): Result<true, PrismError> => {
    if (!open) {
      return err(
        prismError(PrismErrorCode.WORKSPACE_NOT_OPEN, "Workspace is closed"),
      );
    }
    return ok(true);
  };

  /** Open gate + an available index snapshot (for impact/change-safety APIs). */
  const ensureImpact = (): Result<IndexSnapshot, PrismError> => {
    if (!open) {
      return err(
        prismError(PrismErrorCode.WORKSPACE_NOT_OPEN, "Workspace is closed"),
      );
    }
    if (!lastSnapshot) {
      return err(
        prismError(
          PrismErrorCode.INDEX_REQUIRED,
          "No index snapshot yet — call workspace.index() first",
        ),
      );
    }
    return ok(lastSnapshot);
  };

  const ensureUtilities = (): Result<UtilitiesSession, PrismError> => {
    const gate = ensureOpen();
    if (!gate.ok) return gate;
    if (!utilities) {
      utilities = createUtilitiesSession({ workspaceRoot: rootPath });
    }
    return ok(utilities);
  };

  const ensureStack = (): Result<
    NonNullable<PrismEnginePorts["stack"]>,
    PrismError
  > => {
    const gate = ensureOpen();
    if (!gate.ok) return gate;
    if (!options.ports.stack) {
      return err(
        prismError(PrismErrorCode.UNSUPPORTED, "Stack detection is not wired"),
      );
    }
    return ok(options.ports.stack);
  };

  const loadWorkspaceRollup = async (): Promise<
    Result<StackProfile, PrismError>
  > => {
    const stack = ensureStack();
    if (!stack.ok) return stack;
    const rollup = await stack.value.detectWorkspaceProfile(rootPath);
    if (!rollup.ok) return rollup;
    return ok({
      ...rollup.value,
      packages: rollup.value.packages ?? [],
    });
  };

  const resolvePackageId = (explicit?: string | null): string | null => {
    if (explicit !== undefined) return explicit;
    return selectedPackageId;
  };

  const packageAsStackProfile = (entry: StackPackageProfile): StackProfile => ({
    ...entry.profile,
    packages: [],
  });

  const toPackageInfo = (entry: StackPackageProfile): WorkspacePackageInfo => ({
    id: entry.id,
    ...(entry.name === undefined ? {} : { name: entry.name }),
    rootDir: entry.rootDir,
    domains: entry.profile.domains,
    personas: entry.profile.personas,
  });

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
      softImpactCache.key = null;
      softImpactCache.value = null;
      if (!watching) watchStatus = "fresh";
      // Forward snapshot for Trends (ADR-0023) — fail soft on cache errors.
      try {
        const cache = await openIndexCache(rootPath);
        if (cache.ok) {
          const headSha = readHeadCommitSha(rootPath);
          const payload = buildHealthHistorySnapshot({
            snapshot: result.value,
            at: result.value.indexedAt,
            ...(headSha ? { commitSha: headSha } : {}),
          });
          appendHealthHistory(cache.value.db, rootPath, payload);
          cache.value.close();
        }
      } catch {
        /* history persistence is best-effort */
      }
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
    async intelligence() {
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
      const profile = await loadWorkspaceRollup();
      if (!profile.ok) return profile;
      const dna = assembleDnaReport({
        profile: profile.value,
        filePaths: lastSnapshot.files.map((f) => f.path),
      });
      return ok(
        assembleIntelligenceReport({
          snapshot: lastSnapshot,
          dna,
          capabilities: options.capabilities,
        }),
      );
    },
    analyze: runAnalyze,
    reindex: runAnalyze,
    startWatch(watchOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      watching = true;
      watchDebounceMs = watchOptions?.debounceMs ?? 1500;
      watchOnChange = watchOptions?.onChange ?? null;
      watchStatus =
        pendingChanged.size + pendingDeleted.size > 0
          ? "stale"
          : lastIndexedAt
            ? "fresh"
            : "stale";
      emitFreshness();
      return ok(undefined);
    },
    stopWatch() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      watching = false;
      if (watchTimer) {
        clearTimeout(watchTimer);
        watchTimer = null;
      }
      watchOnChange = null;
      emitFreshness();
      return ok(undefined);
    },
    notifyWatchPaths(input) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (!watching) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            "Watch is not started — call startWatch() first",
          ),
        );
      }
      for (const p of input.changedPaths ?? []) {
        const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
        if (norm) {
          pendingDeleted.delete(norm);
          pendingChanged.add(norm);
        }
      }
      for (const p of input.deletedPaths ?? []) {
        const norm = p.replace(/\\/g, "/").replace(/^\.\//, "");
        if (norm) {
          pendingChanged.delete(norm);
          pendingDeleted.add(norm);
        }
      }
      watchStatus = "stale";
      emitFreshness();
      scheduleWatchFlush();
      return ok(undefined);
    },
    getIndexFreshness() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return ok(freshnessSnapshot());
    },
    async getDna() {
      const profile = await loadWorkspaceRollup();
      if (!profile.ok) return profile;
      const filePaths = lastSnapshot?.files.map((f) => f.path);
      return ok(
        assembleDnaReport({
          profile: profile.value,
          ...(filePaths === undefined ? {} : { filePaths }),
        }),
      );
    },
    async getPersonaPresets() {
      const profile = await loadWorkspaceRollup();
      if (!profile.ok) return profile;
      const packageId = selectedPackageId;
      if (packageId === null) {
        return ok(buildPersonaPresets(profile.value));
      }
      const entry = (profile.value.packages ?? []).find(
        (p) => p.id === packageId,
      );
      if (!entry) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Unknown package id "${packageId}" — call listPackages() / selectPackage()`,
          ),
        );
      }
      return ok(buildPersonaPresets(packageAsStackProfile(entry)));
    },
    async getStackProfile(profileOptions) {
      const rollup = await loadWorkspaceRollup();
      if (!rollup.ok) return rollup;
      const packageId = resolvePackageId(profileOptions?.packageId);
      if (packageId === null) return rollup;
      const entry = (rollup.value.packages ?? []).find(
        (p) => p.id === packageId,
      );
      if (!entry) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Unknown package id "${packageId}"`,
          ),
        );
      }
      return ok(packageAsStackProfile(entry));
    },
    async listPackages() {
      const rollup = await loadWorkspaceRollup();
      if (!rollup.ok) return rollup;
      return ok((rollup.value.packages ?? []).map(toPackageInfo));
    },
    async selectPackage(packageId) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      if (packageId === null) {
        selectedPackageId = null;
        return ok(null);
      }
      const rollup = await loadWorkspaceRollup();
      if (!rollup.ok) return rollup;
      const exists = (rollup.value.packages ?? []).some(
        (p) => p.id === packageId,
      );
      if (!exists) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Unknown package id "${packageId}"`,
          ),
        );
      }
      selectedPackageId = packageId;
      return ok(packageId);
    },
    getSelectedPackage() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return ok(selectedPackageId);
    },
    async startUtilityJob(input) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      const packageId = input.packageId ?? selectedPackageId ?? undefined;
      return session.value.jobs.start({
        ...input,
        ...(packageId === undefined ? {} : { packageId }),
      });
    },
    getUtilityJob(jobId) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.jobs.get(jobId);
    },
    listUtilityJobs() {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.jobs.list();
    },
    async listIngestArtifacts(filter) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.ingest.list(filter);
    },
    async getIngestArtifact(id) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.ingest.get(id);
    },
    async getCwvReport(artifactId) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return loadCwvReport(session.value.ingest, artifactId);
    },
    discoverFrontendRoutes() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return ok(discoverFrontendAppRoutes(rootPath));
    },
    listUtilityOverlayKinds() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return ok(catalogUtilityOverlayKinds());
    },
    async getUtilityOverlay(kind, overlayOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const parsed = parseUtilityOverlayKind(kind);
      if (!parsed) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `Unknown utility overlay kind "${kind}"`,
          ),
        );
      }
      const info = catalogUtilityOverlayKinds().find((k) => k.kind === parsed);
      if (info?.requiresIndex && !lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            `Overlay "${parsed}" requires workspace.index() first`,
          ),
        );
      }

      const rollup = await loadWorkspaceRollup();
      if (!rollup.ok) return rollup;
      const packageId = resolvePackageId(overlayOptions?.packageId);
      let packageRootDir: string | undefined;
      if (packageId !== null) {
        const entry = (rollup.value.packages ?? []).find(
          (p) => p.id === packageId,
        );
        if (!entry) {
          return err(
            prismError(
              PrismErrorCode.VALIDATION,
              `Unknown package id "${packageId}"`,
            ),
          );
        }
        packageRootDir = entry.rootDir;
      }

      return ok(
        buildUtilityOverlay({
          workspaceRoot: rootPath,
          kind: parsed,
          stack: rollup.value,
          ...(packageId === null ? {} : { packageId }),
          ...(packageRootDir === undefined ? {} : { packageRootDir }),
          ...(lastSnapshot === null ? {} : { index: lastSnapshot }),
        }),
      );
    },
    async getBackendReport(overlayOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;

      const rollup = await loadWorkspaceRollup();
      if (!rollup.ok) return rollup;
      const packageId = resolvePackageId(overlayOptions?.packageId);
      let packageRootDir: string | undefined;
      if (packageId !== null) {
        const entry = (rollup.value.packages ?? []).find(
          (p) => p.id === packageId,
        );
        if (!entry) {
          return err(
            prismError(
              PrismErrorCode.VALIDATION,
              `Unknown package id "${packageId}"`,
            ),
          );
        }
        packageRootDir = entry.rootDir;
      }

      return ok(
        buildBackendReport({
          workspaceRoot: rootPath,
          ...(packageId === null ? {} : { packageId }),
          ...(packageRootDir === undefined ? {} : { packageRootDir }),
          ...(lastSnapshot === null ? {} : { index: lastSnapshot }),
        }),
      );
    },
    async getTestingReport() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const files = lastSnapshot?.files.map((f) => f.path);
      return ok(
        buildTestingReport({
          workspaceRoot: rootPath,
          ...(files === undefined ? {} : { files }),
        }),
      );
    },
    async getSecurityReport() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const files = lastSnapshot?.files.map((f) => f.path);
      let hasBackendDomain = false;
      const profile = await loadWorkspaceRollup();
      if (profile.ok) {
        hasBackendDomain = profile.value.domains?.includes("backend") === true;
      }
      return ok(
        buildSecurityReport({
          workspaceRoot: rootPath,
          ...(files === undefined ? {} : { files }),
          hasBackendDomain,
        }),
      );
    },
    async ingestCoverageFromWorkspace() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const files = lastSnapshot?.files.map((f) => f.path);
      return ok(
        ingestCoverageFromWorkspace(
          rootPath,
          files === undefined ? undefined : files,
        ),
      );
    },
    async setConsent(purpose, granted) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.consent.set(purpose, granted);
    },
    async getConsent(purpose) {
      const session = ensureUtilities();
      if (!session.ok) return session;
      return session.value.consent.get(purpose);
    },
    async getHealth() {
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
      const testing = buildTestingReport({
        workspaceRoot: rootPath,
        files: lastSnapshot.files.map((f) => f.path),
      });
      return ok(computeHealthScore(lastSnapshot, { testingReport: testing }));
    },
    async getHealthHistory(historyOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const cache = await openIndexCache(rootPath);
      if (!cache.ok) return cache;
      try {
        const rows = listHealthHistory(cache.value.db, rootPath, {
          ...(historyOptions?.since === undefined
            ? {}
            : { since: historyOptions.since }),
          ...(historyOptions?.limit === undefined
            ? {}
            : { limit: historyOptions.limit }),
        });
        return ok({
          points: rows.map((r) => r.health),
        } satisfies HealthHistoryReport);
      } finally {
        cache.value.close();
      }
    },
    async getRegionMovers() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const cache = await openIndexCache(rootPath);
      if (!cache.ok) return cache;
      try {
        const rows = listHealthHistory(cache.value.db, rootPath);
        const regionPoints = rows.map((r) => r.regions);
        const window = pickRegionMoverWindow(regionPoints);
        if (!window) {
          return ok({
            improving: [],
            regressing: [],
          } satisfies RegionMoversReport);
        }
        return ok(computeRegionMovers(window.from, window.to));
      } finally {
        cache.value.close();
      }
    },
    async startHealthHistoryBackfill(backfillOptions) {
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
      if (backfillRunning || backfillStatus.status === "running") {
        return ok(backfillStatus);
      }

      const snapshot = lastSnapshot;
      const maxCommits =
        backfillOptions?.maxCommits ?? HEALTH_HISTORY_BACKFILL_DEFAULT_COMMITS;

      backfillRunning = true;
      backfillStatus = {
        status: "running",
        progress: 0,
        message: "History sync in progress",
      };

      void (async () => {
        try {
          const commits = sampleGitCommits(rootPath, { maxCommits });
          if (commits.length === 0) {
            backfillStatus = {
              status: "done",
              progress: 1,
              message: "No git history to backfill",
            };
            return;
          }

          const cache = await openIndexCache(rootPath);
          if (!cache.ok) {
            backfillStatus = {
              status: "error",
              progress: 0,
              message: cache.error.message,
            };
            return;
          }

          try {
            let written = 0;
            for (let i = 0; i < commits.length; i++) {
              const commit = commits[i]!;
              if (hasHealthHistorySha(cache.value.db, rootPath, commit.sha)) {
                backfillStatus = {
                  status: "running",
                  progress: (i + 1) / commits.length,
                  message: `Skipping existing ${commit.sha.slice(0, 7)}`,
                };
                continue;
              }
              // v1: stamp current-index health at historical commit metadata.
              const payload = buildHealthHistorySnapshot({
                snapshot,
                at: commit.at,
                commitSha: commit.sha,
              });
              if (appendHealthHistory(cache.value.db, rootPath, payload)) {
                written += 1;
              }
              backfillStatus = {
                status: "running",
                progress: (i + 1) / commits.length,
                message: `Synced ${i + 1}/${commits.length} commits`,
              };
            }
            backfillStatus = {
              status: "done",
              progress: 1,
              message:
                written > 0
                  ? `Backfilled ${written} approximate history points`
                  : "History already up to date",
            };
          } finally {
            cache.value.close();
          }
        } catch (cause) {
          backfillStatus = {
            status: "error",
            progress: backfillStatus.progress,
            message: cause instanceof Error ? cause.message : String(cause),
          };
        } finally {
          backfillRunning = false;
        }
      })();

      return ok(backfillStatus);
    },
    getHealthHistoryBackfillStatus() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      return ok(backfillStatus);
    },
    async getEngineeringHealth() {
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
      if (!gitCache || gitCache.at !== lastIndexedAt) {
        const keepPaths = new Set(lastSnapshot.files.map((f) => f.path));
        gitCache = {
          at: lastIndexedAt,
          value: readGitSignals(lastSnapshot.rootPath, { keepPaths }),
        };
      }
      const git = gitCache.value;
      const gitFiles = git ? [...git.signals.values()] : undefined;
      return ok(
        computeEngineeringHealth({
          snapshot: lastSnapshot,
          ...(gitFiles && gitFiles.length > 0 ? { gitFiles } : {}),
        }),
      );
    },
    async exploreCode(target) {
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
      const parsed = CodeExplorerTargetSchema.safeParse(target);
      if (!parsed.success) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            parsed.error.issues.map((i) => i.message).join("; ") ||
              "Invalid exploreCode target",
          ),
        );
      }
      if (!gitCache || gitCache.at !== lastIndexedAt) {
        const keepPaths = new Set(lastSnapshot.files.map((f) => f.path));
        gitCache = {
          at: lastIndexedAt,
          value: readGitSignals(lastSnapshot.rootPath, { keepPaths }),
        };
      }
      const git = gitCache.value;
      const gitFiles = git ? [...git.signals.values()] : undefined;
      const backend = buildBackendReport({
        workspaceRoot: rootPath,
        index: lastSnapshot,
      });
      const report = buildCodeExplorerReport({
        snapshot: lastSnapshot,
        target: parsed.data,
        endpoints: backend.endpoints,
        ...(gitFiles && gitFiles.length > 0 ? { gitFiles } : {}),
      });
      if (!report) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            "Unknown exploreCode target — file or symbol not found in index",
          ),
        );
      }
      return ok(report);
    },
    findRoute(query) {
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
      const fromId = resolveEndpointNodeId(lastSnapshot, query.from);
      const toId = resolveEndpointNodeId(lastSnapshot, query.to);
      if (!fromId || !toId) {
        return ok({ routes: [], empty: true });
      }
      const dep = buildDependencyGraph(lastSnapshot);
      return ok(
        findPaths(dep.graph, fromId, toId, {
          ...(query.maxAlternatives === undefined
            ? {}
            : { maxAlternatives: query.maxAlternatives }),
          ...(query.maxHops === undefined ? {} : { maxHops: query.maxHops }),
          kind: "dependency",
        }),
      );
    },
    navigateFeature(fromFeatureId, toFeatureId, options) {
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
      const dep = buildDependencyGraph(lastSnapshot);
      const features = buildFeatureGraph(lastSnapshot).features;
      return ok(
        routeBetweenFeatures(
          dep.graph,
          features,
          fromFeatureId,
          toFeatureId,
          options,
        ),
      );
    },
    listLandmarks() {
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
      const features = buildFeatureGraph(lastSnapshot).features;
      return ok(collectLandmarks(lastSnapshot, features));
    },
    getRepositoryMap(mapOptions) {
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
      const dep = buildDependencyGraph(lastSnapshot);
      const features = buildFeatureGraph(lastSnapshot).features;
      const landmarks = collectLandmarks(lastSnapshot, features);
      const packages: MapPackageInfo[] = discoverLocalPackages(
        lastSnapshot.rootPath,
        lastSnapshot.files.map((f) => f.path),
      ).map((p) => ({ name: p.name, rootDir: p.rootDir }));
      if (!gitCache || gitCache.at !== lastIndexedAt) {
        const keepPaths = new Set(
          lastSnapshot.files
            .filter((f) => f.status === "analyzed")
            .map((f) => f.path),
        );
        gitCache = {
          at: lastIndexedAt,
          value: readGitSignals(lastSnapshot.rootPath, { keepPaths }),
        };
      }
      const git = gitCache.value;
      return ok(
        buildRepositoryMap({
          snapshot: lastSnapshot,
          dependencyGraph: dep.graph,
          features,
          landmarks,
          packages,
          ...(git === null
            ? {}
            : { gitSignals: git.signals, gitSummary: git.summary }),
          ...(mapOptions?.zoom === undefined ? {} : { zoom: mapOptions.zoom }),
          ...(mapOptions?.layers === undefined
            ? {}
            : { layers: mapOptions.layers }),
          ...(mapOptions?.bookmarks === undefined
            ? {}
            : { bookmarks: mapOptions.bookmarks }),
        }),
      );
    },
    getGitActivity() {
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
      if (!gitCache || gitCache.at !== lastIndexedAt) {
        const keepPaths = new Set(
          lastSnapshot.files
            .filter((f) => f.status === "analyzed")
            .map((f) => f.path),
        );
        gitCache = {
          at: lastIndexedAt,
          value: readGitSignals(lastSnapshot.rootPath, { keepPaths }),
        };
      }
      const git = gitCache.value;
      const generatedAt = new Date().toISOString();
      if (git === null) {
        return ok({
          root: lastSnapshot.rootPath,
          generatedAt,
          available: false,
          recentFiles: [],
          recentCommits: [],
          authors: [],
          weeks: [],
          days: [],
        });
      }
      const byDateDesc = (a: string, b: string): number =>
        a < b ? 1 : a > b ? -1 : 0;
      const recentFiles = [...git.signals.values()]
        .sort((a, b) => byDateDesc(a.lastCommit.date, b.lastCommit.date))
        .slice(0, 20)
        .map((s) => ({
          path: s.path,
          lastCommit: s.lastCommit,
          commits: s.commits,
          additions: s.lastAdditions,
          deletions: s.lastDeletions,
        }));
      const bySha = new Map<string, GitCommitRef>();
      let weeks: number[] = [];
      for (const s of git.signals.values()) {
        bySha.set(s.lastCommit.sha, s.lastCommit);
        for (const c of s.recent) bySha.set(c.sha, c);
        if (weeks.length === 0) weeks = s.weeks.map(() => 0);
        for (let i = 0; i < s.weeks.length && i < weeks.length; i += 1) {
          weeks[i] = (weeks[i] ?? 0) + (s.weeks[i] ?? 0);
        }
      }
      const unpushed = git.unpushedShas;
      const recentCommits = [...bySha.values()]
        .sort((a, b) => byDateDesc(a.date, b.date))
        .slice(0, 40)
        .map((c) => (unpushed ? { ...c, pushed: !unpushed.has(c.sha) } : c));
      return ok({
        root: lastSnapshot.rootPath,
        generatedAt,
        available: true,
        summary: git.summary,
        recentFiles,
        recentCommits,
        authors: git.authors,
        weeks,
        days: git.days,
      });
    },
    async blastRadius(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      return computeBlastRadius(
        input,
        impactContextFor(
          gate.value,
          input.kind === "symbol",
          softImpactCache,
          input.intent,
        ),
      );
    },
    async safeDelete(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      return computeSafeDelete(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async renameImpact(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      return computeRenameImpact(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async testImpact(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      return computeTestImpact(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async breakingChangeHints(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      return computeBreakingChangeHints(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async reviewChanges(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      const context = impactContextFor(gate.value, false, softImpactCache);
      const paths = [
        ...new Set(
          input.paths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, "")),
        ),
      ];
      const items: ChangeReviewItem[] = [];
      for (const path of paths) {
        const origin = { kind: "file" as const, id: path, path };
        const blast = computeBlastRadius(origin, context);
        if (!blast.ok) return blast;
        const testImpact = computeTestImpact(origin, context);
        if (!testImpact.ok) return testImpact;
        const hints = computeBreakingChangeHints(origin, context);
        if (!hints.ok) return hints;
        items.push({
          path: blast.value.origin.path ?? path,
          risk: blast.value.risk,
          affectedFilesCount: blast.value.affectedFiles.length,
          ...(blast.value.hardAffectedCount !== undefined
            ? { hardAffectedCount: blast.value.hardAffectedCount }
            : {}),
          ...(blast.value.softAffectedCount !== undefined
            ? { softAffectedCount: blast.value.softAffectedCount }
            : {}),
          testsLikelyAffected: testImpact.value.tests.map((t) => t.path),
          breakingChanges: hints.value,
        });
      }
      const overallRisk = items.reduce((max, i) => Math.max(max, i.risk), 0);
      const totalAffectedFiles = items.reduce(
        (sum, i) => sum + i.affectedFilesCount,
        0,
      );
      const totalTestsAffected = new Set(
        items.flatMap((i) => i.testsLikelyAffected),
      ).size;
      const totalBreakingChanges = items.reduce(
        (sum, i) => sum + i.breakingChanges.length,
        0,
      );
      return ok({
        generatedAt: new Date().toISOString(),
        ...(input.base === undefined ? {} : { base: input.base }),
        items,
        overallRisk,
        totalAffectedFiles,
        totalTestsAffected,
        totalBreakingChanges,
      } satisfies ChangeReviewReport);
    },
    async explainArea(path) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      const snapshot = gate.value;
      const norm = path.replace(/\\/g, "/").replace(/^\.\//, "");

      const dep = buildDependencyGraph(snapshot).graph;
      const nodeId = `file:${norm}`;
      const inDeg = dep.edges.filter((e) => e.to === nodeId).length;
      const outDeg = dep.edges.filter((e) => e.from === nodeId).length;

      const rollup = await loadWorkspaceRollup();
      const dna = rollup.ok
        ? assembleDnaReport({
            profile: rollup.value,
            filePaths: snapshot.files.map((f) => f.path),
          })
        : null;
      const domains = matchDomainsForPath(
        norm,
        dna?.rankedDomains.map((d) => d.id) ?? [],
      );

      if (!gitCache || gitCache.at !== lastIndexedAt) {
        const keepPaths = new Set(snapshot.files.map((f) => f.path));
        gitCache = {
          at: lastIndexedAt,
          value: readGitSignals(snapshot.rootPath, { keepPaths }),
        };
      }
      const fileSignal = gitCache.value?.signals.get(norm);
      const owners = fileSignal
        ? fileSignal.contributors.slice(0, 3).map((c) => c.author)
        : [];

      const role = classifyFileRole(norm);

      const summary = [
        domains.length > 0
          ? `Likely ${domains.join("/")} area`
          : "Domain not confidently classified",
        `file role: ${fileRoleLabel(role)}`,
        `${inDeg} incoming and ${outDeg} outgoing dependency edge(s)`,
        owners.length > 0
          ? `top contributor(s): ${owners.join(", ")}`
          : "no local git ownership signal",
      ].join(" · ");

      return ok({
        path: norm,
        domains,
        dependencyDegree: { in: inDeg, out: outDeg },
        owners,
        summary,
        fileRole: role,
      } satisfies ExplainAreaSummary);
    },
    async listBookmarks() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const store = await readBookmarkStore();
      return ok(sortBookmarks(store.bookmarks));
    },
    async saveBookmark(input) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const store = await readBookmarkStore();
      const id =
        input.id ??
        `bookmark:${input.nodeId ?? input.path ?? "note"}:${Date.now()}`;
      const next: MapBookmark = {
        id,
        label: input.label,
        createdAt: input.createdAt ?? new Date().toISOString(),
        ...(input.path === undefined ? {} : { path: input.path }),
        ...(input.nodeId === undefined ? {} : { nodeId: input.nodeId }),
        ...(input.zoom === undefined ? {} : { zoom: input.zoom }),
        ...(input.note === undefined ? {} : { note: input.note }),
      };
      const bookmarks = sortBookmarks([
        ...store.bookmarks.filter((b) => b.id !== id),
        next,
      ]);
      await writeBookmarkStore({ version: 1, bookmarks });
      return ok(bookmarks);
    },
    async removeBookmark(id) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const store = await readBookmarkStore();
      const bookmarks = sortBookmarks(
        store.bookmarks.filter((b) => b.id !== id),
      );
      await writeBookmarkStore({ version: 1, bookmarks });
      return ok(bookmarks);
    },
    close() {
      watching = false;
      if (watchTimer) {
        clearTimeout(watchTimer);
        watchTimer = null;
      }
      watchOnChange = null;
      open = false;
    },
  };
}

/** Re-export for tests that assert progress typing. */
export type { IndexProgressEvent };
