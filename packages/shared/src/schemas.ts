import { z } from "zod";
import { PrismErrorCode } from "./errors.js";

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

export const HealthScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  factors: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().min(1),
      score: z.number().min(0).max(100),
      note: z.string().optional(),
    }),
  ),
});

export type HealthScore = z.infer<typeof HealthScoreSchema>;

export const BlastRadiusItemSchema = z.object({
  path: RepoRelativePathSchema,
  reason: z.string().min(1),
  depth: z.number().int().nonnegative(),
});

export const BlastRadiusReportSchema = z.object({
  origin: z.object({
    kind: z.enum(["file", "symbol"]),
    id: z.string().min(1),
    path: RepoRelativePathSchema.optional(),
  }),
  risk: z.number().min(0).max(100),
  affectedFiles: z.array(BlastRadiusItemSchema),
  testsLikelyAffected: z.array(RepoRelativePathSchema),
});

export type BlastRadiusReport = z.infer<typeof BlastRadiusReportSchema>;

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
});

export type CwvReport = z.infer<typeof CwvReportSchema>;

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
