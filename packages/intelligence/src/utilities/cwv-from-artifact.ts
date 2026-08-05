import {
  CwvReportSchema,
  PrismErrorCode,
  type CwvReport,
  type PrismError,
  type Result,
  err,
  ok,
  parseDto,
  prismError,
} from "@repo-prism/shared";
import type { IngestStore } from "./ingest-store.js";

/** Load a persisted lighthouse-cwv ingest artifact as CwvReport. */
export async function getCwvReport(
  ingest: IngestStore,
  artifactId: string,
): Promise<Result<CwvReport, PrismError>> {
  const artifact = await ingest.get(artifactId);
  if (!artifact.ok) return artifact;
  if (artifact.value.kind !== "lighthouse-cwv") {
    return err(
      prismError(
        PrismErrorCode.VALIDATION,
        `Artifact ${artifactId} is kind "${artifact.value.kind}", expected lighthouse-cwv`,
      ),
    );
  }
  const parsed = parseDto(CwvReportSchema, artifact.value.payload);
  if (!parsed.ok) {
    return err(prismError(PrismErrorCode.VALIDATION, parsed.message));
  }
  return ok({
    ...parsed.value,
    categoryScores: parsed.value.categoryScores ?? {},
    attributions: parsed.value.attributions ?? [],
    rollups: parsed.value.rollups ?? [],
    insights: parsed.value.insights ?? [],
  });
}
