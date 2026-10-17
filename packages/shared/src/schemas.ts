import {
  PREPARE_RESPONSE_BUDGET,
  PrepareTrimmedSchema,
} from "./prepare-trimmed.js";
import { z } from "zod";
import { PrismErrorCode } from "./errors.js";
import { SignalProvenanceSchema } from "./provenance.js";
import { RiskBandSchema } from "./risk-bands.js";
import { WorkOrderSchema } from "./work-order.js";

/** JSON-serializable primitive / structure convention for MCP & CLI. */
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const PrismErrorSchema = z.object({
  code: z.enum([
    PrismErrorCode.UNKNOWN,
    PrismErrorCode.VALIDATION,
    PrismErrorCode.NOT_FOUND,
    PrismErrorCode.INVALID_PATH,
    PrismErrorCode.INVALID_ID,
    PrismErrorCode.WORKSPACE_NOT_OPEN,
    PrismErrorCode.INDEX_REQUIRED,
    PrismErrorCode.INDEX_FAILED,
    PrismErrorCode.ANALYZER_FAILED,
    PrismErrorCode.GRAPH_ERROR,
    PrismErrorCode.IO_ERROR,
    PrismErrorCode.UNSUPPORTED,
    PrismErrorCode.CANCELLED,
  ]),
  message: z.string().min(1),
  details: JsonValueSchema.optional(),
});

export type PrismErrorDto = z.infer<typeof PrismErrorSchema>;

export const RepoRelativePathSchema = z
  .string()
  .refine(
    (p) =>
      !p.startsWith("/") && !p.includes("\\") && !p.split("/").includes(".."),
    {
      message: "Must be a workspace-relative POSIX path without ..",
    },
  );

export const IndexFileStatsSchema = z.object({
  filesTotal: z.number().int().nonnegative(),
  filesIndexed: z.number().int().nonnegative(),
  filesSkipped: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export const IndexSummarySchema = z.object({
  repoId: z.string().min(1),
  rootPath: z.string().min(1),
  indexedAt: z.string().datetime(),
  stats: IndexFileStatsSchema,
  warnings: z.array(z.string()).default([]),
});

export type IndexSummary = z.infer<typeof IndexSummarySchema>;

/** Navigation hop list between graph nodes (M-016). */
export const NavigationRouteSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** Ordered node ids including endpoints. */
  hops: z.array(z.string().min(1)),
  length: z.number().int().nonnegative(),
  kind: z.enum(["dependency", "feature"]),
});

export type NavigationRoute = z.infer<typeof NavigationRouteSchema>;

export const NavigationRouteResultSchema = z.object({
  routes: z.array(NavigationRouteSchema),
  /** True when no path exists (routes empty by design). */
  empty: z.boolean(),
});

export type NavigationRouteResult = z.infer<typeof NavigationRouteResultSchema>;

export const LandmarkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1),
  kind: z.enum(["entrypoint", "package-root", "config"]),
  note: z.string().optional(),
});

export type Landmark = z.infer<typeof LandmarkSchema>;

/** A single commit reference (local git, no network). */
export const GitCommitRefSchema = z.object({
  sha: z.string().min(1),
  author: z.string().min(1),
  email: z.string().optional(),
  /** ISO-8601 commit date. */
  date: z.string().min(1),
  message: z.string().default(""),
  /**
   * True when the commit exists on the tracked upstream, false when it is local
   * only (unpushed). `undefined` when no upstream is configured (unknown).
   */
  pushed: z.boolean().optional(),
  /** Line insertions for this commit (`git log --numstat`), when known. */
  additions: z.number().int().nonnegative().optional(),
  /** Line deletions for this commit (`git log --numstat`), when known. */
  deletions: z.number().int().nonnegative().optional(),
});

export type GitCommitRef = z.infer<typeof GitCommitRefSchema>;

/** Per-author contribution rollup for a file. */
export const GitContributorSchema = z.object({
  author: z.string().min(1),
  commits: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});

export type GitContributor = z.infer<typeof GitContributorSchema>;

/** Local git history rolled up per file (M-042 / ADR-0013). */
export const GitFileSignalSchema = z.object({
  path: z.string().min(1),
  lastCommit: GitCommitRefSchema,
  commits: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  /** Line churn of the file's most-recent commit (for activity feeds). */
  lastAdditions: z.number().int().nonnegative().default(0),
  lastDeletions: z.number().int().nonnegative().default(0),
  contributors: z.array(GitContributorSchema).default([]),
  /** Most recent commits touching this file (bounded). */
  recent: z.array(GitCommitRefSchema).default([]),
  /** Commits per week over a recent window (oldest → newest), for sparklines. */
  weeks: z.array(z.number().int().nonnegative()).default([]),
  /** 0–1 recency (1 = just changed) relative to the repo window. */
  recency: z.number().min(0).max(1).default(0),
});

export type GitFileSignal = z.infer<typeof GitFileSignalSchema>;

/**
 * Local vs remote sync state for the current branch. Derived entirely from
 * local git plumbing (`@{u}`, `FETCH_HEAD` mtime) — never touches the network.
 */
export const GitSyncStatusSchema = z.object({
  /** Tracked upstream ref (e.g. `origin/main`), when configured. */
  upstream: z.string().optional(),
  /** Local commits not yet on upstream. */
  ahead: z.number().int().nonnegative().default(0),
  /** Upstream commits not yet local. */
  behind: z.number().int().nonnegative().default(0),
  /** ISO time of the last `git fetch` (FETCH_HEAD mtime), when known. */
  lastFetch: z.string().optional(),
});

export type GitSyncStatus = z.infer<typeof GitSyncStatusSchema>;

/** Repo-level git summary attached to the map root. */
export const GitRepoSummarySchema = z.object({
  headSha: z.string().optional(),
  /** Current branch (`git rev-parse --abbrev-ref HEAD`), when resolvable. */
  branch: z.string().optional(),
  /** Real commit count (`git rev-list --count HEAD`), when known. */
  totalCommits: z.number().int().nonnegative().default(0),
  /** Commits actually scanned for signals (capped, default 2000). */
  windowCommits: z.number().int().nonnegative().default(0),
  /**
   * True when `totalCommits > windowCommits` — the activity/ownership layers
   * only saw the latest scanned window (M-056 / P-A2).
   */
  historyTruncated: z.boolean().optional(),
  firstDate: z.string().optional(),
  lastDate: z.string().optional(),
  /** Local/remote sync state for the current branch. */
  sync: GitSyncStatusSchema.optional(),
});

export type GitRepoSummary = z.infer<typeof GitRepoSummarySchema>;

/** A recently-changed file (most-recent commit that touched it). */
export const GitRecentFileSchema = z.object({
  path: z.string().min(1),
  lastCommit: GitCommitRefSchema,
  commits: z.number().int().nonnegative().default(0),
  /** Line churn of the most-recent commit that touched this file. */
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});

export type GitRecentFile = z.infer<typeof GitRecentFileSchema>;

/** Distinct commits on a single calendar day (`YYYY-MM-DD`, local). */
export const GitDayBucketSchema = z.object({
  /** `YYYY-MM-DD` (commit-author local date). */
  date: z.string().min(1),
  commits: z.number().int().nonnegative(),
});

export type GitDayBucket = z.infer<typeof GitDayBucketSchema>;

/** Repo-wide author rollup for Trends (M-046). */
export const GitAuthorRollupSchema = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
  commits: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative().optional(),
  deletions: z.number().int().nonnegative().optional(),
});

export type GitAuthorRollup = z.infer<typeof GitAuthorRollupSchema>;

/**
 * Repo-wide local git activity for dashboards (M-042). `available` is false
 * when the root is not a git work tree; the reader never touches the network.
 */
export const GitActivitySchema = z.object({
  root: z.string().min(1),
  generatedAt: z.string().datetime(),
  available: z.boolean(),
  summary: GitRepoSummarySchema.optional(),
  /** Files ordered by most-recent change (newest first). */
  recentFiles: z.array(GitRecentFileSchema).default([]),
  /** Latest distinct commits repo-wide (newest first). */
  recentCommits: z.array(GitCommitRefSchema).default([]),
  /** Full scanned-window author census (commits desc). */
  authors: z.array(GitAuthorRollupSchema).default([]),
  /** Repo-wide commits per week over the recent window (oldest → newest). */
  weeks: z.array(z.number().int().nonnegative()).default([]),
  /**
   * Distinct commits per calendar day across the full scanned window (ascending
   * by date). Powers dashboard range filters (4w/12w/26w/52w + custom range).
   */
  days: z.array(GitDayBucketSchema).default([]),
});

export type GitActivity = z.infer<typeof GitActivitySchema>;

/** Coarse classification of how an affected file is impacted (M-046 tweak). */
export const BlastImpactCategorySchema = z.enum([
  "import",
  "reexport",
  "test",
  "config",
  "runtime",
  "type",
]);

export type BlastImpactCategory = z.infer<typeof BlastImpactCategorySchema>;

/**
 * Impact analysis lane (M-049 / ADR-0027). Hard lanes = import graph;
 * soft lanes = config/CI/env/script signals with confidence + evidence.
 */
export const ImpactLaneSchema = z.enum([
  "import",
  "reexport",
  "config",
  "package",
  "test",
  "env",
  "ci",
  "alias",
  "type",
  "script",
  "workspace",
]);

export type ImpactLane = z.infer<typeof ImpactLaneSchema>;

export const ImpactConfidenceSchema = z.enum(["high", "medium", "low"]);

export type ImpactConfidence = z.infer<typeof ImpactConfidenceSchema>;

export const BlastRadiusItemSchema = z.object({
  path: RepoRelativePathSchema,
  reason: z.string().min(1),
  depth: z.number().int().nonnegative(),
  /** How this file is affected (import edge, re-export, test, etc.). */
  category: BlastImpactCategorySchema.optional(),
  /** Analysis lane (defaults to category-derived / import when omitted). */
  lane: ImpactLaneSchema.optional(),
  /** Soft-signal confidence; hard import edges default to high when omitted. */
  confidence: ImpactConfidenceSchema.optional(),
  /** Human-readable evidence strings (e.g. glob match sources). */
  evidence: z.array(z.string().min(1)).optional(),
});

export type BlastRadiusItem = z.infer<typeof BlastRadiusItemSchema>;

/** Per-lane summary row on a blast report (M-049). */
export const BlastLaneSummarySchema = z.object({
  id: ImpactLaneSchema,
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
  maxConfidence: ImpactConfidenceSchema.optional(),
});

export type BlastLaneSummary = z.infer<typeof BlastLaneSummarySchema>;

/** Heuristic hint that a change may break consumers (M-021). */
export const BreakingChangeHintSchema = z.object({
  kind: z.string().min(1),
  severity: z.enum(["info", "warning", "danger"]),
  message: z.string().min(1),
});

export type BreakingChangeHint = z.infer<typeof BreakingChangeHintSchema>;

/** Coarse origin file role for blast headlines (M-049). */
export const FileRoleSchema = z.enum([
  "entry",
  "config",
  "test",
  "route",
  "schema",
  "generated",
  "barrel",
  "fixture",
  "source",
]);

export type FileRoleDto = z.infer<typeof FileRoleSchema>;

/** Forward dependency row — what the origin imports / loads (M-049). */
export const ForwardDependencyItemSchema = z.object({
  path: RepoRelativePathSchema,
  reason: z.string().min(1),
  kind: z.enum(["import", "reexport", "soft"]).default("import"),
  confidence: ImpactConfidenceSchema.optional(),
  evidence: z.array(z.string().min(1)).optional(),
});

export type ForwardDependencyItem = z.infer<typeof ForwardDependencyItemSchema>;

/** Checklist section composed from blast/test soft+hard signals (M-049). */
export const ScenarioChecklistSectionSchema = z.object({
  id: z.enum(["tests", "configs_ci", "packages"]),
  label: z.string().min(1),
  items: z.array(
    z.object({
      path: RepoRelativePathSchema,
      reason: z.string().min(1),
      confidence: ImpactConfidenceSchema.optional(),
    }),
  ),
});

export type ScenarioChecklistSection = z.infer<
  typeof ScenarioChecklistSectionSchema
>;

export const BlastRadiusReportSchema = z.object({
  origin: z.object({
    kind: z.enum(["file", "symbol"]),
    id: z.string().min(1),
    path: RepoRelativePathSchema.optional(),
  }),
  risk: z.number().min(0).max(100),
  /**
   * Band for `risk`, so every surface describes the same score the same way
   * instead of re-deriving thresholds locally (Q-023).
   */
  band: RiskBandSchema.optional(),
  affectedFiles: z.array(BlastRadiusItemSchema),
  testsLikelyAffected: z.array(RepoRelativePathSchema),
  /** Heuristic hints that the change may break consumers (M-046 tweak). */
  breakingChanges: z.array(BreakingChangeHintSchema).default([]),
  /** True when traversal stopped at the depth limit (results are partial). */
  truncated: z.boolean().optional(),
  /** Per-lane counts (hard ∪ soft); empty/omitted for hard-only legacy reports. */
  lanes: z.array(BlastLaneSummarySchema).optional(),
  /** Soft-analysis coverage note (truncation, unsupported dialect, etc.). */
  coverageNote: z.string().min(1).optional(),
  /** Count of hard (import/re-export) affected paths. */
  hardAffectedCount: z.number().int().nonnegative().optional(),
  /** Count of soft-only affected paths (not already in hard set). */
  softAffectedCount: z.number().int().nonnegative().optional(),
  /** Coarse role of the origin path (entry/config/test/…). */
  originRole: FileRoleSchema.optional(),
  /**
   * Analysis intent: edit emphasizes findings/risk; delete emphasizes blockers.
   * Surfaces may pass this; default behaves like edit.
   */
  intent: z.enum(["edit", "delete"]).optional(),
  /** Files this origin depends on (hard out-edges + soft loaded-by). */
  forwardDependencies: z.array(ForwardDependencyItemSchema).optional(),
  /**
   * True when more forward dependencies exist than `forwardDependencies`
   * includes (cap 80) (M-056 / P-A5). Distinct from top-level `truncated`
   * (traversal depth / soft-match truncation).
   */
  forwardDependenciesTruncated: z.boolean().optional(),
  /** Total forward dependencies before the display cap. */
  forwardDependenciesTotalCount: z.number().int().nonnegative().optional(),
  /**
   * Static list of dependency classes blast radius cannot see (DI containers,
   * string registries, event buses, …) (M-056 / P-A7).
   */
  coverageLimitations: z.array(z.string().min(1)).optional(),
  /** Lite scenario pack: tests to run / configs·CI touching this. */
  scenarioChecklist: z.array(ScenarioChecklistSectionSchema).optional(),
  /**
   * Present when a symbol origin was ambiguous (homonym) and impact seeded
   * nothing — pass `path` (or a full symbol id) to disambiguate (M-059 / P-A3).
   */
  resolutionNote: z.string().min(1).optional(),
});

export type BlastRadiusReport = z.infer<typeof BlastRadiusReportSchema>;

/** A change target: a file or a symbol (M-020/M-021). */
export const ChangeOriginSchema = z.object({
  kind: z.enum(["file", "symbol"]),
  id: z.string().min(1),
  path: RepoRelativePathSchema.optional(),
});

export type ChangeOrigin = z.infer<typeof ChangeOriginSchema>;

/** A file that must be edited for a rename, with its reference count. */
export const ImpactEditSiteSchema = z.object({
  path: RepoRelativePathSchema,
  count: z.number().int().positive(),
});

export type ImpactEditSite = z.infer<typeof ImpactEditSiteSchema>;

export const SafeDeleteReportSchema = z.object({
  origin: ChangeOriginSchema,
  /** True when nothing depends on the target. */
  safe: z.boolean(),
  /** Files that (transitively) depend on the target and block deletion. */
  blockers: z.array(BlastRadiusItemSchema),
  /**
   * Soft-lane blockers (config/CI/script) that block delete under Q-022
   * (medium+ confidence). May overlap `blockers` when also listed there.
   */
  softBlockers: z.array(BlastRadiusItemSchema).optional(),
  /** Files that become unreachable once the target is removed. */
  orphans: z.array(RepoRelativePathSchema),
  testsLikelyAffected: z.array(RepoRelativePathSchema),
  /** True when origin is tooling-critical (never safe from empty import graph). */
  toolingCritical: z.boolean().optional(),
  /**
   * Entry role of the target (plan §4.4): package-main, package-bin,
   * package-export, route, literal-path, test. Present ⇒ not safe.
   */
  entryRole: z.string().min(1).optional(),
});

export type SafeDeleteReport = z.infer<typeof SafeDeleteReportSchema>;

export const RenameImpactReportSchema = z.object({
  origin: ChangeOriginSchema,
  newName: z.string().min(1).optional(),
  /** Declaration + referencing files that must be edited. */
  editSites: z.array(ImpactEditSiteSchema),
  affectedFiles: z.array(RepoRelativePathSchema),
  breakingChanges: z.array(BreakingChangeHintSchema),
});

export type RenameImpactReport = z.infer<typeof RenameImpactReportSchema>;

/** Test runners Prism can build a run command for (plan §4.3). */
export const TestRunnerSchema = z.enum([
  "vitest",
  "jest",
  "bun",
  "node:test",
  "mocha",
]);

export type TestRunner = z.infer<typeof TestRunnerSchema>;

/** One test reached by the symbol walk: why, and through which changed name. */
export const TestImpactItemSchema = BlastRadiusItemSchema.extend({
  /** Changed export the test (or its chain) binds, when known by name. */
  viaSymbol: z.string().min(1).optional(),
});

export type TestImpactItem = z.infer<typeof TestImpactItemSchema>;

/** A ready command for the tests one package owns (plan P10). Never executed. */
export const TestRunSchema = z.object({
  /** Repo-relative directory to run it from (`.` is the root). */
  cwd: z.string().min(1),
  command: z.string().min(1),
  argv: z.array(z.string().min(1)).min(1),
  /** `files`: exactly these tests; `script`: the package's whole test script (runner unknown). */
  scope: z.enum(["files", "script"]),
  runner: TestRunnerSchema.optional(),
  tests: z.array(RepoRelativePathSchema),
});

export type TestRun = z.infer<typeof TestRunSchema>;

export const TestImpactReportSchema = z.object({
  origin: ChangeOriginSchema,
  /** Test files that import the changed symbol or a symbol that reaches it. */
  tests: z.array(TestImpactItemSchema),
  /** One command per package that owns reached tests (plan P10). */
  run: z.array(TestRunSchema),
  /** Why some or all reached tests have no command (no runner, no test script). */
  runNote: z.string().min(1).optional(),
});

export type TestImpactReport = z.infer<typeof TestImpactReportSchema>;

/** Per-path aggregate row inside a {@link ChangeReviewReport} (M-048 Phase 4). */
export const ChangeReviewItemSchema = z.object({
  path: RepoRelativePathSchema,
  risk: z.number().min(0).max(100),
  affectedFilesCount: z.number().int().nonnegative(),
  /** Hard (import) affected count when soft lanes are present (M-049). */
  hardAffectedCount: z.number().int().nonnegative().optional(),
  /** Soft-only affected count (M-049). */
  softAffectedCount: z.number().int().nonnegative().optional(),
  testsLikelyAffected: z.array(RepoRelativePathSchema),
  breakingChanges: z.array(BreakingChangeHintSchema),
});

export type ChangeReviewItem = z.infer<typeof ChangeReviewItemSchema>;

/**
 * Multi-path change-review aggregate (SCM / editor "Review Changes",
 * M-048 Phase 4). Wraps `blastRadius` + `testImpact` + `breakingChangeHints`
 * per path; `overallRisk` is the max per-path risk.
 */
export const ChangeReviewReportSchema = z.object({
  generatedAt: z.string().datetime(),
  /** Diff base label when known (e.g. `origin/main`, `HEAD~1`). */
  base: z.string().optional(),
  items: z.array(ChangeReviewItemSchema),
  overallRisk: z.number().min(0).max(100),
  /** Band for `overallRisk` (Q-023). */
  band: RiskBandSchema.optional(),
  totalAffectedFiles: z.number().int().nonnegative(),
  totalTestsAffected: z.number().int().nonnegative(),
  totalBreakingChanges: z.number().int().nonnegative(),
  /** Paths in unsupported languages (plan §4.6): listed, not analysed. */
  unsupported: z
    .array(z.object({ path: RepoRelativePathSchema, message: z.string() }))
    .optional(),
  /** Above 300 paths only the riskiest 100 are analysed (plan §5.1 RC-3). */
  truncated: z
    .object({
      total: z.number().int().nonnegative(),
      analysed: z.number().int().nonnegative(),
    })
    .optional(),
  /** Plain-language note, e.g. "nothing changed" on a clean tree (RC-4). */
  message: z.string().optional(),
});

export type ChangeReviewReport = z.infer<typeof ChangeReviewReportSchema>;

/** Above this many changed paths, `guard_session {review:true}` analyses only the top ones. */
export const REVIEW_LARGE_DIFF = 300;
/** How many paths a large diff analyses, riskiest first. */
export const REVIEW_ANALYSED_CAP = 100;

/**
 * Structured finding (plan P18): what goes wrong, where, how to fix, and
 * the risk of skipping it. Producers map into this; free-form findings are gone.
 */
export const FindingRiskSchema = z.enum(["low", "med", "high"]);
export type FindingRisk = z.infer<typeof FindingRiskSchema>;

export const FindingSchema = z.object({
  what: z.string().min(1),
  where: z.string().min(1),
  /** Concrete remediation, capped for token budget (FND-2). */
  fix: z.string().min(1).max(160),
  riskIfSkipped: FindingRiskSchema,
  /** Producers that agree on this finding (feeds P11 multi-source). */
  sources: z.array(z.string().min(1)).min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

/** What a Guard flag is warning about (M-072). */
export const GUARD_CHECK_KINDS = [
  "duplicate",
  "orphan",
  "boundary",
  "slow-type",
] as const;
export type GuardCheckKind = (typeof GUARD_CHECK_KINDS)[number];
export const GuardCheckKindSchema = z.enum(GUARD_CHECK_KINDS);

export const GuardFlagSchema = z.object({
  kind: GuardCheckKindSchema,
  detail: z.string().min(1),
  provenance: SignalProvenanceSchema,
});
export type GuardFlag = z.infer<typeof GuardFlagSchema>;

export const GuardFileSchema = z.object({
  path: RepoRelativePathSchema,
  risk: z.number().min(0).max(100),
  band: RiskBandSchema.optional(),
  flags: z.array(GuardFlagSchema),
});
export type GuardFile = z.infer<typeof GuardFileSchema>;

/**
 * Prism Guard (M-072): the current session — dirty files minus whatever was
 * already dirty before a job started (ADR-0045 §3 subtract, ADR-0055 G1) —
 * ranked by blast risk, each carrying duplicate/orphan/boundary flags.
 * `files` is sorted highest risk first: "read this one first."
 */
export const GuardSessionSchema = z.object({
  generatedAt: z.string().datetime(),
  files: z.array(GuardFileSchema),
  excludedPreExisting: z.array(RepoRelativePathSchema),
  /**
   * Every path this session changed (dirty minus pre-existing), including
   * files the index does not hold (unsupported languages, deletions). The
   * receipt hashes these for its dedupe key.
   */
  sessionPaths: z.array(RepoRelativePathSchema),
  totalDirty: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** Every flag above as a structured finding (plan P18), riskiest first. */
  findings: z.array(FindingSchema),
});
export type GuardSession = z.infer<typeof GuardSessionSchema>;

/** Deterministic module/folder summary card (M-048 Phase 5). */
export const ExplainAreaSummarySchema = z.object({
  path: RepoRelativePathSchema,
  /** Detected stack domain ids whose signals overlap this path. */
  domains: z.array(z.string()).default([]),
  dependencyDegree: z.object({
    in: z.number().int().nonnegative(),
    out: z.number().int().nonnegative(),
  }),
  /** Top git contributors for this path/folder (local history only). */
  owners: z.array(z.string()).default([]),
  summary: z.string().min(1),
  /** Coarse file role when path is a file (M-049). */
  fileRole: FileRoleSchema.optional(),
  /** Folder aggregation (plan §4.1): the folder's source files (≤ 50). */
  files: z.array(RepoRelativePathSchema).optional(),
  /** Folder aggregation: tests inside the folder or importing it (≤ 50). */
  tests: z.array(RepoRelativePathSchema).optional(),
  /** "folder" when `path` is a directory and the answer aggregates its files. */
  kind: z.enum(["file", "folder"]).optional(),
});

export type ExplainAreaSummary = z.infer<typeof ExplainAreaSummarySchema>;

export const FileInventoryStatusSchema = z.enum([
  "hashed",
  "skipped_binary",
  "skipped_oversized",
]);

export type FileInventoryStatus = z.infer<typeof FileInventoryStatusSchema>;

export const FileInventoryEntrySchema = z.object({
  path: RepoRelativePathSchema,
  sizeBytes: z.number().int().nonnegative(),
  mtimeMs: z.number().nonnegative(),
  hashAlgo: z.literal("sha256"),
  contentHash: z.string().nullable(),
  status: FileInventoryStatusSchema,
});

export type FileInventoryEntry = z.infer<typeof FileInventoryEntrySchema>;

export const FileInventorySchema = z.object({
  rootPath: z.string().min(1),
  hashAlgo: z.literal("sha256"),
  generatedAt: z.string().datetime(),
  files: z.array(FileInventoryEntrySchema),
  stats: z.object({
    filesSeen: z.number().int().nonnegative(),
    filesHashed: z.number().int().nonnegative(),
    filesSkipped: z.number().int().nonnegative(),
    filesIgnored: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
});

export type FileInventory = z.infer<typeof FileInventorySchema>;

export const IndexProgressPhaseSchema = z.enum([
  "inventory",
  "cache",
  "analyze",
  "finalize",
]);

export type IndexProgressPhase = z.infer<typeof IndexProgressPhaseSchema>;

export const IndexProgressEventSchema = z.object({
  phase: IndexProgressPhaseSchema,
  filesTotal: z.number().int().nonnegative().optional(),
  filesDone: z.number().int().nonnegative().optional(),
  path: RepoRelativePathSchema.optional(),
  message: z.string().optional(),
});

export type IndexProgressEvent = z.infer<typeof IndexProgressEventSchema>;

export const IndexedSymbolSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  exported: z.boolean().optional(),
});

export type IndexedSymbol = z.infer<typeof IndexedSymbolSchema>;

export const IndexedImportSchema = z.object({
  source: z.string().min(1),
  specifiers: z.array(z.string()),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  /**
   * True when this import was extracted as a CommonJS `require()` /
   * `createRequire()(…)` call (M-059 / P-E4). Dependency edges use kind
   * `require` when set.
   */
  kind: z.enum(["import", "require"]).optional(),
  /** Every binding is a type; such edges are excluded from value cycles (plan §4.1). */
  typeOnly: z.boolean().optional(),
  /** Names bound from the target as it exports them (`default`, `*`). §4.2 */
  imported: z.array(z.string()).optional(),
});

export type IndexedImport = z.infer<typeof IndexedImportSchema>;

export const IndexedExportSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  source: z.string().min(1).optional(),
  /** `export type { X } from …` (plan §4.1). */
  typeOnly: z.boolean().optional(),
  /** Re-exports: the source module's name for this export (`*` for `export *`). */
  importedName: z.string().min(1).optional(),
});

export type IndexedExport = z.infer<typeof IndexedExportSchema>;

export const IndexedReferenceSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  /**
   * How the reference was observed. `member` = `obj.prop()` /
   * `obj?.prop()` callee (M-059 / P-A4); resolution is low-confidence.
   */
  via: z.enum(["member"]).optional(),
});

export type IndexedReference = z.infer<typeof IndexedReferenceSchema>;

export const ParseDiagnosticDtoSchema = z.object({
  severity: z.enum(["error", "warning"]),
  message: z.string().min(1),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
});

export type ParseDiagnosticDto = z.infer<typeof ParseDiagnosticDtoSchema>;

export const IndexedFileStatusSchema = z.enum([
  "analyzed",
  "skipped_unsupported",
  "skipped_binary",
  "skipped_oversized",
  "failed",
]);

export type IndexedFileStatus = z.infer<typeof IndexedFileStatusSchema>;

export const IndexedFileSchema = z.object({
  path: RepoRelativePathSchema,
  pluginId: z.string().nullable(),
  contentHash: z.string().nullable(),
  status: IndexedFileStatusSchema,
  symbols: z.array(IndexedSymbolSchema).default([]),
  imports: z.array(IndexedImportSchema).default([]),
  exports: z.array(IndexedExportSchema).default([]),
  references: z.array(IndexedReferenceSchema).default([]),
  diagnostics: z.array(ParseDiagnosticDtoSchema).default([]),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
});

export type IndexedFile = z.infer<typeof IndexedFileSchema>;

export const IndexCacheStatsSchema = z.object({
  status: z.enum(["hit", "miss", "partial", "disabled"]),
  filesReused: z.number().int().nonnegative(),
  filesAnalyzed: z.number().int().nonnegative(),
});

export type IndexCacheStats = z.infer<typeof IndexCacheStatsSchema>;

export const IndexSnapshotSchema = z.object({
  repoId: z.string().min(1),
  rootPath: z.string().min(1),
  indexedAt: z.string().datetime(),
  files: z.array(IndexedFileSchema),
  stats: IndexFileStatsSchema,
  warnings: z.array(z.string()).default([]),
  cache: IndexCacheStatsSchema.optional(),
});

export type IndexSnapshot = z.infer<typeof IndexSnapshotSchema>;

/** Open string registry for graph node/edge kinds (domain builders in M-010+). */
export const GraphNodeDtoSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  label: z.string().min(1),
  attrs: z.record(z.string(), JsonValueSchema).optional(),
});

export type GraphNodeDto = z.infer<typeof GraphNodeDtoSchema>;

/** How sure an import/call/membership edge is (M-069 Honest Edges). */
export const EdgeProvenanceSchema = z.enum([
  "measured",
  "heuristic",
  "inferred",
]);
export type EdgeProvenance = z.infer<typeof EdgeProvenanceSchema>;

export const GraphEdgeDtoSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  attrs: z.record(z.string(), JsonValueSchema).optional(),
  /** Absent on edges that predate M-069. */
  provenance: EdgeProvenanceSchema.optional(),
});

export type GraphEdgeDto = z.infer<typeof GraphEdgeDtoSchema>;

export const GraphSnapshotDtoSchema = z.object({
  id: z.string().min(1),
  nodes: z.array(GraphNodeDtoSchema),
  edges: z.array(GraphEdgeDtoSchema),
});

export type GraphSnapshotDto = z.infer<typeof GraphSnapshotDtoSchema>;

/** Count + short sample of imports that did not resolve into the graph. */
export const UnresolvedImportsSummarySchema = z.object({
  count: z.number().int().nonnegative(),
  sample: z.array(z.string().min(1)),
});

export type UnresolvedImportsSummary = z.infer<
  typeof UnresolvedImportsSummarySchema
>;

/**
 * Dependency graph DTO: graph snapshot plus unresolved-import honesty
 * (M-056 / P-A1). Additive over {@link GraphSnapshotDtoSchema}.
 */
export const DependencyGraphDtoSchema = GraphSnapshotDtoSchema.extend({
  unresolvedImports: UnresolvedImportsSummarySchema.optional(),
});

export type DependencyGraphDto = z.infer<typeof DependencyGraphDtoSchema>;

/** Open registry — well-known ids documented in `stack.ts` / ADR-0007. */
export const StackSignalSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  confidence: z.number().min(0).max(1),
  personas: z.array(z.string().min(1)).default([]),
  evidence: z.array(z.string().min(1)).default([]),
});

export type StackSignal = z.infer<typeof StackSignalSchema>;

/** Single-root stack profile fields (no package rollup). */
export const StackProfileCoreSchema = z.object({
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  signals: z.array(StackSignalSchema),
  domains: z.array(z.string().min(1)),
  personas: z.array(z.string().min(1)),
  summary: z.string().min(1),
});

export type StackProfileCore = z.infer<typeof StackProfileCoreSchema>;

/** Per-package profile entry inside a workspace rollup (M-041 Mono-v1). */
export const StackPackageProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  /** Repo-relative package root (`""` = workspace root package). */
  rootDir: z.string(),
  profile: StackProfileCoreSchema,
});

export type StackPackageProfile = z.infer<typeof StackPackageProfileSchema>;

export const StackProfileSchema = StackProfileCoreSchema.extend({
  /** Present on workspace rollups; empty for single-root detect. */
  packages: z.array(StackPackageProfileSchema).default([]),
});

export type StackProfile = z.infer<typeof StackProfileSchema>;

/** Confidence-ranked domain entry (M-046). */
export const RankedDomainSchema = z.object({
  id: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const DnaReportSchema = z.object({
  languages: z.array(
    z.object({
      id: z.string(),
      share: z.number().min(0).max(1),
    }),
  ),
  frameworks: z.array(z.string()),
  packageManager: z.string().optional(),
  summary: z.string().min(1),
  /** Stack Detector SPI profile (M-013+). */
  stack: StackProfileSchema.optional(),
  /** Architecture style hints (explainable heuristics). */
  architectureHints: z.array(z.string()).default([]),
  /** Detected test runners (local markers only). */
  testRunners: z.array(z.string()).default([]),
  /** Domains ranked by aggregated signal confidence (desc). */
  rankedDomains: z.array(RankedDomainSchema).default([]),
  /** Top ranked domain id, when any domains are present. */
  primaryDomain: z.string().min(1).optional(),
});

export type DnaReport = z.infer<typeof DnaReportSchema>;

export const FeatureInfoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  confidence: z.number().min(0).max(1),
  memberFiles: z.array(z.string()),
  evidence: z.array(z.string()),
  /**
   * How the feature was discovered (ADR-0029 / M-061).
   * Community-detection fallbacks use `"inferred"` with confidence ≤ 0.5.
   */
  provenance: SignalProvenanceSchema.optional(),
});

export type FeatureInfo = z.infer<typeof FeatureInfoSchema>;

export const KnowledgeGraphStatsSchema = z.object({
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  nodesByKind: z.record(z.string(), z.number().int().nonnegative()),
  edgesByKind: z.record(z.string(), z.number().int().nonnegative()),
});

export type KnowledgeGraphStats = z.infer<typeof KnowledgeGraphStatsSchema>;

export const PrismCapabilitiesDtoSchema = z.object({
  indexing: z.boolean(),
  analysis: z.boolean(),
  graphs: z.boolean(),
  intelligence: z.boolean(),
  impact: z.boolean(),
  navigation: z.boolean(),
});

export type PrismCapabilitiesDto = z.infer<typeof PrismCapabilitiesDtoSchema>;

/** Core Web Vital ids (FE-02; extensible). */
export const CwvMetricIdSchema = z.enum(["LCP", "CLS", "INP", "FCP", "TTFB"]);

export const CwvRatingSchema = z.enum([
  "good",
  "needs-improvement",
  "poor",
  "unknown",
]);

export const CwvMetricSchema = z.object({
  id: CwvMetricIdSchema,
  value: z.number(),
  unit: z.string().min(1),
  /** Omitted in ingest → treated as unknown (always present on parsed DTO). */
  rating: CwvRatingSchema.optional().transform((r) => r ?? "unknown"),
});

export const CwvAttributionSchema = z.object({
  app: z.string().optional(),
  route: z.string().optional(),
  chunk: z.string().optional(),
  /** Only when attributable — never invent (ADR-0008 D2). */
  component: z.string().optional(),
  metricId: CwvMetricIdSchema.optional(),
  note: z.string().optional(),
});

export const CwvInsightSeveritySchema = z.enum([
  "pain",
  "improve",
  "good",
  "info",
]);

/** Actionable lab finding from a Lighthouse audit (element / opportunity). */
export const CwvInsightSchema = z.object({
  id: z.string().min(1),
  metricId: CwvMetricIdSchema.optional(),
  severity: CwvInsightSeveritySchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  auditId: z.string().optional(),
});

export const CwvRollupBucketSchema = z.object({
  key: z.string().min(1),
  level: z.enum(["app", "route", "chunk", "component"]),
  metrics: z.array(CwvMetricSchema),
  sampleCount: z.number().int().nonnegative(),
});

export const CwvReportSchema = z.object({
  url: z.string().min(1),
  collectedAt: z.string().datetime(),
  /**
   * `pagespeed` — PageSpeed Insights response: metrics are CrUX **field**
   * (p75), while categoryScores/insights come from the embedded Lighthouse
   * **lab** run. UI-local only; never written to the ingest store.
   */
  source: z.enum(["lighthouse", "ingest", "lab-fixture", "pagespeed"]),
  port: z.number().int().positive().optional(),
  /** Lab form factor the run measured (mobile simulated throttling by default). */
  formFactor: z.enum(["mobile", "desktop"]).optional(),
  callout: z.string().min(1),
  metrics: z.array(CwvMetricSchema),
  /** LH category scores 0–1 when present (FE-05 later; optional now). */
  categoryScores: z.record(z.string(), z.number().min(0).max(1)).default({}),
  attributions: z.array(CwvAttributionSchema).default([]),
  rollups: z.array(CwvRollupBucketSchema).default([]),
  /** Total Blocking Time (ms) — lab proxy for responsiveness when INP is absent. */
  tbtMs: z.number().nonnegative().optional(),
  /** Element / opportunity insights derived from LHR audits (never fabricated). */
  insights: z.array(CwvInsightSchema).default([]),
  /**
   * Reliability warnings — e.g. a metric value beyond physical plausibility
   * (LCP > 60s) means the measurement environment broke, not the page. The UI
   * must surface these instead of rendering the numbers as clean results.
   */
  warnings: z.array(z.string()).default([]),
});

export const BundleBundlerSchema = z.enum([
  "webpack",
  "rollup",
  "vite",
  "esbuild",
  "next",
  "unknown",
]);

export const BundleAnalyzeStrategySchema = z.enum([
  "project-script",
  "prism-managed",
  "none",
]);

export const BundleAnalyzeScriptInfoSchema = z.object({
  packageId: z.string().optional(),
  packagePath: z.string().min(1),
  packageName: z.string().optional(),
  scriptName: z.string().min(1),
  command: z.string().min(1),
});

export const BundleAnalyzePackageInfoSchema = z.object({
  packageId: z.string().min(1),
  packagePath: z.string().min(1),
  packageName: z.string().min(1),
  hasAnalyzeScript: z.boolean(),
  bundler: BundleBundlerSchema.default("unknown"),
  analyzers: z.array(z.string()).default([]),
});

/** Detected capacity to run / parse frontend bundle analyze (M-050). */
export const BundleAnalyzeCapabilitySchema = z.object({
  supported: z.boolean(),
  reason: z.string().optional(),
  preferredStrategy: BundleAnalyzeStrategySchema,
  scripts: z.array(BundleAnalyzeScriptInfoSchema).default([]),
  bundlers: z.array(BundleBundlerSchema).default([]),
  packages: z.array(BundleAnalyzePackageInfoSchema).default([]),
});

/** Which CWV source DomainScreen / getDomainReport prefers (M-053). */
export const CwvPreferredSourceSchema = z.enum(["local", "pagespeed"]);

export const FrontendRouteBreakdownRowSchema = z.object({
  route: z.string().min(1),
  measured: z.boolean(),
  linked: z.boolean(),
  sampleCount: z.number().int().nonnegative(),
  metricCount: z.number().int().nonnegative(),
  metrics: z.array(CwvMetricSchema),
  rating: CwvRatingSchema,
  notes: z.array(z.string()),
});

export const FrontendComponentBreakdownRowSchema = z.object({
  key: z.string().min(1),
  sampleCount: z.number().int().nonnegative(),
  rating: CwvRatingSchema,
  metrics: z.array(CwvMetricSchema),
});

export const FrontendDomainCwvBundleSchema = z.object({
  preferredSource: CwvPreferredSourceSchema,
  local: CwvReportSchema.nullable(),
  pagespeed: CwvReportSchema.nullable(),
  primary: CwvReportSchema.nullable(),
});

/**
 * Frontend domain aggregation (M-053 T-08). Surfaces render this instead of
 * re-deriving route/component breakdowns inside DomainScreen.
 */
export const FrontendDomainReportSchema = z.object({
  domain: z.literal("frontend"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  routes: z.array(z.string().min(1)),
  cwv: FrontendDomainCwvBundleSchema,
  routeBreakdown: z.array(FrontendRouteBreakdownRowSchema),
  componentBreakdown: z.array(FrontendComponentBreakdownRowSchema),
  /** Lighthouse category scores 0–1 from the primary CWV report (may be empty). */
  categoryScores: z.record(z.string(), z.number().min(0).max(1)),
  bundleCapability: BundleAnalyzeCapabilitySchema.optional(),
});

/**
 * Shared ranking / link rows used across domain reports (M-053 T-10).
 * `DomainReportSchema` is declared after {@link BackendReportSchema}.
 */

export const DomainKindCountSchema = z.object({
  kind: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const DomainRankedNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string(),
  kind: z.string().min(1),
  deps: z.number().int().nonnegative(),
});

export const DomainChurnRowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string(),
  kind: z.string().min(1),
  commits: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});

export const DomainStackSnapshotSchema = z.object({
  frameworks: z.array(z.string()),
  signals: z.array(StackSignalSchema),
  detected: z.boolean(),
});

export const DomainOverlayLinkSchema = z.object({
  id: z.string().min(1),
  kind: z.string().optional(),
  fromLabel: z.string(),
  toLabel: z.string(),
  fromKind: z.string(),
  toKind: z.string(),
});

export const UtilityOverlayFindingSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
  severity: z.enum(["info", "low", "medium", "high"]).default("info"),
});

/** Auth / exposure inference for a backend route (M-044 / ADR-0015). */
export const BackendAuthExposureSchema = z.enum([
  "public",
  "authenticated",
  "unknown",
]);

export const BackendFrameworkSchema = z.enum([
  "express",
  "nest",
  "fastify",
  "trpc",
  "graphql",
  "grpc",
  "unknown",
]);

/** Single HTTP endpoint extracted from source (route-granular). */
export const BackendEndpointSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  path: z.string().min(1),
  handlerFile: z.string().min(1),
  /** Function / method name when extractable from the handler AST. */
  handlerName: z.string().min(1).optional(),
  framework: BackendFrameworkSchema,
  auth: BackendAuthExposureSchema,
  tested: z.boolean(),
  testFiles: z.array(z.string().min(1)).default([]),
  /** True when this handler file reaches a detected data-layer symbol/path. */
  dataLayer: z.boolean().default(false),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
  /** Optional link into the api-surface overlay graph. */
  overlayNodeId: z.string().min(1).optional(),
});

export type BackendEndpoint = z.infer<typeof BackendEndpointSchema>;

export const BackendDataLayerItemSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["model", "migration", "sql", "client"]),
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export const BackendEnvVarSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export const BackendIntegrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export const BackendBackgroundJobSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["queue", "worker", "cron"]),
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

/**
 * Typed backend domain report (M-044 / ADR-0015 Option C).
 * Complements the generic `api-surface` overlay used by Map.
 */
export const BackendReportSchema = z.object({
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  frameworksDetected: z.array(BackendFrameworkSchema).default([]),
  endpoints: z.array(BackendEndpointSchema).default([]),
  dataLayer: z.array(BackendDataLayerItemSchema).default([]),
  envVars: z.array(BackendEnvVarSchema).default([]),
  integrations: z.array(BackendIntegrationSchema).default([]),
  background: z.array(BackendBackgroundJobSchema).default([]),
});

export type BackendReport = z.infer<typeof BackendReportSchema>;

export const BackendCoverageSchema = z.object({
  total: z.number().int().nonnegative(),
  tested: z.number().int().nonnegative(),
  untested: z.array(BackendEndpointSchema),
});

export const BackendDataLayerCountsSchema = z.object({
  model: z.number().int().nonnegative(),
  migration: z.number().int().nonnegative(),
  sql: z.number().int().nonnegative(),
  client: z.number().int().nonnegative(),
});

/**
 * Backend domain aggregation (M-053 T-10). Wraps {@link BackendReport} plus
 * inbound / churn rankings DomainScreen used to compute locally.
 */
export const BackendDomainReportSchema = z.object({
  domain: z.literal("backend"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  backend: BackendReportSchema,
  coverage: BackendCoverageSchema,
  mostDepended: z.array(DomainRankedNodeSchema),
  churn: z.array(DomainChurnRowSchema),
  kindCounts: z.array(DomainKindCountSchema),
  dataLayerByKind: BackendDataLayerCountsSchema,
});

export const DevopsTilesSchema = z.object({
  iacResources: z.number().int().nonnegative(),
  pipelines: z.number().int().nonnegative(),
  containers: z.number().int().nonnegative(),
  kubernetes: z.number().int().nonnegative(),
});

/**
 * DevOps domain aggregation (M-053 T-10). Local overlay + CI heuristic
 * findings only — GitHub Actions network I/O stays in DomainScreen (T-11).
 */
export const DevopsDomainReportSchema = z.object({
  domain: z.literal("devops_platform"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  overlaySummary: z.string(),
  kindCounts: z.array(DomainKindCountSchema),
  tiles: DevopsTilesSchema,
  findings: z.array(UtilityOverlayFindingSchema),
});

export const MobileScreenCoverageSchema = z.object({
  total: z.number().int().nonnegative(),
  tested: z.number().int().nonnegative(),
  untestedIds: z.array(z.string().min(1)),
});

export const MobileTilesSchema = z.object({
  screens: z.number().int().nonnegative(),
  navigators: z.number().int().nonnegative(),
  expoRouter: z.number().int().nonnegative(),
  untested: z.number().int().nonnegative(),
});

/**
 * Mobile domain aggregation (M-053 T-10).
 */
export const MobileDomainReportSchema = z.object({
  domain: z.literal("mobile"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  tiles: MobileTilesSchema,
  screenCoverage: MobileScreenCoverageSchema,
  screenMostDepended: z.array(DomainRankedNodeSchema),
  screenChurn: z.array(DomainChurnRowSchema),
  stack: DomainStackSnapshotSchema.nullable(),
  navLinks: z.array(DomainOverlayLinkSchema),
  kindCounts: z.array(DomainKindCountSchema),
});

export const DesktopIpcChannelSchema = z.object({
  name: z.string().min(1),
  source: z.string().min(1),
  path: z.string(),
  risk: z.enum(["low", "medium"]),
});

export const DesktopTilesSchema = z.object({
  main: z.number().int().nonnegative(),
  renderer: z.number().int().nonnegative(),
  ipc: z.number().int().nonnegative(),
  preload: z.number().int().nonnegative(),
  tauriConfig: z.number().int().nonnegative(),
});

/**
 * Desktop domain aggregation (M-053 T-10).
 */
export const DesktopDomainReportSchema = z.object({
  domain: z.literal("desktop"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  tiles: DesktopTilesSchema,
  mostDepended: z.array(DomainRankedNodeSchema),
  churn: z.array(DomainChurnRowSchema),
  stack: DomainStackSnapshotSchema.nullable(),
  boundaryLinks: z.array(DomainOverlayLinkSchema),
  ipcChannels: z.array(DesktopIpcChannelSchema),
  kindCounts: z.array(DomainKindCountSchema),
});

/**
 * Data / ML domain aggregation (M-053 T-10). Overlay kind counts + DNA stack.
 */
export const DataMlAiDomainReportSchema = z.object({
  domain: z.literal("data_ml_ai"),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  overlaySummary: z.string(),
  nodeCount: z.number().int().nonnegative(),
  kindCounts: z.array(DomainKindCountSchema),
  findings: z.array(UtilityOverlayFindingSchema),
  stack: DomainStackSnapshotSchema.nullable(),
});

/**
 * Discriminated union of domain reports (M-053 Phase 2).
 */
export const DomainReportSchema = z.discriminatedUnion("domain", [
  FrontendDomainReportSchema,
  BackendDomainReportSchema,
  DevopsDomainReportSchema,
  MobileDomainReportSchema,
  DesktopDomainReportSchema,
  DataMlAiDomainReportSchema,
]);

/** Suite kind for TestingReport (M-046 / ADR-0022). */
export const TestingSuiteKindSchema = z.enum([
  "unit",
  "integration",
  "e2e",
  "other",
]);

export const TestingSuiteSchema = z.object({
  kind: TestingSuiteKindSchema,
  path: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
});

export const TestingCoverageSchema = z.object({
  present: z.boolean(),
  /**
   * Covered percent 0–100. What is counted depends on `metric`: LCOV reports
   * lines, Istanbul `coverage-final.json` reports statements.
   */
  linePct: z.number().min(0).max(100).optional(),
  /**
   * What `linePct` counts. Absent reads as `"lines"` (the original LCOV-only
   * behaviour).
   */
  metric: z.enum(["lines", "statements"]).optional(),
  source: z.string().min(1),
});

/** Outcome of a single test after a `Run tests` invocation (M-046 tweak). */
export const TestingTestStatusSchema = z.enum([
  "passing",
  "failing",
  "skipped",
  "unknown",
]);

export const TestingTestResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1),
  suite: z.string().min(1).optional(),
  status: TestingTestStatusSchema,
  durationMs: z.number().nonnegative().optional(),
});

/** Local testing structure + optional on-disk coverage (M-046 / ADR-0022). */
export const TestingReportSchema = z.object({
  score: z.number().min(0).max(100),
  runners: z.array(z.string().min(1)).default([]),
  suites: z.array(TestingSuiteSchema).default([]),
  coverage: TestingCoverageSchema.optional(),
  /** Per-test outcomes, populated after a `Run tests` invocation. */
  results: z.array(TestingTestResultSchema).default([]),
  /** ISO timestamp of the last local test run that produced `results`. */
  lastRunAt: z.string().min(1).optional(),
  summary: z.string().min(1),
});

export type TestingReport = z.infer<typeof TestingReportSchema>;

/** Code Explorer selection target (M-023 / ADR-0018). */
export const CodeExplorerTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("symbol"),
    name: z.string().min(1),
    path: z.string().min(1).optional(),
    start: z.number().int().nonnegative().optional(),
  }),
]);

export type CodeExplorerTarget = z.infer<typeof CodeExplorerTargetSchema>;

/** Usage / reference hit promoted to a Zod DTO for explorer reports. */
export const CodeExplorerUsageSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  path: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  targetSymbolId: z.string().min(1).nullable(),
});

export type CodeExplorerUsage = z.infer<typeof CodeExplorerUsageSchema>;

export const CodeExplorerOwnerSchema = z.object({
  author: z.string().min(1),
  email: z.string().optional(),
  commits: z.number().int().nonnegative(),
  share: z.number().min(0).max(1),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
});

export type CodeExplorerOwner = z.infer<typeof CodeExplorerOwnerSchema>;

export const CodeExplorerOwnershipSchema = z.object({
  gitAvailable: z.boolean(),
  primary: CodeExplorerOwnerSchema.optional(),
  contributors: z.array(CodeExplorerOwnerSchema).default([]),
  note: z.string().min(1).optional(),
});

export type CodeExplorerOwnership = z.infer<typeof CodeExplorerOwnershipSchema>;

export const CodeExplorerRelatedItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1).optional(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1).optional(),
});

export type CodeExplorerRelatedItem = z.infer<
  typeof CodeExplorerRelatedItemSchema
>;

export const CodeExplorerRelatedSchema = z.object({
  features: z.array(CodeExplorerRelatedItemSchema).default([]),
  tests: z.array(CodeExplorerRelatedItemSchema).default([]),
  apis: z.array(CodeExplorerRelatedItemSchema).default([]),
  components: z.array(CodeExplorerRelatedItemSchema).default([]),
});

export type CodeExplorerRelated = z.infer<typeof CodeExplorerRelatedSchema>;

export const CodeExplorerSimilarItemSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  kind: z.string().min(1),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
  symbolId: z.string().min(1).optional(),
});

export type CodeExplorerSimilarItem = z.infer<
  typeof CodeExplorerSimilarItemSchema
>;

export const CodeExplorerTimelineSchema = z.object({
  gitAvailable: z.boolean(),
  commits: z.array(GitCommitRefSchema).default([]),
  weeks: z.array(z.number().int().nonnegative()).default([]),
  note: z.string().min(1).optional(),
});

export type CodeExplorerTimeline = z.infer<typeof CodeExplorerTimelineSchema>;

/**
 * Selection-scoped Code Explorer report (M-023 / ADR-0018).
 */
export const CodeExplorerReportSchema = z.object({
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  target: CodeExplorerTargetSchema,
  /** Resolved file path for the selection (always set when target is valid). */
  path: z.string().min(1),
  usages: z.array(CodeExplorerUsageSchema).default([]),
  ownership: CodeExplorerOwnershipSchema,
  related: CodeExplorerRelatedSchema,
  similar: z.array(CodeExplorerSimilarItemSchema).default([]),
  timeline: CodeExplorerTimelineSchema,
});

export type CodeExplorerReport = z.infer<typeof CodeExplorerReportSchema>;

/** Exported symbol signature + 1-based line anchor (P2). */
export const ContextSignatureSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  /** One-line declaration, clipped; never a body. */
  signature: z.string().min(1),
  /** 1-based declaration line (`path:line` anchor). */
  line: z.number().int().positive(),
});
export type ContextSignature = z.infer<typeof ContextSignatureSchema>;

/** Optional top-1 body when the symbol spans ≤ 40 lines (P2). */
export const ContextBodySchema = z.object({
  name: z.string().min(1),
  line: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string().min(1),
});
export type ContextBody = z.infer<typeof ContextBodySchema>;

/**
 * One file in a `prepare_change` pack (P2): path, signatures + line anchors,
 * why. A body is allowed only for the top-ranked file's top symbol when it
 * spans ≤ 40 lines; otherwise agents fetch via `graph {mode:"symbol", body:true}`.
 */
export const ContextFileSchema = z.object({
  path: z.string().min(1),
  symbols: z.array(z.string()),
  signatures: z.array(ContextSignatureSchema).default([]),
  why: z.array(z.string()),
  /** How sure Prism is about this pick (plan P9). Omitted on legacy rows. */
  confidence: ImpactConfidenceSchema.optional(),
  /** The top pick, ahead of the next by a clear margin (round 4). */
  lead: z.literal(true).optional(),
  tokenWeight: z.number().int().nonnegative(),
  provenance: SignalProvenanceSchema,
  body: ContextBodySchema.optional(),
});
export type ContextFile = z.infer<typeof ContextFileSchema>;

export const ContextPackSchema = z.object({
  task: z.string(),
  files: z.array(ContextFileSchema),
  tokenEstimate: z.number().int().nonnegative(),
  tests: z.array(z.string()),
  /**
   * Ready commands for the first tests (token fix 1), from `cwd`. Never run
   * by Prism. Absent when no package can run them.
   */
  run: z.array(z.object({ cwd: z.string(), command: z.string() })).optional(),
  truncated: z.boolean(),
  totalCount: z.number().int().nonnegative(),
});
export type ContextPack = z.infer<typeof ContextPackSchema>;

export const ReuseHitSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1),
  kind: z.string().min(1),
  score: z.number().min(0).max(1),
  evidence: z.string(),
  provenance: SignalProvenanceSchema,
});
export type ReuseHit = z.infer<typeof ReuseHitSchema>;

export const HOUSE_STYLE_PATTERN_IDS = [
  "route-handler",
  "screen",
  "colocated-test",
  "worker",
] as const;
export type HouseStylePatternId = (typeof HOUSE_STYLE_PATTERN_IDS)[number];
export const HouseStylePatternIdSchema = z.enum(HOUSE_STYLE_PATTERN_IDS);

export const ExemplarSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1),
  patternId: HouseStylePatternIdSchema,
  whyCanonical: z.string().min(1),
});
export type Exemplar = z.infer<typeof ExemplarSchema>;

export const PrepareAmbiguousCandidateSchema = z.object({
  path: z.string().min(1),
  symbol: z.string().min(1),
  kind: z.string().min(1).optional(),
});
export type PrepareAmbiguousCandidate = z.infer<
  typeof PrepareAmbiguousCandidateSchema
>;

export const PrepareAmbiguousSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(PrepareAmbiguousCandidateSchema),
});
export type PrepareAmbiguous = z.infer<typeof PrepareAmbiguousSchema>;

/** A memory or ADR/`WHY:` hit for a pack file (M-075). Never a file body. */
export const PrepareNoteSchema = z.object({
  path: z.string().min(1),
  text: z.string().min(1),
  source: z.enum(["memory", "rationale"]),
  symbol: z.string().min(1).optional(),
  /** ADR or comment file the agent should open. */
  rationaleFor: z.string().min(1).optional(),
});
export type PrepareNote = z.infer<typeof PrepareNoteSchema>;

/**
 * One Prepare answer: pack + reuse + House Style. `order` is M-076 (work
 * order). `workingSet` stays null. `notes` is M-075 (memories + rationale_for).
 */
export const PrepareChangeSchema = z.object({
  pack: ContextPackSchema,
  reuse: z.array(ReuseHitSchema),
  conventions: z.array(ExemplarSchema).nullable(),
  notes: z.array(PrepareNoteSchema).optional(),
  order: WorkOrderSchema,
  workingSet: z.null(),
  generatedAt: z.string().datetime(),
  indexIndexedAt: z.string(),
  reuseProvenance: SignalProvenanceSchema,
  conventionsProvenance: SignalProvenanceSchema,
  ambiguous: PrepareAmbiguousSchema.nullable(),
  /** Present when the response was cut to fit its token budget (M-093). */
  trimmed: PrepareTrimmedSchema.optional(),
  /**
   * Present when the index behind this answer was capped (round 4): files
   * outside the analysed set are missing, so no pick is confident.
   */
  partialIndex: z
    .object({
      analyzed: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    })
    .optional(),
});
export type PrepareChange = z.infer<typeof PrepareChangeSchema>;

/** Whole-response token budget (M-093). Was a 4,000 map-token pack budget. */
export const DEFAULT_PREPARE_BUDGET = PREPARE_RESPONSE_BUDGET;

/** Map tokens for path + signatures + why (+ optional body). */
export function prepareMapTokenWeight(
  path: string,
  symbols: readonly string[],
  why: readonly string[],
  signatures: readonly {
    readonly signature: string;
    readonly line: number;
  }[] = [],
  bodyText?: string,
): number {
  const parts = [
    path,
    ...symbols,
    ...why,
    ...signatures.map((s) => `${s.signature}:${s.line}`),
  ];
  if (bodyText) parts.push(bodyText);
  const chars = parts.join(" ").length;
  return Math.max(1, Math.ceil(chars / 4));
}

/**
 * A queueable, re-scannable finding from a report (M-071 Finding Loop).
 * `fingerprint` is stable across re-scans of the same underlying issue, so
 * the loop can tell "job done" from "issue actually gone" (P-Q3).
 */
export const FindingRefSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  title: z.string().min(1),
  path: z.string().min(1).optional(),
  fingerprint: z.string().min(1),
});
export type FindingRef = z.infer<typeof FindingRefSchema>;

/** A `list_findings` row: the structured finding plus its mute/queue keys. */
export const ListedFindingSchema = FindingSchema.extend({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
});
export type ListedFinding = z.infer<typeof ListedFindingSchema>;

/** One muted finding, by fingerprint (M-074 B1). */
export const FindingMuteSchema = z.object({
  fingerprint: z.string().min(1),
  mutedAt: z.string().datetime(),
});
export type FindingMute = z.infer<typeof FindingMuteSchema>;

/** `.prism/finding-mutes.json` — gitignored, per-checkout (M-074 B1). */
export const FindingMuteStoreSchema = z.object({
  version: z.literal(1),
  mutes: z.array(FindingMuteSchema).default([]),
});
export type FindingMuteStore = z.infer<typeof FindingMuteStoreSchema>;

/**
 * The machine-checkable claims embedded in a generated AGENTS.md (M-073).
 * `--check` recomputes `dependency_cycles` and compares
 * against this snapshot rather than re-parsing prose.
 */
export const AgentsMdClaimsSchema = z.object({
  generatedAt: z.string().datetime(),
  cycles: z.array(z.array(z.string())),
});
export type AgentsMdClaims = z.infer<typeof AgentsMdClaimsSchema>;

export const AgentsMdIssueSchema = z.object({
  kind: z.enum(["missing", "stale-cycle", "unparsable"]),
  detail: z.string().min(1),
});
export type AgentsMdIssue = z.infer<typeof AgentsMdIssueSchema>;

export const AgentsMdCheckResultSchema = z.object({
  ok: z.boolean(),
  path: z.string(),
  checkedAt: z.string().datetime(),
  issues: z.array(AgentsMdIssueSchema),
});
export type AgentsMdCheckResult = z.infer<typeof AgentsMdCheckResultSchema>;

export const AgentsMdGenerateResultSchema = z.object({
  path: z.string(),
  content: z.string(),
});
export type AgentsMdGenerateResult = z.infer<
  typeof AgentsMdGenerateResultSchema
>;

/**
 * A job's accumulated context across resumes (M-073 W1/W2). `jobId` is
 * absent for the standalone, workspace-keyed working set used by inline
 * (non-dispatch) sessions.
 */
export const WorkingSetSchema = z.object({
  jobId: z.string().optional(),
  files: z.array(z.string()).default([]),
  symbols: z.array(z.string()).default([]),
  decisions: z.array(z.string()).default([]),
  neighbors: z.array(z.string()).default([]),
});
export type WorkingSet = z.infer<typeof WorkingSetSchema>;

/** Parse unknown JSON into a DTO; returns Zod issues as message. */
export function parseDto<Schema extends z.ZodTypeAny>(
  schema: Schema,
  data: unknown,
): { ok: true; value: z.output<Schema> } | { ok: false; message: string } {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  const message = parsed.error.issues.map((i) => i.message).join("; ");
  return { ok: false, message };
}
