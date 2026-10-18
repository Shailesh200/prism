import {
  assembleDnaReport,
  buildDependencyGraph,
  cachedKnowledgeGraph,
  buildCodeExplorerReport,
  buildSoftImpactIndex,
  findReferences as queryReferences,
  findSymbol as querySymbols,
  searchSymbols as querySearchSymbols,
  buildPrepareChange,
  listFindings as queryFindings,
  findingStillOpen,
  checkGuardSession,
  publishesToJsr,
  type DependencyGraphOptions,
  type FindReferencesQuery,
  type FindReferencesResult,
  type FindSymbolQuery,
  type SearchSymbolsQuery,
  type SymbolHit,
  type SymbolSearchResult,
  computeEntryPoints,
  isOrphanEligibleSource,
  packageRootOf,
  type EntryPoints,
} from "@repo-prism/intelligence";
import { DEFAULT_MAX_FILE_BYTES } from "@repo-prism/indexer";
import {
  computeBlastRadius,
  computeBreakingChangeHints,
  computeRenameImpact,
  computeSafeDelete,
  computeTestImpact,
  detectTestRunner,
  testRunPlan,
  typecheckPlan,
  type PackageManager,
  type PackageManifest,
  type TestPackage,
  type TypecheckRun,
} from "@repo-prism/impact";
import {
  findPaths,
  listLandmarks as collectLandmarks,
  resolveEndpointNodeId,
  type RouteEndpoint,
} from "@repo-prism/navigation";
import {
  PrismErrorCode,
  partialIndexOf,
  partialIndexWarning,
  findingsFromGuardFiles,
  languageGate,
  CodeExplorerTargetSchema,
  classifyFileRole,
  fileRoleLabel,
  isTestPath,
  type AgentsMdCheckResult,
  type AgentsMdGenerateResult,
  type BlastRadiusReport,
  type ChangeReviewItem,
  type ChangeReviewReport,
  type CodeExplorerReport,
  type CodeExplorerTarget,
  type DnaReport,
  type ExplainAreaSummary,
  type GitActivity,
  type GitCommitRef,
  type PrepareChange,
  type FindingRef,
  type GuardSession,
  type DependencyGraphDto,
  type GraphSnapshotDto,
  type IndexProgressEvent,
  type IndexSnapshot,
  type IndexSummary,
  type KnowledgeGraphStats,
  type Landmark,
  FindingMuteStoreSchema,
  type FindingMuteStore,
  type NavigationRouteResult,
  type PrismConfig,
  mergeIndexLimits,
  type PrismError,
  type RenameImpactReport,
  type RepoId,
  type Result,
  type SafeDeleteReport,
  type TestImpactReport,
  type TestRun,
  type StackPackageProfile,
  type StackProfile,
  err,
  ok,
  prismError,
  buildCodeReading,
  judgeOperational,
  isOperationalPath,
  selectReviewPaths,
  REVIEW_LARGE_DIFF,
  riskToBand,
  unsafeRepoId,
  type GraphAnswer,
  type GraphQuery,
} from "@repo-prism/shared";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join as joinPath } from "node:path";
import type { PrismCapabilities } from "./capabilities.js";
import {
  exportWorkspaceGraph,
  type GraphExportResult,
} from "./graph-export.js";
import { runGraphQuery } from "./graph-query.js";
import { buildCachedRepoMap, type RepoMapResult } from "./repo-map.js";
import { buildAgentsMdContent, parseAgentsMdClaims } from "./agents-md.js";
import {
  agentsMdPath,
  ensureWorkspacePrismSync,
  workspaceFindingMutesPath,
  workspacePrismDir,
  loadWorkspaceMemories,
} from "./prism-home.js";
import { loadPrismConfigSync } from "./prism-config-load.js";
import { readChangedPaths, type ChangedPaths } from "./git/changed-paths.js";
import {
  addPrismToGitignore,
  checkPrismGitignore,
  type PrismGitignoreStatus,
} from "./git/prism-gitignore.js";
import { readGitHead } from "@repo-prism/shared/git-head";
import {
  readGitSignals,
  readGitSignalsAsync,
  type GitSignals,
} from "./git/git-signals.js";
import type { CoChangePartner } from "./git/co-change.js";
import type { IndexWorkspaceOptions, PrismEnginePorts } from "./ports.js";
import { feedbackScores } from "@repo-prism/shared/feedback-store";

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

export type KnowledgeGraphView = {
  readonly graph: GraphSnapshotDto;
  readonly stats: KnowledgeGraphStats;
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
  /**
   * Message from the most recent failed reindex, cleared on the next success.
   * Present means the index is knowingly behind disk (M-051 Phase 1).
   */
  readonly lastError?: string;
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

/** Multi-path change review input (M-048 Phase 4). */
export type ReviewChangesInput = {
  readonly paths: readonly string[];
  /** Diff base label to stamp on the report (display only). */
  readonly base?: string;
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
  ): Result<DependencyGraphDto, PrismError>;
  /** Import/re-export cycles from the last index. `INDEX_REQUIRED` if none. */
  getCycles(options?: DependencyGraphOptions): Result<string[][], PrismError>;
  /**
   * Symbol-centric knowledge graph + stats from the last index.
   * `INDEX_REQUIRED` if none.
   */
  getKnowledgeGraph(): Result<KnowledgeGraphView, PrismError>;
  /** Find indexed symbols by name (optional path/kind filters). */
  findSymbol(query: FindSymbolQuery): Result<SymbolHit[], PrismError>;
  /**
   * Substring or regex search over indexed symbol names (M-058 / P-C10).
   * Hard-capped at 50 hits; `totalCount` is the match count before the slice.
   */
  searchSymbols(
    query: SearchSymbolsQuery,
  ): Result<SymbolSearchResult, PrismError>;
  /**
   * Pack + reuse + House Style for a change (M-070). Never includes file bodies.
   * `notes` carry matching memories and `rationale_for` hits (M-075).
   * `order` is the work order (M-076). `workingSet` stays null.
   */
  prepareChange(input: {
    readonly task: string;
    readonly budget?: number;
  }): Promise<Result<PrepareChange, PrismError>>;
  /** Queueable findings from the last index (M-071 L1). */
  listFindings(): Result<{ findings: readonly FindingRef[] }, PrismError>;
  /**
   * Re-index and re-run the originating report (M-071 L3): `resolved: false`
   * when the fingerprint is still present, `true` once it is gone. Never
   * infers resolution from a job's status alone.
   */
  resolveFinding(input: {
    readonly fingerprint: string;
  }): Promise<Result<{ resolved: boolean }, PrismError>>;
  /**
   * Fingerprints of findings the user has muted (M-074 B1), persisted at
   * `.prism/finding-mutes.json` — gitignored, never committed.
   */
  listMutedFindings(): Promise<Result<readonly string[], PrismError>>;
  /** Mute a finding by fingerprint; idempotent. Returns the updated list. */
  muteFinding(
    fingerprint: string,
  ): Promise<Result<readonly string[], PrismError>>;
  /** Unmute a finding by fingerprint; idempotent. Returns the updated list. */
  unmuteFinding(
    fingerprint: string,
  ): Promise<Result<readonly string[], PrismError>>;
  /**
   * Find resolved references to a symbol. When multiple same-named symbols
   * match and `path`/`start` are omitted, returns `{ ambiguous: true, candidates }`
   * with empty `references` (M-059 / P-A3).
   */
  findReferences(
    query: FindReferencesQuery,
  ): Result<FindReferencesResult, PrismError>;
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
  /** Named entrypoints, package roots and config markers (M-016). */
  listLandmarks(): Result<Landmark[], PrismError>;
  /**
   * Repo-wide local git activity (recent files/commits + summary) for
   * dashboards (M-042). Requires `index()`. `available: false` on non-git roots;
   * never touches the network.
   */
  getGitActivity(): Result<GitActivity, PrismError>;
  /**
   * Files changed in the working tree, or against `base` when given (M-029).
   * The input side of {@link reviewChanges} for surfaces without an SCM view.
   *
   * Fails with `UNSUPPORTED` rather than returning an empty list when git is
   * unavailable: "I cannot tell what changed" and "nothing changed" must not
   * look the same to a caller about to act on the answer.
   */
  getChangedPaths(options?: {
    base?: string;
  }): Result<ChangedPaths, PrismError>;
  /**
   * Whether `.prism` is excluded from git. Surfaces show a warning when it is
   * not, since the cache and consent record would otherwise be committed.
   */
  getPrismGitignoreStatus(): Promise<PrismGitignoreStatus>;
  /** Add `.prism/` to the workspace `.gitignore`. A write, so never implicit. */
  addPrismToGitignore(): Promise<PrismGitignoreStatus>;
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
   * Ready commands that would check a change (plan P10/P11): the runs for
   * these test files, grouped by the package that runs them, and the
   * cheapest type-check for `typecheck` files. Never executed. Requires
   * `index()`.
   */
  checkRunPlan(input: {
    readonly tests: readonly string[];
    readonly typecheck: readonly string[];
  }): Result<
    {
      readonly runs: readonly TestRun[];
      readonly typecheck: readonly TypecheckRun[];
      readonly packageManager: PackageManager;
    },
    PrismError
  >;
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
  /**
   * One bounded structural question (M-096): `find`, `neighbors`, `path`,
   * `explain` or `query`. Every edge carries provenance; the answer fits
   * `budget` tokens (default 1,500) and says when it was cut.
   */
  repoMap(opts?: {
    readonly scope?: string;
    readonly maxTokens?: number;
    readonly refresh?: boolean;
  }): Result<RepoMapResult, PrismError>;
  graph(
    query: GraphQuery,
    budget?: number,
  ): Promise<Result<GraphAnswer, PrismError>>;
  /**
   * The whole graph as versioned `graph.json` data, plus the measured facts
   * for the graph export (M-096). Requires `index()`.
   */
  exportGraph(): Promise<Result<GraphExportResult, PrismError>>;
  /**
   * Prism Guard (M-072): the current session — working-tree dirty files
   * minus `preExistingChanges` (ADR-0045 §3 / ADR-0055 G1) — ranked by blast
   * risk, each flagged for a likely duplicate, an orphaned new file, or a
   * package/domain boundary crossing. `paths` narrows the session to those
   * files or folders. Requires `index()`.
   */
  guardSession(input?: {
    readonly preExistingChanges?: readonly string[];
    readonly paths?: readonly string[];
  }): Promise<Result<GuardSession, PrismError>>;
  /**
   * Living AGENTS.md (M-073 C1/C3): composes features, import cycles, test
   * locations, and git ownership into deterministic markdown and writes it
   * to `~/.prism/workspaces/<key>/agents.md` — never into this repo.
   * Requires `index()`.
   */
  generateAgentsMd(): Promise<Result<AgentsMdGenerateResult, PrismError>>;
  /**
   * Re-verifies the claims embedded in the last `generateAgentsMd()` output
   * against a fresh `getCycles()` read (M-073 C2).
   * Fails (`ok: false`, non-empty `issues`) on drift; errors only when no
   * AGENTS.md has been generated yet or the claims block is unparsable.
   */
  checkAgentsMd(): Promise<Result<AgentsMdCheckResult, PrismError>>;
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
 * Package roots imported by app source (plan §4.1): the DNA only names a JS
 * framework when app code imports it. Tests, benchmarks, examples, demos,
 * fixtures and docs are not app code (hono's JSX benchmark imports React;
 * hono is not a React project).
 */
const NON_APP_SEGMENT =
  /(?:^|\/)(?:benchmarks?|bench|examples?|demos?|fixtures?|__fixtures__|docs?|stories|e2e|playground)\//i;

function importedPackageRoots(snapshot: IndexSnapshot): Set<string> {
  const out = new Set<string>();
  for (const f of snapshot.files) {
    if (f.status !== "analyzed" || isTestPath(f.path)) continue;
    if (NON_APP_SEGMENT.test(f.path)) continue;
    for (const imp of f.imports ?? []) {
      const root = packageRootOf(imp.source);
      if (root) out.add(root);
    }
  }
  return out;
}

/** Entry points per snapshot identity (plan §4.4); recomputed on re-index. */
const entryPointsCache = new WeakMap<IndexSnapshot, EntryPoints>();

function entryPointsFor(snapshot: IndexSnapshot): EntryPoints {
  const cached = entryPointsCache.get(snapshot);
  if (cached) return cached;
  const value = computeEntryPoints({
    workspaceRoot: snapshot.rootPath,
    inventoryPaths: snapshot.files.map((f) => f.path),
    analyzedPaths: snapshot.files
      .filter((f) => f.status === "analyzed")
      .map((f) => f.path),
  });
  entryPointsCache.set(snapshot, value);
  return value;
}

function readManifest(path: string): PackageManifest | undefined {
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    // A torn package.json is an answer ("no runner here"), not a failure.
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
  return typeof manifest === "object" && manifest !== null
    ? (manifest as PackageManifest)
    : undefined;
}

const testPackagesCache = new WeakMap<IndexSnapshot, readonly TestPackage[]>();

/**
 * Every indexed package.json as a place tests can run from (plan P10): its
 * directory, runner and whether it has a `test` script.
 */
function workspaceTestPackages(
  snapshot: IndexSnapshot,
): readonly TestPackage[] {
  const cached = testPackagesCache.get(snapshot);
  if (cached) return cached;
  const packages: TestPackage[] = [];
  for (const file of snapshot.files) {
    if (file.path !== "package.json" && !file.path.endsWith("/package.json"))
      continue;
    const manifest = readManifest(joinPath(snapshot.rootPath, file.path));
    if (!manifest) continue;
    const runner = detectTestRunner(manifest);
    packages.push({
      dir:
        file.path === "package.json"
          ? ""
          : file.path.slice(0, -"/package.json".length),
      ...(runner ? { runner } : {}),
      hasTestScript: typeof manifest.scripts?.test === "string",
      hasTypecheckScript: typeof manifest.scripts?.typecheck === "string",
      hasTsconfig: existsSync(
        joinPath(snapshot.rootPath, dirname(file.path), "tsconfig.json"),
      ),
    });
  }
  testPackagesCache.set(snapshot, packages);
  return packages;
}

/** The repository's package manager, from the lockfile at its root (npm when none). */
function workspacePackageManager(rootPath: string): PackageManager {
  if (
    existsSync(joinPath(rootPath, "bun.lock")) ||
    existsSync(joinPath(rootPath, "bun.lockb"))
  )
    return "bun";
  if (existsSync(joinPath(rootPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(joinPath(rootPath, "yarn.lock"))) return "yarn";
  return "npm";
}

/**
 * Assemble the `@repo-prism/impact` context from an index snapshot. Symbol-level
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
  // Export names per analyzed file: lets blast forward only real names
  // through `export *` barrels and importers (plan §4.2 symbol-level blast).
  const fileExports = new Map<string, readonly string[]>();
  for (const f of snapshot.files) {
    if (f.status !== "analyzed" || !f.exports) continue;
    fileExports.set(
      f.path,
      f.exports.map((e) => e.name),
    );
  }
  const dependencyGraph = buildDependencyGraph(snapshot).graph;
  const testPackages = workspaceTestPackages(snapshot);
  const packageManager = workspacePackageManager(snapshot.rootPath);
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
    fileExports,
    testPackages,
    packageManager,
    entryRoles: entryPointsFor(snapshot).roles,
    isOrphanEligible: isOrphanEligibleSource,
    softEdges,
    ...(soft.truncated ? { softTruncated: true as const } : {}),
    ...(soft.coverageNote ? { coverageNote: soft.coverageNote } : {}),
    ...(intent ? { intent } : {}),
  };
  if (!withSymbols) return base;
  const kg = cachedKnowledgeGraph(snapshot);
  return {
    ...base,
    symbols: kg.symbols,
    references: kg.references,
  };
}

/** Tests the pack's run commands cover: the first few, the named ones lead. */
const PACK_RUN_TESTS = 5;

/**
 * The exact command for the pack's first tests (token fix 1), so an agent
 * handed the pack does not have to work out how this repository runs one
 * test file. Same plan as `test_impact`; never executed here.
 */
function packTestRuns(
  snapshot: IndexSnapshot,
): (tests: readonly string[]) => { cwd: string; command: string }[] {
  return (all) => {
    const tests = all.slice(0, PACK_RUN_TESTS);
    if (tests.length === 0) return [];
    return testRunPlan(
      tests,
      workspaceTestPackages(snapshot),
      workspacePackageManager(snapshot.rootPath),
    )
      .runs.slice(0, 2)
      .map((r) => ({ cwd: r.cwd, command: r.command }));
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
  ensureWorkspacePrismSync(rootPath);
  const repoId = unsafeRepoId(`repo:${rootPath}`);
  // M-057 P-B6 — `.prism/config.json` (missing → empty). Invalid file fails soft
  // with empty config so open still works; index warnings can surface later.
  const loadedConfig = loadPrismConfigSync(rootPath);
  const prismConfig: PrismConfig = loadedConfig.ok ? loadedConfig.value : {};
  let open = true;
  let lastIndexedAt: string | null = null;
  let lastSnapshot: IndexSnapshot | null = null;
  let selectedPackageId: string | null = null;
  let gitCache: { key: string; value: GitSignals | null } | null = null;
  let gitFilesCache: {
    from: GitSignals;
    files: GitSignals["signals"] extends Map<string, infer V> ? V[] : never;
  } | null = null;
  let gitReading: string | null = null;
  /**
   * Git signals, read once per HEAD: history changes with a commit or a
   * checkout, not with a saved file. The first read is synchronous. After a
   * HEAD change the history read for the previous HEAD keeps answering while
   * the new one is read in the background (token fix 2): history only ranks
   * ties and co-change partners, and a second of blocked event loop after
   * every checkout is what kept the daemon from answering hooks. A question
   * about history itself (`fresh`) always reads the current HEAD.
   */
  const gitSignalsFor = (
    snapshot: IndexSnapshot,
    { fresh = false }: { readonly fresh?: boolean } = {},
  ): GitSignals | null => {
    const key = readGitHead(snapshot.rootPath)?.sha ?? "";
    if (gitCache?.key === key) return gitCache.value;
    const keepPaths = new Set(snapshot.files.map((f) => f.path));
    if (!gitCache || fresh) {
      gitReading = null;
      gitCache = {
        key,
        value: readGitSignals(snapshot.rootPath, { keepPaths }),
      };
      return gitCache.value;
    }
    if (gitReading !== key) {
      gitReading = key;
      void readGitSignalsAsync(snapshot.rootPath, { keepPaths }).then(
        (value) => {
          if (gitReading !== key) return; // HEAD moved again meanwhile
          gitCache = { key, value };
          gitReading = null;
        },
        () => {
          gitReading = null; // fail soft: the next call tries again
        },
      );
    }
    return gitCache.value;
  };
  /** Co-change partners for Prepare ranking and test_impact (P7). */
  const coChangeFor = (
    snapshot: IndexSnapshot,
  ): { coChange?: (path: string) => readonly CoChangePartner[] } => {
    const index = gitSignalsFor(snapshot)?.coChange;
    return index ? { coChange: (path) => index.partners(path) } : {};
  };
  let frameworksCache: {
    at: string | null;
    value: readonly string[];
  } | null = null;
  const softImpactCache: {
    key: string | null;
    value: ReturnType<typeof buildSoftImpactIndex> | null;
  } = { key: null, value: null };

  // —— Incremental watch (M-048 / ADR-0026) ——
  let watching = false;
  let watchStatus: IndexFreshness["status"] = "fresh";
  let pendingChanged = new Set<string>();
  let pendingDeleted = new Set<string>();
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  let watchDebounceMs = 1500;
  let watchOnChange: ((freshness: IndexFreshness) => void) | null = null;
  let watchRunning = false;
  let watchLastError: string | null = null;
  let watchFailureCount = 0;

  const WATCH_RETRY_BASE_MS = 2000;
  const WATCH_RETRY_MAX_MS = 60_000;

  // Exponential backoff so a persistently failing reindex does not spin.
  const watchRetryDelayMs = (): number =>
    Math.min(
      WATCH_RETRY_BASE_MS * 2 ** Math.min(watchFailureCount, 5),
      WATCH_RETRY_MAX_MS,
    );

  const freshnessSnapshot = (): IndexFreshness => ({
    watching,
    status: watchStatus,
    lastIndexedAt,
    pendingDirtyCount: pendingChanged.size + pendingDeleted.size,
    dirtyPaths: [...pendingChanged, ...pendingDeleted].sort(),
    ...(watchLastError ? { lastError: watchLastError } : {}),
  });

  const emitFreshness = (): void => {
    watchOnChange?.(freshnessSnapshot());
  };

  const flushWatch = async (): Promise<void> => {
    if (!open || !watching || watchRunning) return;
    const changed = [...pendingChanged];
    const deleted = [...pendingDeleted];
    if (changed.length === 0 && deleted.length === 0) {
      watchStatus = lastIndexedAt ? "fresh" : "stale";
      emitFreshness();
      return;
    }
    // Dirty paths are cleared only once the reindex confirms it consumed them.
    // Clearing up front loses them permanently when indexing fails, leaving the
    // index stale while reporting fresh — a wrong answer given confidently.
    watchRunning = true;
    watchStatus = "indexing";
    watchLastError = null;
    emitFreshness();
    let succeeded = false;
    try {
      const result = await runIndex({
        changedPaths: changed,
        deletedPaths: deleted,
      });
      succeeded = result.ok;
      if (!result.ok) watchLastError = result.error.message;
    } catch (error) {
      watchLastError =
        error instanceof Error ? error.message : "Reindex threw unexpectedly";
    } finally {
      if (succeeded) {
        // Only the paths handed to this run are cleared; anything that arrived
        // while it was in flight stays dirty and triggers another pass.
        for (const path of changed) pendingChanged.delete(path);
        for (const path of deleted) pendingDeleted.delete(path);
        watchFailureCount = 0;
      } else {
        watchFailureCount += 1;
      }
      watchRunning = false;
      const stillDirty = pendingChanged.size + pendingDeleted.size > 0;
      watchStatus = stillDirty || !succeeded ? "stale" : "fresh";
      emitFreshness();
      if (stillDirty && watching) {
        scheduleWatchFlush(succeeded ? undefined : watchRetryDelayMs());
      }
    }
  };

  const scheduleWatchFlush = (delayMs?: number): void => {
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      void flushWatch();
    }, delayMs ?? watchDebounceMs);
  };

  const mutesFilePath = (): string => workspaceFindingMutesPath(rootPath);

  /** Same missing-file-is-empty, corrupt-file-is-an-error contract as bookmarks. */
  const readMuteStore = async (): Promise<
    Result<FindingMuteStore, PrismError>
  > => {
    let raw: string;
    try {
      raw = await readFile(mutesFilePath(), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        return ok({ version: 1, mutes: [] });
      }
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Could not read ${mutesFilePath()}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ),
      );
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `${mutesFilePath()} is not valid JSON. Fix or delete the file to continue.`,
        ),
      );
    }
    const parsed = FindingMuteStoreSchema.safeParse(json);
    if (!parsed.success) {
      return err(
        prismError(
          PrismErrorCode.VALIDATION,
          `${mutesFilePath()} is not a valid mute store. Fix or delete the file to continue.`,
        ),
      );
    }
    return ok(parsed.data);
  };

  const writeMuteStore = async (
    store: FindingMuteStore,
  ): Promise<Result<void, PrismError>> => {
    try {
      await mkdir(workspacePrismDir(rootPath), { recursive: true });
      await writeFile(
        mutesFilePath(),
        `${JSON.stringify(store, null, 2)}\n`,
        "utf8",
      );
      return ok(undefined);
    } catch (error) {
      return err(
        prismError(
          PrismErrorCode.IO_ERROR,
          `Could not write ${mutesFilePath()}: ${
            error instanceof Error ? error.message : "unknown error"
          }`,
        ),
      );
    }
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
  /**
   * Impact gate plus the plan §4.6 language gate for a target: an
   * unsupported-language target, or a repo under 20% TS/JS, is
   * `PRISM_UNSUPPORTED (reason: language)` — never a guessed answer.
   */
  const ensureSupported = (target?: {
    kind: string;
    id: string;
    path?: string;
  }): Result<IndexSnapshot, PrismError> => {
    const gate = ensureImpact();
    if (!gate.ok) return gate;
    const targetPath =
      target?.path ?? (target?.kind === "file" ? target.id : undefined);
    const refusal = languageGate(
      gate.value.files.map((f) => f.path),
      targetPath,
    );
    return refusal ? err(refusal) : gate;
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

    // A full run reads everything on disk, so it satisfies whatever the watcher
    // had queued. Captured before the run and cleared after, so that paths which
    // change *during* it stay dirty and get their own pass — the same reasoning
    // flushWatch uses for its own bookkeeping.
    const isFullRun =
      !indexOptions?.changedPaths?.length &&
      !indexOptions?.deletedPaths?.length;
    const satisfiedChanged = isFullRun ? [...pendingChanged] : [];
    const satisfiedDeleted = isFullRun ? [...pendingDeleted] : [];

    // flags (indexOptions) > .prism/config.json > indexer defaults (M-057 P-B6)
    const limits = mergeIndexLimits({
      defaults: {
        maxFileBytes: DEFAULT_MAX_FILE_BYTES,
        extraIgnorePatterns: [],
      },
      config: prismConfig,
      flags: {
        ...(typeof indexOptions?.maxFileBytes === "number"
          ? { maxFileBytes: indexOptions.maxFileBytes }
          : {}),
        ...(indexOptions?.extraIgnorePatterns
          ? { extraIgnorePatterns: indexOptions.extraIgnorePatterns }
          : {}),
      },
    });
    const mergedOptions: IndexWorkspaceOptions = {
      ...indexOptions,
      maxFileBytes: limits.maxFileBytes,
      ...(limits.extraIgnorePatterns.length > 0
        ? { extraIgnorePatterns: limits.extraIgnorePatterns }
        : {}),
      ...(!isFullRun && lastSnapshot ? { priorFiles: lastSnapshot.files } : {}),
    };

    const indexed = await options.ports.indexer.indexWorkspace(
      rootPath,
      mergedOptions,
    );
    // A dirty run only re-reads the paths it was given, so it is as partial as
    // the snapshot it merged into. Its own warnings start empty, which made a
    // capped index look whole after the first edit (round 4).
    const was =
      !isFullRun && lastSnapshot ? partialIndexOf(lastSnapshot.warnings) : null;
    const result =
      indexed.ok && was && partialIndexOf(indexed.value.warnings) === null
        ? ok({
            ...indexed.value,
            warnings: [
              ...indexed.value.warnings,
              partialIndexWarning(was.analyzed, was.total),
            ],
          })
        : indexed;
    if (result.ok) {
      lastSnapshot = result.value;
      lastIndexedAt = result.value.indexedAt;
      softImpactCache.key = null;
      softImpactCache.value = null;

      if (isFullRun) {
        for (const path of satisfiedChanged) pendingChanged.delete(path);
        for (const path of satisfiedDeleted) pendingDeleted.delete(path);
      }

      // While watching, flushWatch normally owns this. But a host that calls
      // reindex() directly — a refresh button, say — has just made the index
      // current, and reporting it as stale until the next debounce both lies to
      // the status bar and schedules work that is already done.
      if (
        !watching ||
        (isFullRun && pendingChanged.size + pendingDeleted.size === 0)
      ) {
        watchStatus = "fresh";
        watchLastError = null;
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
      const built = buildDependencyGraph(lastSnapshot, graphOptions);
      const sampleLimit = 8;
      const unresolvedImports = {
        count: built.unresolved.length,
        sample: built.unresolved
          .slice(0, sampleLimit)
          .map((u) => `${u.from} → ${u.source}`),
      };
      const dto: DependencyGraphDto = {
        ...built.graph,
        unresolvedImports,
      };
      return ok(dto);
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
      // Copied out rather than handed over: the graph behind this is now shared
      // between callers (M-035), and `getCycles` is a frozen public signature
      // that promises a plain mutable array (ADR-0019).
      return ok(
        buildDependencyGraph(lastSnapshot, graphOptions).cycles.map((c) => [
          ...c,
        ]),
      );
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
      const kg = cachedKnowledgeGraph(lastSnapshot);
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
      return ok(querySymbols(cachedKnowledgeGraph(lastSnapshot), query));
    },
    searchSymbols(query) {
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
      try {
        return ok(
          querySearchSymbols(cachedKnowledgeGraph(lastSnapshot), query),
        );
      } catch (cause) {
        if (cause instanceof SyntaxError) {
          return err(
            prismError(
              PrismErrorCode.VALIDATION,
              `Invalid symbol search regex: ${cause.message}`,
            ),
          );
        }
        throw cause;
      }
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
      return ok(queryReferences(cachedKnowledgeGraph(lastSnapshot), query));
    },
    analyze: runAnalyze,
    reindex: runAnalyze,
    startWatch(watchOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      watching = true;
      watchDebounceMs = watchOptions?.debounceMs ?? 1500;
      watchOnChange = watchOptions?.onChange ?? null;
      watchLastError = null;
      watchFailureCount = 0;
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
          ...(lastSnapshot
            ? { importedPackages: importedPackageRoots(lastSnapshot) }
            : {}),
        }),
      );
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
      const git = gitSignalsFor(lastSnapshot);
      const gitFiles = git ? [...git.signals.values()] : undefined;
      const report = buildCodeExplorerReport({
        snapshot: lastSnapshot,
        target: parsed.data,
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
    async prepareChange(input) {
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
      const languageRefusal = languageGate(
        lastSnapshot.files.map((f) => f.path),
      );
      if (languageRefusal) return err(languageRefusal);
      const task = input.task.trim();
      if (!task) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            "prepareChange requires a task",
          ),
        );
      }
      const git = gitSignalsFor(lastSnapshot);
      if (git && gitFilesCache?.from !== git) {
        gitFilesCache = { from: git, files: [...git.signals.values()] };
      }
      const gitFiles = git ? gitFilesCache?.files : undefined;
      // Stack detection walks the tree; a manifest edit reindexes, which
      // changes `lastIndexedAt` and so refreshes this.
      if (!frameworksCache || frameworksCache.at !== lastIndexedAt) {
        const dna = await this.getDna();
        frameworksCache = {
          at: lastIndexedAt,
          value: dna.ok ? dna.value.frameworks : [],
        };
      }
      const frameworks = frameworksCache.value;
      const memories = await loadWorkspaceMemories(lastSnapshot.rootPath);
      const prepared = buildPrepareChange({
        snapshot: lastSnapshot,
        task,
        ...(input.budget !== undefined ? { budget: input.budget } : {}),
        ...(gitFiles && gitFiles.length > 0 ? { gitFiles } : {}),
        ...coChangeFor(lastSnapshot),
        ...(frameworks.length > 0 ? { frameworks } : {}),
        ...(memories.length > 0 ? { memories } : {}),
        ...(watchStatus !== "fresh" ? { indexStale: true } : {}),
        testRuns: packTestRuns(lastSnapshot),
        ...(() => {
          const scores = feedbackScores(lastSnapshot.rootPath, task);
          if (scores.size === 0) return {};
          return {
            feedback: (path: string) => scores.get(path) ?? 0,
          };
        })(),
      });
      return ok(prepared);
    },
    listFindings() {
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
      return ok({ findings: queryFindings(lastSnapshot) });
    },
    async resolveFinding(input) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const fingerprint = input.fingerprint.trim();
      if (!fingerprint) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            "resolveFinding requires a fingerprint",
          ),
        );
      }
      const reindexed = await this.reindex();
      if (!reindexed.ok) return reindexed;
      if (!lastSnapshot) {
        return err(
          prismError(
            PrismErrorCode.INDEX_REQUIRED,
            "No index snapshot yet — call workspace.index() first",
          ),
        );
      }
      const open = findingStillOpen(lastSnapshot, fingerprint);
      return ok({ resolved: !open });
    },
    async listMutedFindings() {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const store = await readMuteStore();
      if (!store.ok) return store;
      return ok(store.value.mutes.map((m) => m.fingerprint));
    },
    async muteFinding(fingerprint) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const trimmed = fingerprint.trim();
      if (!trimmed) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            "muteFinding requires a fingerprint",
          ),
        );
      }
      const store = await readMuteStore();
      if (!store.ok) return store;
      const mutes = store.value.mutes.some((m) => m.fingerprint === trimmed)
        ? store.value.mutes
        : [
            ...store.value.mutes,
            { fingerprint: trimmed, mutedAt: new Date().toISOString() },
          ];
      const written = await writeMuteStore({ version: 1, mutes });
      if (!written.ok) return written;
      return ok(mutes.map((m) => m.fingerprint));
    },
    async unmuteFinding(fingerprint) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const trimmed = fingerprint.trim();
      const store = await readMuteStore();
      if (!store.ok) return store;
      const mutes = store.value.mutes.filter((m) => m.fingerprint !== trimmed);
      const written = await writeMuteStore({ version: 1, mutes });
      if (!written.ok) return written;
      return ok(mutes.map((m) => m.fingerprint));
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
      return ok(collectLandmarks(lastSnapshot));
    },
    getChangedPaths(changedOptions) {
      const gate = ensureOpen();
      if (!gate.ok) return gate;
      const changed = readChangedPaths(rootPath, changedOptions ?? {});
      if (changed === null) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            "Cannot list changed files: not a git work tree, or git is unavailable",
          ),
        );
      }
      return ok(changed);
    },
    getPrismGitignoreStatus() {
      return checkPrismGitignore(rootPath);
    },
    addPrismToGitignore() {
      return addPrismToGitignore(rootPath);
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
      const git = gitSignalsFor(lastSnapshot, { fresh: true });
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
      const gate = ensureSupported(input);
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
      const gate = ensureSupported(input);
      if (!gate.ok) return gate;
      return computeSafeDelete(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async renameImpact(input) {
      const gate = ensureSupported(input);
      if (!gate.ok) return gate;
      return computeRenameImpact(
        input,
        impactContextFor(gate.value, input.kind === "symbol", softImpactCache),
      );
    },
    async testImpact(input) {
      const gate = ensureSupported(input);
      if (!gate.ok) return gate;
      return computeTestImpact(input, {
        ...impactContextFor(
          gate.value,
          input.kind === "symbol",
          softImpactCache,
        ),
        ...coChangeFor(gate.value),
      });
    },
    checkRunPlan(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      const packages = workspaceTestPackages(gate.value);
      const packageManager = workspacePackageManager(gate.value.rootPath);
      return ok({
        runs: testRunPlan(input.tests, packages, packageManager).runs.map(
          (r) => ({ ...r, argv: [...r.argv], tests: [...r.tests] }),
        ),
        typecheck: typecheckPlan(input.typecheck, packages, packageManager),
        packageManager,
      });
    },
    async reviewChanges(input) {
      const gate = ensureSupported();
      if (!gate.ok) return gate;
      const context = {
        ...impactContextFor(gate.value, false, softImpactCache),
        ...coChangeFor(gate.value),
      };
      const inventory = gate.value.files.map((f) => f.path);
      const unsupported: { path: string; message: string }[] = [];
      const paths = [
        ...new Set(
          input.paths.map((p) => p.replace(/\\/g, "/").replace(/^\.\//, "")),
        ),
      ].filter((path) => {
        // Plan §4.6 / RC-6: unsupported-language paths are listed, not analysed.
        const refusal = languageGate(inventory, path);
        if (refusal) unsupported.push({ path, message: refusal.message });
        return refusal === null;
      });
      // RC-3: a huge diff analyses the 100 source files with the most
      // importers, plus operational files (workflows, vercel.json) that
      // nothing imports. Those decide what runs, so dropping them hides
      // a command that does the opposite of what the change is for.
      const importers = new Map<string, number>();
      if (paths.length > REVIEW_LARGE_DIFF) {
        for (const edge of buildDependencyGraph(gate.value).graph.edges) {
          const to = edge.to.replace(/^file:/, "");
          importers.set(to, (importers.get(to) ?? 0) + 1);
        }
      }
      const selected = selectReviewPaths(
        paths,
        (path) => importers.get(path) ?? 0,
      );
      const analysed = selected.analysed;
      const judgments = [];
      for (const path of paths.filter(isOperationalPath).slice(0, 40)) {
        const abs = joinPath(rootPath, path);
        if (!existsSync(abs)) continue;
        let text = "";
        try {
          text = readFileSync(abs, "utf8");
        } catch {
          continue;
        }
        judgments.push(...judgeOperational(path, text));
      }
      const items: ChangeReviewItem[] = [];
      const callersOf = new Map<string, string[]>();
      const testsOf = new Map<string, string[]>();
      for (const path of analysed) {
        // A deleted or unindexed file must not abort the review. The code
        // reading and the reach report still run for the files that resolve.
        if (!existsSync(joinPath(rootPath, path))) continue;
        const origin = { kind: "file" as const, id: path, path };
        const blast = computeBlastRadius(origin, context);
        if (!blast.ok) {
          if (blast.error.code === PrismErrorCode.NOT_FOUND) continue;
          return blast;
        }
        const testImpact = computeTestImpact(origin, context);
        if (!testImpact.ok) return testImpact;
        const hints = computeBreakingChangeHints(origin, context);
        if (!hints.ok) return hints;
        callersOf.set(
          path,
          blast.value.affectedFiles.slice(0, 5).map((file) => file.path),
        );
        testsOf.set(
          path,
          testImpact.value.tests.slice(0, 5).map((test) => test.path),
        );
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
        band: riskToBand(overallRisk),
        totalAffectedFiles,
        totalTestsAffected,
        totalBreakingChanges,
        ...(unsupported.length > 0 ? { unsupported } : {}),
        ...(selected.truncated ? { truncated: selected.truncated } : {}),
        ...(judgments.length > 0 ? { judgments } : {}),
        reading: buildCodeReading({
          targets: items.map((item) => ({
            path: item.path,
            risk: item.risk,
            callers: callersOf.get(item.path) ?? [],
            tests:
              testsOf.get(item.path) ?? item.testsLikelyAffected.slice(0, 5),
          })),
          proven: judgments
            .filter((item) => item.riskIfSkipped === "high")
            .map((item) => ({
              what: item.what,
              where: item.where,
              fix: item.fix,
            })),
          ...(selected.truncated ? { truncated: selected.truncated } : {}),
        }),
        ...(input.paths.length === 0 ? { message: "nothing changed" } : {}),
      } satisfies ChangeReviewReport);
    },
    repoMap(opts = {}) {
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
      const snapshot = lastSnapshot;
      const head = readGitHead(snapshot.rootPath)?.sha;
      return buildCachedRepoMap(this, {
        ...opts,
        ...(head ? { gitHead: head } : {}),
        gitFiles: () => {
          const git = gitSignalsFor(snapshot);
          return git && git.signals.size > 0
            ? [...git.signals.values()]
            : undefined;
        },
      });
    },
    graph(query, budget) {
      return runGraphQuery(this, query, budget);
    },
    exportGraph() {
      return exportWorkspaceGraph(this);
    },
    async explainArea(path) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      const snapshot = gate.value;
      const norm = path.replace(/\\/g, "/").replace(/^\.\//, "");

      const dep = buildDependencyGraph(snapshot).graph;
      // Plan §4.1: a folder aggregates its files' edges. Edges inside the
      // folder are internal and not counted; in/out cross its boundary.
      const prefix = norm.replace(/\/+$/, "");
      const folderFiles = snapshot.files
        .map((f) => f.path)
        .filter((p) => p.startsWith(`${prefix}/`))
        .sort();
      const isFolder =
        prefix.length > 0 &&
        folderFiles.length > 0 &&
        !snapshot.files.some((f) => f.path === prefix);
      // A typo must not get a confident-looking summary of nothing.
      if (
        prefix.length > 0 &&
        !isFolder &&
        !snapshot.files.some((f) => f.path === prefix) &&
        !existsSync(joinPath(snapshot.rootPath, prefix))
      ) {
        return err(
          prismError(
            PrismErrorCode.NOT_FOUND,
            `No file or folder at ${prefix} in this workspace`,
          ),
        );
      }
      const members = new Set(
        (isFolder ? folderFiles : [norm]).map((p) => `file:${p}`),
      );
      const inEdges = dep.edges.filter(
        (e) => members.has(e.to) && !members.has(e.from),
      );
      const inDeg = inEdges.length;
      const outDeg = dep.edges.filter(
        (e) => members.has(e.from) && !members.has(e.to),
      ).length;
      const folderTests = isFolder
        ? [
            ...new Set([
              ...folderFiles.filter((p) => isTestPath(p)),
              ...inEdges
                .map((e) => String(e.from).replace(/^file:/, ""))
                .filter((p) => isTestPath(p)),
            ]),
          ]
            .sort()
            .slice(0, 50)
        : [];
      const folderSources = folderFiles.filter((p) => !isTestPath(p));

      const rollup = await loadWorkspaceRollup();
      const dna = rollup.ok
        ? assembleDnaReport({
            profile: rollup.value,
            filePaths: snapshot.files.map((f) => f.path),
            importedPackages: importedPackageRoots(snapshot),
          })
        : null;
      const domains = matchDomainsForPath(
        norm,
        dna?.rankedDomains.map((d) => d.id) ?? [],
      );

      const git = gitSignalsFor(snapshot);
      const ownerCounts = new Map<string, number>();
      for (const p of isFolder ? folderFiles : [norm]) {
        const signal = git?.signals.get(p);
        for (const c of signal?.contributors ?? [])
          ownerCounts.set(
            c.author,
            (ownerCounts.get(c.author) ?? 0) + c.commits,
          );
      }
      const owners = [...ownerCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([author]) => author);

      const role = classifyFileRole(norm);

      const summary = [
        domains.length > 0
          ? `Likely ${domains.join("/")} area`
          : "Domain not confidently classified",
        isFolder
          ? `folder of ${folderSources.length} source file(s)${
              folderSources.length > 0
                ? ` (${folderSources.slice(0, 5).join(", ")}${folderSources.length > 5 ? ", …" : ""})`
                : ""
            }; tests: ${folderTests.length > 0 ? folderTests.slice(0, 5).join(", ") : "none found"}`
          : `file role: ${fileRoleLabel(role)}`,
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
        ...(isFolder
          ? {
              kind: "folder" as const,
              files: folderSources.slice(0, 50),
              tests: folderTests,
            }
          : { kind: "file" as const, fileRole: role }),
      } satisfies ExplainAreaSummary);
    },
    async guardSession(input) {
      const gate = ensureImpact();
      if (!gate.ok) return gate;
      const snapshot = gate.value;
      const changed = readChangedPaths(rootPath, {});
      if (changed === null) {
        return err(
          prismError(
            PrismErrorCode.UNSUPPORTED,
            "Cannot rank a session: not a git work tree, or git is unavailable",
          ),
        );
      }
      const preExisting = new Set(input?.preExistingChanges ?? []);
      const wanted = input?.paths?.map((p) => p.replace(/^\.\/|\/$/g, ""));
      const named = (p: string) =>
        !wanted || wanted.some((w) => p === w || p.startsWith(`${w}/`));
      const sessionPaths = changed.paths.filter(
        (p) => !preExisting.has(p) && named(p),
      );
      const excludedPreExisting = changed.paths.filter((p) =>
        preExisting.has(p),
      );

      const dependencyGraph = buildDependencyGraph(snapshot).graph;
      // Read each session file at HEAD once; undefined when there is no HEAD.
      const hasHead = gitHasHead(rootPath);
      const atHead = new Map<string, string | null>();
      const headSource = (path: string): string | null | undefined => {
        if (!hasHead) return undefined;
        if (!atHead.has(path)) atHead.set(path, readHeadFile(rootPath, path));
        return atHead.get(path);
      };
      const readAt = (path: string): string | null => {
        try {
          return readFileSync(joinPath(rootPath, path), "utf8");
        } catch {
          return null;
        }
      };
      const flagsByPath = checkGuardSession({
        snapshot,
        sessionPaths,
        dependencyGraph,
        entryRoles: entryPointsFor(snapshot).roles,
        headSource,
        readSource: readAt,
        jsrPackage: publishesToJsr(readAt),
      });
      const context = impactContextFor(snapshot, false, softImpactCache);
      const files: GuardSession["files"] = [];
      for (const path of sessionPaths) {
        const blast = computeBlastRadius(
          { kind: "file", id: path, path },
          context,
        );
        if (!blast.ok) {
          if (blast.error.code === PrismErrorCode.NOT_FOUND) continue;
          return blast;
        }
        files.push({
          path,
          risk: blast.value.risk,
          band: riskToBand(blast.value.risk),
          flags: flagsByPath.get(path) ?? [],
        });
      }
      files.sort((a, b) => b.risk - a.risk);
      const cap = 50;
      const top = files.slice(0, cap);
      return ok({
        generatedAt: new Date().toISOString(),
        files: top,
        excludedPreExisting,
        sessionPaths,
        totalDirty: changed.paths.length,
        truncated: files.length > cap,
        findings: findingsFromGuardFiles(top),
      } satisfies GuardSession);
    },
    async generateAgentsMd() {
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
      const snapshot = lastSnapshot;
      const cycles = buildDependencyGraph(snapshot).cycles.map((c) => [...c]);
      const testFiles = snapshot.files
        .filter((f) => isTestPath(f.path))
        .map((f) => f.path);

      const generatedAt = new Date().toISOString();
      const content = buildAgentsMdContent({
        generatedAt,
        cycles,
        testFiles,
      });
      const path = agentsMdPath(rootPath);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, "utf8");
      return ok({ path, content } satisfies AgentsMdGenerateResult);
    },
    async checkAgentsMd() {
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
      const path = agentsMdPath(rootPath);
      const checkedAt = new Date().toISOString();
      let content: string;
      try {
        content = await readFile(path, "utf8");
      } catch {
        return err(
          prismError(
            PrismErrorCode.NOT_FOUND,
            `No AGENTS.md generated yet — run \`prism agents-md generate\` first (expected at ${path})`,
          ),
        );
      }
      const claims = parseAgentsMdClaims(content);
      if (!claims) {
        return err(
          prismError(
            PrismErrorCode.VALIDATION,
            `AGENTS.md at ${path} has no readable claims block — regenerate it`,
          ),
        );
      }
      const issues: AgentsMdCheckResult["issues"] = [];
      const currentCycles = buildDependencyGraph(lastSnapshot)
        .cycles.map((c) => [...c].sort())
        .sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
      const claimedCycles = claims.cycles
        .map((c) => [...c].sort())
        .sort((a, b) => a.join("\0").localeCompare(b.join("\0")));
      if (JSON.stringify(currentCycles) !== JSON.stringify(claimedCycles)) {
        issues.push({
          kind: "stale-cycle",
          detail: `Claimed ${claimedCycles.length} import cycle(s), current index has ${currentCycles.length}`,
        });
      }
      const result: AgentsMdCheckResult = {
        ok: issues.length === 0,
        path,
        checkedAt,
        issues,
      };
      return ok(result);
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

/** True when the repo has a HEAD commit to compare a session with. */
function gitHasHead(rootPath: string): boolean {
  try {
    execFileSync(
      "git",
      ["-C", rootPath, "rev-parse", "--verify", "-q", "HEAD"],
      {
        stdio: "ignore",
        timeout: 5_000,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** A file as committed at HEAD (round 5); null when HEAD has no such file. */
function readHeadFile(rootPath: string, path: string): string | null {
  try {
    return execFileSync("git", ["-C", rootPath, "show", `HEAD:${path}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 16 * 1024 * 1024,
      timeout: 5_000,
    });
  } catch {
    return null;
  }
}
