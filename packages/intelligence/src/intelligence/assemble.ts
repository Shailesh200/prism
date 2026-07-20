import type {
  DnaReport,
  IndexSnapshot,
  IndexSummary,
  IntelligenceReport,
  PrismCapabilitiesDto,
} from "@prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { buildFeatureGraph } from "../feature/build.js";
import { buildKnowledgeGraph } from "../semantic/build.js";
import { checkIntelligenceConsistency } from "./consistency.js";

export type AssembleIntelligenceOptions = {
  readonly snapshot: IndexSnapshot;
  readonly dna: DnaReport;
  readonly capabilities: PrismCapabilitiesDto;
  readonly generatedAt?: string;
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
 * Compose DNA + graphs + capabilities into a single IntelligenceReport.
 */
export function assembleIntelligenceReport(
  options: AssembleIntelligenceOptions,
): IntelligenceReport {
  const { snapshot, dna, capabilities } = options;
  const dep = buildDependencyGraph(snapshot);
  const kg = buildKnowledgeGraph(snapshot);
  const fg = buildFeatureGraph(snapshot);

  const indexedPaths = new Set(snapshot.files.map((f) => f.path));
  const consistency = checkIntelligenceConsistency(
    indexedPaths,
    [
      { id: "dependency", graph: dep.graph },
      { id: "knowledge", graph: kg.graph },
      { id: "feature", graph: fg.graph },
    ],
    fg.features,
  );

  return {
    repoId: snapshot.repoId,
    rootPath: snapshot.rootPath,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    summary: toSummary(snapshot),
    dna,
    dependencyGraph: dep.graph,
    knowledgeGraph: kg.graph,
    knowledgeStats: kg.stats,
    featureGraph: fg.graph,
    features: fg.features,
    consistency,
    capabilities,
  };
}
