import {
  BundleWeightReportSchema,
  PrismErrorCode,
  type BundleWeightReport,
  type PrismError,
  type Result,
  err,
  ok,
  parseDto,
  prismError,
} from "@prism/shared";
import type { IngestStore } from "./ingest-store.js";

export const INGEST_KIND_BUNDLE_STATS = "bundle-stats" as const;

/** Load a persisted bundle-stats ingest artifact as BundleWeightReport. */
export async function getBundleWeightReport(
  ingest: IngestStore,
  artifactId: string,
): Promise<Result<BundleWeightReport, PrismError>> {
  const artifact = await ingest.get(artifactId);
  if (!artifact.ok) return artifact;
  if (artifact.value.kind !== INGEST_KIND_BUNDLE_STATS) {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Artifact ${artifactId} is kind "${artifact.value.kind}", expected ${INGEST_KIND_BUNDLE_STATS}`,
      ),
    );
  }
  const parsed = parseDto(BundleWeightReportSchema, artifact.value.payload);
  if (!parsed.ok) {
    return err(prismError(PrismErrorCode.VALIDATION, parsed.message));
  }
  return ok({
    ...parsed.value,
    chunks: parsed.value.chunks ?? [],
    packageRollups: parsed.value.packageRollups ?? [],
    highlights: parsed.value.highlights ?? [],
  });
}
