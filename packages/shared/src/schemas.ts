import { z } from "zod";
import { PrismErrorCode } from "./errors.js";
import { SignalProvenanceSchema } from "./provenance.js";
import { RiskBandSchema } from "./risk-bands.js";

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

/** Explainable input row for a health factor (M-046). */
export const HealthFactorBreakdownItemSchema = z.object({
  label: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

export type HealthFactorBreakdownItem = z.infer<
  typeof HealthFactorBreakdownItemSchema
>;

export const HealthFactorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  score: z.number().min(0).max(100),
  note: z.string().optional(),
  /** Optional explainable inputs (counts, ratios, etc.). */
  breakdown: z.array(HealthFactorBreakdownItemSchema).optional(),
});

export type HealthFactor = z.infer<typeof HealthFactorSchema>;

export const HealthScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  factors: z.array(HealthFactorSchema),
});

export type HealthScore = z.infer<typeof HealthScoreSchema>;

/** Single point on the health-over-time chart (M-046 / ADR-0023). */
export const HealthHistoryPointSchema = z.object({
  at: z.string().min(1),
  commitSha: z.string().min(1).optional(),
  score: z.number().min(0).max(100),
  factors: z
    .array(
      z.object({
        id: z.string().min(1),
        score: z.number().min(0).max(100),
      }),
    )
    .optional(),
  /**
   * Backfilled points stamp a historical commit onto the *current* index's
   * health, so the timestamp is real but the score was not computed at that
   * commit. They are `"estimated"`; points sampled live are `"measured"`
   * (ADR-0029). Absent reads as `"heuristic"` for older cached history.
   */
  provenance: SignalProvenanceSchema.optional(),
});

export type HealthHistoryPoint = z.infer<typeof HealthHistoryPointSchema>;

/** Region scores captured alongside a health history point. */
export const RegionHealthPointSchema = z.object({
  at: z.string().min(1),
  commitSha: z.string().min(1).optional(),
  /** Inherited from the health history point this was captured alongside. */
  provenance: SignalProvenanceSchema.optional(),
  regions: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      score: z.number().min(0).max(100),
      files: z.number().int().nonnegative(),
    }),
  ),
});

export type RegionHealthPoint = z.infer<typeof RegionHealthPointSchema>;

export const HealthHistoryReportSchema = z.object({
  points: z.array(HealthHistoryPointSchema),
});

export type HealthHistoryReport = z.infer<typeof HealthHistoryReportSchema>;

const RegionMoverEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  fromScore: z.number().min(0).max(100),
  toScore: z.number().min(0).max(100),
  delta: z.number(),
});

export const RegionMoversReportSchema = z.object({
  improving: z.array(RegionMoverEntrySchema),
  regressing: z.array(RegionMoverEntrySchema),
});

export type RegionMoversReport = z.infer<typeof RegionMoversReportSchema>;

/** Async git-history backfill job status for Trends (ADR-0023). */
export const HealthHistoryBackfillStatusSchema = z.object({
  status: z.enum(["idle", "running", "done", "error"]),
  progress: z.number().min(0).max(1),
  message: z.string(),
});

export type HealthHistoryBackfillStatus = z.infer<
  typeof HealthHistoryBackfillStatusSchema
>;

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
  kind: z.enum(["entrypoint", "package-root", "feature", "config"]),
  note: z.string().optional(),
});

export type Landmark = z.infer<typeof LandmarkSchema>;

/** Map zoom levels (repo → symbol). Design system ZoomRail. */
export const MapZoomLevelSchema = z.enum([
  "repo",
  "package",
  "feature",
  "file",
  "symbol",
]);

export type MapZoomLevel = z.infer<typeof MapZoomLevelSchema>;

/** Product Map layer ids (M-017); overlays may add more later. */
export const MapLayerIdSchema = z.enum([
  "architecture",
  "dependency",
  "activity",
  "ownership",
  "debt",
  "risk",
  "performance",
  "coverage",
]);

export type MapLayerId = z.infer<typeof MapLayerIdSchema>;

export const MapLayerDescriptorSchema = z.object({
  id: MapLayerIdSchema,
  label: z.string().min(1),
  description: z.string().min(1),
  /** True when layer has real data in this model build. */
  available: z.boolean(),
  /** Stub until later milestones (e.g. activity → M-022). */
  stub: z.boolean().default(false),
});

export type MapLayerDescriptor = z.infer<typeof MapLayerDescriptorSchema>;

export const MapClusterSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  zoom: MapZoomLevelSchema,
  memberNodeIds: z.array(z.string().min(1)),
  /** Child zoom level when drilling in. */
  childZoom: MapZoomLevelSchema.optional(),
});

export type MapCluster = z.infer<typeof MapClusterSchema>;

export const MapBookmarkSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  path: z.string().min(1).optional(),
  nodeId: z.string().min(1).optional(),
  zoom: MapZoomLevelSchema.optional(),
  createdAt: z.string().datetime(),
  note: z.string().optional(),
});

export type MapBookmark = z.infer<typeof MapBookmarkSchema>;

export const MapBookmarkStoreSchema = z.object({
  version: z.literal(1),
  bookmarks: z.array(MapBookmarkSchema).default([]),
});

export type MapBookmarkStore = z.infer<typeof MapBookmarkStoreSchema>;

export const MapSearchHitSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum([
    "node",
    "cluster",
    "landmark",
    "bookmark",
    "feature",
    "file",
    "symbol",
  ]),
  path: z.string().optional(),
  zoom: MapZoomLevelSchema.optional(),
});

export type MapSearchHit = z.infer<typeof MapSearchHitSchema>;

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
  totalCommits: z.number().int().nonnegative().default(0),
  windowCommits: z.number().int().nonnegative().default(0),
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

/* -------------------------------------------------------------------------
 * Overview dashboard model (M-052)
 *
 * These derivations lived in the app-shell React layer, which put Prism's
 * headline numbers out of reach of MCP, the CLI and any script. Colours and
 * chart geometry stayed behind in the surface — only the facts moved.
 * ---------------------------------------------------------------------- */

/** Coupling density band. Target is `low` (density below 0.5). */
export const OverviewCouplingBandSchema = z.enum(["low", "medium", "high"]);

export type OverviewCouplingBand = z.infer<typeof OverviewCouplingBandSchema>;

export const OverviewCouplingSchema = z.object({
  /** Edges ÷ nodes; 0 for an empty graph. */
  density: z.number().nonnegative(),
  band: OverviewCouplingBandSchema,
});

export type OverviewCoupling = z.infer<typeof OverviewCouplingSchema>;

export const OverviewRegionSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  files: z.number().int().nonnegative(),
  degree: z.number().int().nonnegative(),
  /**
   * Coupling-aware health, 0–100. `null` when the region has neither files
   * nor edges — no evidence, so no score (ADR-0029).
   */
  score: z.number().min(0).max(100).nullable(),
});

export type OverviewRegion = z.infer<typeof OverviewRegionSchema>;

export const OverviewConnectedNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  degree: z.number().int().nonnegative(),
});

export type OverviewConnectedNode = z.infer<typeof OverviewConnectedNodeSchema>;

export const OverviewActivitySchema = z.object({
  /** Commit counts per bucket, zero-filled across the whole window. */
  buckets: z.array(z.number().int().nonnegative()),
  /** UTC-midnight epoch-ms at the start of each bucket. */
  starts: z.array(z.number()),
  total: z.number().int().nonnegative(),
  granularity: z.enum(["day", "week"]),
});

export type OverviewActivity = z.infer<typeof OverviewActivitySchema>;

export const OverviewTotalsSchema = z.object({
  nodes: z.number().int().nonnegative(),
  edges: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  regions: z.number().int().nonnegative(),
});

export type OverviewTotals = z.infer<typeof OverviewTotalsSchema>;

export const OverviewModelSchema = z.object({
  totals: OverviewTotalsSchema,
  coupling: OverviewCouplingSchema,
  regions: z.array(OverviewRegionSchema),
  mostConnected: z.array(OverviewConnectedNodeSchema),
  /** `null` when git is unavailable — distinct from a window with no commits. */
  activity: OverviewActivitySchema.nullable(),
});

export type OverviewModel = z.infer<typeof OverviewModelSchema>;

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
  /** Lite scenario pack: tests to run / configs·CI touching this. */
  scenarioChecklist: z.array(ScenarioChecklistSectionSchema).optional(),
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

export const TestImpactReportSchema = z.object({
  origin: ChangeOriginSchema,
  /** Test files transitively reachable from the change. */
  tests: z.array(BlastRadiusItemSchema),
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
});

export type ChangeReviewReport = z.infer<typeof ChangeReviewReportSchema>;

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
});

export type IndexedImport = z.infer<typeof IndexedImportSchema>;

export const IndexedExportSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  start: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  source: z.string().min(1).optional(),
});

export type IndexedExport = z.infer<typeof IndexedExportSchema>;

export const IndexedReferenceSchema = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
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

export const GraphEdgeDtoSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  attrs: z.record(z.string(), JsonValueSchema).optional(),
});

export type GraphEdgeDto = z.infer<typeof GraphEdgeDtoSchema>;

export const GraphSnapshotDtoSchema = z.object({
  id: z.string().min(1),
  nodes: z.array(GraphNodeDtoSchema),
  edges: z.array(GraphEdgeDtoSchema),
});

export type GraphSnapshotDto = z.infer<typeof GraphSnapshotDtoSchema>;

export const GraphLayoutPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type GraphLayoutPosition = z.infer<typeof GraphLayoutPositionSchema>;

export const GraphLayoutSchema = z.object({
  positions: z.record(z.string(), GraphLayoutPositionSchema),
});

export type GraphLayout = z.infer<typeof GraphLayoutSchema>;

/** Full Repository Map model for Playground / IDE (no React). */
export const RepositoryMapSchema = z.object({
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  zoom: MapZoomLevelSchema,
  layers: z.array(MapLayerDescriptorSchema),
  activeLayerIds: z.array(MapLayerIdSchema),
  graph: GraphSnapshotDtoSchema,
  layout: GraphLayoutSchema.optional(),
  clusters: z.array(MapClusterSchema).default([]),
  landmarks: z.array(LandmarkSchema).default([]),
  bookmarks: z.array(MapBookmarkSchema).default([]),
  searchIndex: z.array(MapSearchHitSchema).default([]),
  /** Aggregation rule notes for the current zoom. */
  clusteringNote: z.string().min(1),
  /** Repo-level local git summary (absent on non-git roots). */
  git: GitRepoSummarySchema.optional(),
});

export type RepositoryMap = z.infer<typeof RepositoryMapSchema>;

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

export type RankedDomain = z.infer<typeof RankedDomainSchema>;

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
  map: z.boolean(),
  navigation: z.boolean(),
});

export type PrismCapabilitiesDto = z.infer<typeof PrismCapabilitiesDtoSchema>;

export const IntelligenceConsistencyIssueSchema = z.object({
  code: z.literal("GRAPH_FILE_NOT_INDEXED"),
  graph: z.enum(["dependency", "knowledge", "feature"]),
  nodeId: z.string().min(1),
  path: z.string().min(1),
});

export type IntelligenceConsistencyIssue = z.infer<
  typeof IntelligenceConsistencyIssueSchema
>;

export const IntelligenceConsistencySchema = z.object({
  ok: z.boolean(),
  issues: z.array(IntelligenceConsistencyIssueSchema),
});

export type IntelligenceConsistency = z.infer<
  typeof IntelligenceConsistencySchema
>;

/** Aggregate Repository Intelligence report (M-014). */
export const IntelligenceReportSchema = z.object({
  repoId: z.string().min(1),
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  summary: IndexSummarySchema,
  dna: DnaReportSchema,
  dependencyGraph: GraphSnapshotDtoSchema,
  knowledgeGraph: GraphSnapshotDtoSchema,
  knowledgeStats: KnowledgeGraphStatsSchema,
  featureGraph: GraphSnapshotDtoSchema,
  features: z.array(FeatureInfoSchema),
  consistency: IntelligenceConsistencySchema,
  capabilities: PrismCapabilitiesDtoSchema,
});

export type IntelligenceReport = z.infer<typeof IntelligenceReportSchema>;

/** Measurement ingest kinds (extensible string registry). */
export const IngestArtifactKindSchema = z.string().min(1);

export type IngestArtifactKind = z.infer<typeof IngestArtifactKindSchema>;

export const IngestArtifactMetaSchema = z.object({
  id: z.string().min(1),
  kind: IngestArtifactKindSchema,
  storedAt: z.string().datetime(),
  /** Repo-relative path under `.prism/ingest/` (or override root). */
  relativePath: z.string().min(1),
  sourceJobId: z.string().min(1).optional(),
  packageId: z.string().min(1).optional(),
  labels: z.array(z.string()).default([]),
});

export type IngestArtifactMeta = z.infer<typeof IngestArtifactMetaSchema>;

export const IngestArtifactSchema = IngestArtifactMetaSchema.extend({
  /** Parsed JSON payload (schema varies by kind). */
  payload: JsonValueSchema,
});

export type IngestArtifact = z.infer<typeof IngestArtifactSchema>;

export const UtilityJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export type UtilityJobStatus = z.infer<typeof UtilityJobStatusSchema>;

export const UtilityJobProgressSchema = z.object({
  phase: z.string().min(1),
  percent: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  /**
   * Optional structured payload (e.g. progressive CWV during multi-route lab).
   * Shape is job-specific; consumers narrow via `detail.kind`.
   */
  detail: JsonValueSchema.optional(),
});

export type UtilityJobProgress = z.infer<typeof UtilityJobProgressSchema>;

export const UtilityJobKindSchema = z.string().min(1);

export type UtilityJobKind = z.infer<typeof UtilityJobKindSchema>;

export const UtilityJobSchema = z.object({
  id: z.string().min(1),
  kind: UtilityJobKindSchema,
  status: UtilityJobStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  progress: UtilityJobProgressSchema.optional(),
  /** Ingest artifact id when succeeded. */
  resultArtifactId: z.string().min(1).optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .optional(),
  packageId: z.string().min(1).optional(),
  /** True when the job requested network/consent-gated work. */
  requiresConsent: z.boolean().default(false),
  consentGranted: z.boolean().optional(),
});

export type UtilityJob = z.infer<typeof UtilityJobSchema>;

export const ConsentRecordSchema = z.object({
  purpose: z.string().min(1),
  granted: z.boolean(),
  decidedAt: z.string().datetime(),
});

export type ConsentRecord = z.infer<typeof ConsentRecordSchema>;

/** Persona-oriented UI/map defaults derived from stack (X-04). */
export const PersonaPresetsSchema = z.object({
  personas: z.array(z.string()),
  domains: z.array(z.string()),
  /** Suggested Map / insights emphasis ids. */
  mapPresets: z.array(z.string()),
  insightsPresets: z.array(z.string()),
  summary: z.string().min(1),
});

export type PersonaPresets = z.infer<typeof PersonaPresetsSchema>;

/** Core Web Vital ids (FE-02; extensible). */
export const CwvMetricIdSchema = z.enum(["LCP", "CLS", "INP", "FCP", "TTFB"]);

export type CwvMetricId = z.infer<typeof CwvMetricIdSchema>;

export const CwvRatingSchema = z.enum([
  "good",
  "needs-improvement",
  "poor",
  "unknown",
]);

export type CwvRating = z.infer<typeof CwvRatingSchema>;

export const CwvMetricSchema = z.object({
  id: CwvMetricIdSchema,
  value: z.number(),
  unit: z.string().min(1),
  /** Omitted in ingest → treated as unknown (always present on parsed DTO). */
  rating: CwvRatingSchema.optional().transform((r) => r ?? "unknown"),
});

export type CwvMetric = z.infer<typeof CwvMetricSchema>;

export const CwvAttributionSchema = z.object({
  app: z.string().optional(),
  route: z.string().optional(),
  chunk: z.string().optional(),
  /** Only when attributable — never invent (ADR-0008 D2). */
  component: z.string().optional(),
  metricId: CwvMetricIdSchema.optional(),
  note: z.string().optional(),
});

export type CwvAttribution = z.infer<typeof CwvAttributionSchema>;

export const CwvInsightSeveritySchema = z.enum([
  "pain",
  "improve",
  "good",
  "info",
]);

export type CwvInsightSeverity = z.infer<typeof CwvInsightSeveritySchema>;

/** Actionable lab finding from a Lighthouse audit (element / opportunity). */
export const CwvInsightSchema = z.object({
  id: z.string().min(1),
  metricId: CwvMetricIdSchema.optional(),
  severity: CwvInsightSeveritySchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  auditId: z.string().optional(),
});

export type CwvInsight = z.infer<typeof CwvInsightSchema>;

export const CwvRollupBucketSchema = z.object({
  key: z.string().min(1),
  level: z.enum(["app", "route", "chunk", "component"]),
  metrics: z.array(CwvMetricSchema),
  sampleCount: z.number().int().nonnegative(),
});

export type CwvRollupBucket = z.infer<typeof CwvRollupBucketSchema>;

export const CwvReportSchema = z.object({
  url: z.string().min(1),
  collectedAt: z.string().datetime(),
  source: z.enum(["lighthouse", "ingest", "lab-fixture"]),
  port: z.number().int().positive().optional(),
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
});

export type CwvReport = z.infer<typeof CwvReportSchema>;

/**
 * Progressive multi-route lab progress (`UtilityJobProgress.detail` when
 * `kind === "cwv-route-progress"`). Emitted after the primary route finishes
 * and after each subsequent route measurement.
 */
export const CwvRouteLabProgressDetailSchema = z.object({
  kind: z.literal("cwv-route-progress"),
  measuringRoute: z.string().nullable(),
  measuredRoutes: z.array(z.string().min(1)),
  /** Present once at least the primary route has finished measuring. */
  report: CwvReportSchema.optional(),
});

export type CwvRouteLabProgressDetail = z.infer<
  typeof CwvRouteLabProgressDetailSchema
>;

/** Frontend Bundle Weight (M-050 / FE-06) — real bundler stats only. */
export const BundleBytesSchema = z.object({
  raw: z.number().nonnegative(),
  gzip: z.number().nonnegative().optional(),
  brotli: z.number().nonnegative().optional(),
});

export type BundleBytes = z.infer<typeof BundleBytesSchema>;

export const BundleLoadTypeSchema = z.enum(["initial", "async", "unknown"]);

export type BundleLoadType = z.infer<typeof BundleLoadTypeSchema>;

export const BundleBundlerSchema = z.enum([
  "webpack",
  "rollup",
  "vite",
  "esbuild",
  "next",
  "unknown",
]);

export type BundleBundler = z.infer<typeof BundleBundlerSchema>;

export const BundleModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().optional(),
  /** Best-effort package name from node_modules path. */
  packageName: z.string().optional(),
  bytes: BundleBytesSchema,
  percentOfChunk: z.number().min(0).max(100).optional(),
});

export type BundleModule = z.infer<typeof BundleModuleSchema>;

export const BundleChunkSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  bytes: BundleBytesSchema,
  percentOfTotal: z.number().min(0).max(100),
  loadType: BundleLoadTypeSchema.default("unknown"),
  moduleCount: z.number().int().nonnegative().default(0),
  /** Top modules by size (capped); may be empty when stats lack module detail. */
  modules: z.array(BundleModuleSchema).default([]),
});

export type BundleChunk = z.infer<typeof BundleChunkSchema>;

export const BundlePackageRollupSchema = z.object({
  name: z.string().min(1),
  bytes: BundleBytesSchema,
  percentOfTotal: z.number().min(0).max(100),
  moduleCount: z.number().int().nonnegative(),
});

export type BundlePackageRollup = z.infer<typeof BundlePackageRollupSchema>;

export const BundleHighlightSeveritySchema = z.enum(["heavy", "warn", "info"]);

export type BundleHighlightSeverity = z.infer<
  typeof BundleHighlightSeveritySchema
>;

export const BundleHighlightSchema = z.object({
  id: z.string().min(1),
  severity: BundleHighlightSeveritySchema,
  title: z.string().min(1),
  detail: z.string().optional(),
  chunkId: z.string().optional(),
  moduleId: z.string().optional(),
});

export type BundleHighlight = z.infer<typeof BundleHighlightSchema>;

export const BundleBuildLabelSchema = z.object({
  packageName: z.string().optional(),
  packageId: z.string().optional(),
  bundler: BundleBundlerSchema.default("unknown"),
  mode: z.enum(["production", "development", "unknown"]).default("unknown"),
  timestamp: z.string().datetime(),
  scriptName: z.string().optional(),
});

export type BundleBuildLabel = z.infer<typeof BundleBuildLabelSchema>;

export const BundleWeightOverviewSchema = z.object({
  totalRaw: z.number().nonnegative(),
  totalGzip: z.number().nonnegative().optional(),
  totalBrotli: z.number().nonnegative().optional(),
  chunkCount: z.number().int().nonnegative(),
  initialRaw: z.number().nonnegative().default(0),
  asyncRaw: z.number().nonnegative().default(0),
  largestChunkName: z.string().optional(),
  largestChunkRaw: z.number().nonnegative().optional(),
});

export type BundleWeightOverview = z.infer<typeof BundleWeightOverviewSchema>;

export const BundleWeightThresholdsSchema = z.object({
  heavyChunkBytes: z.number().nonnegative(),
  heavyModuleBytes: z.number().nonnegative(),
});

export type BundleWeightThresholds = z.infer<
  typeof BundleWeightThresholdsSchema
>;

export const BundleWeightReportSchema = z.object({
  collectedAt: z.string().datetime(),
  source: z.enum(["analyze-script", "prism-managed", "ingest", "discovered"]),
  callout: z.string().min(1),
  build: BundleBuildLabelSchema,
  overview: BundleWeightOverviewSchema,
  chunks: z.array(BundleChunkSchema).default([]),
  packageRollups: z.array(BundlePackageRollupSchema).default([]),
  highlights: z.array(BundleHighlightSchema).default([]),
  thresholds: BundleWeightThresholdsSchema,
  /** When stats could not be produced — never fabricate sizes instead. */
  unsupportedReason: z.string().optional(),
});

export type BundleWeightReport = z.infer<typeof BundleWeightReportSchema>;

export const BundleAnalyzeStrategySchema = z.enum([
  "project-script",
  "prism-managed",
  "none",
]);

export type BundleAnalyzeStrategy = z.infer<typeof BundleAnalyzeStrategySchema>;

export const BundleAnalyzeScriptInfoSchema = z.object({
  packageId: z.string().optional(),
  packagePath: z.string().min(1),
  packageName: z.string().optional(),
  scriptName: z.string().min(1),
  command: z.string().min(1),
});

export type BundleAnalyzeScriptInfo = z.infer<
  typeof BundleAnalyzeScriptInfoSchema
>;

export const BundleAnalyzePackageInfoSchema = z.object({
  packageId: z.string().min(1),
  packagePath: z.string().min(1),
  packageName: z.string().min(1),
  hasAnalyzeScript: z.boolean(),
  bundler: BundleBundlerSchema.default("unknown"),
  analyzers: z.array(z.string()).default([]),
});

export type BundleAnalyzePackageInfo = z.infer<
  typeof BundleAnalyzePackageInfoSchema
>;

/** Detected capacity to run / parse frontend bundle analyze (M-050). */
export const BundleAnalyzeCapabilitySchema = z.object({
  supported: z.boolean(),
  reason: z.string().optional(),
  preferredStrategy: BundleAnalyzeStrategySchema,
  scripts: z.array(BundleAnalyzeScriptInfoSchema).default([]),
  bundlers: z.array(BundleBundlerSchema).default([]),
  packages: z.array(BundleAnalyzePackageInfoSchema).default([]),
});

export type BundleAnalyzeCapability = z.infer<
  typeof BundleAnalyzeCapabilitySchema
>;

/**
 * Well-known utility overlay kinds for Map / MCP (M-041 Gate A + P2–P7 / Mono-v2).
 * Open string registry — consumers should tolerate unknown kinds.
 */
export const UtilityOverlayKindSchema = z.enum([
  "api-surface",
  "mobile-nav",
  "desktop-boundary",
  "notebook-modules",
  "data-pipeline-dag",
  "iac-resources",
  "embedded-regions",
  "game-regions",
  "qa-test-gaps",
  "security-surface",
  "cross-package-impact",
  "domain-regions",
]);

export type UtilityOverlayKind = z.infer<typeof UtilityOverlayKindSchema>;

export const UtilityOverlayFindingSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  path: z.string().optional(),
  severity: z.enum(["info", "low", "medium", "high"]).default("info"),
});

export type UtilityOverlayFinding = z.infer<typeof UtilityOverlayFindingSchema>;

/** Map-facing layer descriptor agreed for M-017. */
export const UtilityMapLayerSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Stable domain color hint (hex or token); Map may theme further. */
  colorHint: z.string().min(1).optional(),
  nodeKinds: z.array(z.string().min(1)).default([]),
});

export type UtilityMapLayer = z.infer<typeof UtilityMapLayerSchema>;

/**
 * Domain utility overlay report — thin Map/MCP contract (ADR-0008).
 * `graph` is the drawable structure; `findings` are inspector callouts.
 */
export const UtilityOverlayReportSchema = z.object({
  kind: UtilityOverlayKindSchema,
  domain: z.string().min(1),
  rootPath: z.string().min(1),
  packageId: z.string().min(1).optional(),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  graph: GraphSnapshotDtoSchema,
  mapLayer: UtilityMapLayerSchema,
  findings: z.array(UtilityOverlayFindingSchema).default([]),
});

export type UtilityOverlayReport = z.infer<typeof UtilityOverlayReportSchema>;

export const UtilityOverlayKindInfoSchema = z.object({
  kind: UtilityOverlayKindSchema,
  domain: z.string().min(1),
  label: z.string().min(1),
  backlogIds: z.array(z.string().min(1)).default([]),
  /** When true, Core needs a prior `index()` (e.g. cross-package impact). */
  requiresIndex: z.boolean().default(false),
});

export type UtilityOverlayKindInfo = z.infer<
  typeof UtilityOverlayKindInfoSchema
>;

/** Auth / exposure inference for a backend route (M-044 / ADR-0015). */
export const BackendAuthExposureSchema = z.enum([
  "public",
  "authenticated",
  "unknown",
]);

export type BackendAuthExposure = z.infer<typeof BackendAuthExposureSchema>;

export const BackendFrameworkSchema = z.enum([
  "express",
  "nest",
  "fastify",
  "unknown",
]);

export type BackendFramework = z.infer<typeof BackendFrameworkSchema>;

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

export type BackendDataLayerItem = z.infer<typeof BackendDataLayerItemSchema>;

export const BackendEnvVarSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export type BackendEnvVar = z.infer<typeof BackendEnvVarSchema>;

export const BackendIntegrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1).optional(),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export type BackendIntegration = z.infer<typeof BackendIntegrationSchema>;

export const BackendBackgroundJobSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["queue", "worker", "cron"]),
  path: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export type BackendBackgroundJob = z.infer<typeof BackendBackgroundJobSchema>;

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

/** Suite kind for TestingReport (M-046 / ADR-0022). */
export const TestingSuiteKindSchema = z.enum([
  "unit",
  "integration",
  "e2e",
  "other",
]);

export type TestingSuiteKind = z.infer<typeof TestingSuiteKindSchema>;

export const TestingSuiteSchema = z.object({
  kind: TestingSuiteKindSchema,
  path: z.string().min(1),
  fileCount: z.number().int().nonnegative(),
});

export type TestingSuite = z.infer<typeof TestingSuiteSchema>;

export const TestingCoverageSchema = z.object({
  present: z.boolean(),
  linePct: z.number().min(0).max(100).optional(),
  source: z.string().min(1),
});

export type TestingCoverage = z.infer<typeof TestingCoverageSchema>;

/** Outcome of a single test after a `Run tests` invocation (M-046 tweak). */
export const TestingTestStatusSchema = z.enum([
  "passing",
  "failing",
  "skipped",
  "unknown",
]);

export type TestingTestStatus = z.infer<typeof TestingTestStatusSchema>;

export const TestingTestResultSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().min(1),
  suite: z.string().min(1).optional(),
  status: TestingTestStatusSchema,
  durationMs: z.number().nonnegative().optional(),
});

export type TestingTestResult = z.infer<typeof TestingTestResultSchema>;

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

export const SecurityToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  present: z.boolean(),
  path: z.string().min(1).optional(),
});

export type SecurityTool = z.infer<typeof SecurityToolSchema>;

export const SecurityCheckStatusSchema = z.enum([
  "pass",
  "fail",
  "warn",
  "skip",
]);

export type SecurityCheckStatus = z.infer<typeof SecurityCheckStatusSchema>;

export const SecurityCheckSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1).optional(),
  status: SecurityCheckStatusSchema,
  title: z.string().min(1),
  detail: z.string().min(1).optional(),
});

export type SecurityCheck = z.infer<typeof SecurityCheckSchema>;

/**
 * Left-shift tooling + fundamental checklist (M-046 / ADR-0022).
 * Not a full SAST product — local detection only.
 */
export const SecurityReportSchema = z.object({
  score: z.number().min(0).max(100),
  tools: z.array(SecurityToolSchema).default([]),
  checks: z.array(SecurityCheckSchema).default([]),
  summary: z.string().min(1),
});

export type SecurityReport = z.infer<typeof SecurityReportSchema>;

/** Stable engineering-health metric ids (M-022 / ADR-0017). */
export const EngineeringHealthMetricIdSchema = z.enum([
  "entropy",
  "architecture_drift",
  "technical_debt",
  "code_churn",
  "conflict_risk",
  "knowledge_decay",
]);

export type EngineeringHealthMetricId = z.infer<
  typeof EngineeringHealthMetricIdSchema
>;

/**
 * Single engineering-health metric. Score is 0–100 where **higher = healthier**
 * (aligned with HealthScore factors).
 */
export const EngineeringHealthMetricSchema = z.object({
  id: EngineeringHealthMetricIdSchema,
  label: z.string().min(1),
  score: z.number().min(0).max(100),
  severity: z.enum(["info", "low", "medium", "high"]).default("info"),
  evidence: z.array(z.string().min(1)).default([]),
  note: z.string().min(1).optional(),
  /** False when the metric needs git and none was available. */
  gitDependent: z.boolean().default(false),
});

export type EngineeringHealthMetric = z.infer<
  typeof EngineeringHealthMetricSchema
>;

export const EngineeringHotspotKindSchema = z.enum([
  "churn",
  "debt",
  "coupling",
  "ownership",
  "stale",
]);

export type EngineeringHotspotKind = z.infer<
  typeof EngineeringHotspotKindSchema
>;

export const EngineeringHotspotSchema = z.object({
  path: z.string().min(1),
  score: z.number().min(0).max(100),
  kinds: z.array(EngineeringHotspotKindSchema).min(1),
  evidence: z.array(z.string().min(1)).default([]),
});

export type EngineeringHotspot = z.infer<typeof EngineeringHotspotSchema>;

/**
 * Typed engineering-health report (M-022 / ADR-0017). Complementary to
 * `HealthScore` — does not reweight ADR-0012 factors.
 */
export const EngineeringHealthReportSchema = z.object({
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  summary: z.string().min(1),
  gitAvailable: z.boolean(),
  metrics: z.array(EngineeringHealthMetricSchema).default([]),
  hotspots: z.array(EngineeringHotspotSchema).default([]),
});

export type EngineeringHealthReport = z.infer<
  typeof EngineeringHealthReportSchema
>;

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
