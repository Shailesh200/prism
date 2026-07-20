import type { IndexSnapshot, PrismError, Result } from "@prism/shared";
import { runIndexJob, type IndexJobOptions } from "./index-job.js";

/** Shape mirrored by Core `IndexerPort` (Core must not import this package type). */
export type IndexerEngine = {
  readonly id: "prism-indexer";
  indexWorkspace(
    rootAbsolutePath: string,
    options?: IndexJobOptions,
  ): Promise<Result<IndexSnapshot, PrismError>>;
};

/** Default indexer engine used by Core. */
export function createIndexerEngine(
  defaults: IndexJobOptions = {},
): IndexerEngine {
  return {
    id: "prism-indexer",
    indexWorkspace(rootAbsolutePath, options) {
      return runIndexJob(rootAbsolutePath, { ...defaults, ...options });
    },
  };
}
