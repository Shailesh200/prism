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

export const StackProfileSchema = z.object({
  rootPath: z.string().min(1),
  generatedAt: z.string().datetime(),
  signals: z.array(StackSignalSchema),
  domains: z.array(z.string().min(1)),
  personas: z.array(z.string().min(1)),
  summary: z.string().min(1),
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

/** Parse unknown JSON into a DTO; returns Zod issues as message. */
export function parseDto<T>(
  schema: z.ZodType<T>,
  data: unknown,
): { ok: true; value: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(data);
  if (parsed.success) return { ok: true, value: parsed.data };
  const message = parsed.error.issues.map((i) => i.message).join("; ");
  return { ok: false, message };
}
