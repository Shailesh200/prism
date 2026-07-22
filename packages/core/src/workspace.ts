import {
  assembleDnaReport,
  assembleIntelligenceReport,
  buildDependencyGraph,
  buildFeatureGraph,
  buildKnowledgeGraph,
  buildPersonaPresets,
  buildUtilityOverlay,
  computeHealthScore,
  createUtilitiesSession,
  discoverLocalPackages,
  findReferences as queryReferences,
  findSymbol as querySymbols,
  getCwvReport as loadCwvReport,
  listUtilityOverlayKinds as catalogUtilityOverlayKinds,
  parseUtilityOverlayKind,
  type DependencyGraphOptions,
  type FindReferencesQuery,
  type FindSymbolQuery,
  type ReferenceHit,
  type StartUtilityJobInput,
  type SymbolHit,
  type UtilitiesSession,
} from "@prism/intelligence";
import {
  findPaths,
  listLandmarks as collectLandmarks,
  navigateFeature as routeBetweenFeatures,
  resolveEndpointNodeId,
  type RouteEndpoint,
} from "@prism/navigation";
import { buildRepositoryMap, type MapPackageInfo } from "@prism/repository-map";
import {
  PrismErrorCode,
  type BlastRadiusReport,
  type ConsentRecord,
  type CwvReport,
  type DnaReport,
  type FeatureInfo,
  type GitActivity,
  type GitCommitRef,
  type GraphSnapshotDto,
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
  type MapZoomLevel,
  type NavigationRouteResult,
  type PersonaPresets,
  type PrismError,
  type RepoId,
  type RepositoryMap,
  type Result,
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
import type { PrismCapabilities } from "./capabilities.js";
import { readGitSignals, type GitSignals } from "./git/git-signals.js";
import type { IndexWorkspaceOptions, PrismEnginePorts } from "./ports.js";

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
  /** Catalog of Map/MCP utility overlay kinds (M-041 P2–P7 / Mono-v2). */
  listUtilityOverlayKinds(): Result<UtilityOverlayKindInfo[], PrismError>;
  /**
   * Build a domain utility overlay for Map layers (local FS / index heuristics).
   */
  getUtilityOverlay(
    kind: string,
    options?: GetUtilityOverlayOptions,
  ): Promise<Result<UtilityOverlayReport, PrismError>>;
  setConsent(
    purpose: string,
    granted: boolean,
  ): Promise<Result<ConsentRecord, PrismError>>;
  getConsent(
    purpose: string,
  ): Promise<Result<ConsentRecord | null, PrismError>>;
  getHealth(): Promise<Result<HealthScore, PrismError>>;
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
  let utilities: UtilitiesSession | null = null;
  let selectedPackageId: string | null = null;
  let gitCache: { at: string | null; value: GitSignals | null } | null = null;

  const ensureOpen = (): Result<true, PrismError> => {
    if (!open) {
      return err(
        prismError(PrismErrorCode.WORKSPACE_NOT_OPEN, "Workspace is closed"),
      );
    }
    return ok(true);
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
      return ok(computeHealthScore(lastSnapshot));
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
      const recentCommits = [...bySha.values()]
        .sort((a, b) => byDateDesc(a.date, b.date))
        .slice(0, 15);
      return ok({
        root: lastSnapshot.rootPath,
        generatedAt,
        available: true,
        summary: git.summary,
        recentFiles,
        recentCommits,
        weeks,
        days: git.days,
      });
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
