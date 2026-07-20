import type { ConsentStore } from "./consent.js";
import { createConsentStore } from "./consent.js";
import type { IngestStore } from "./ingest-store.js";
import { createIngestStore } from "./ingest-store.js";
import type { UtilityJobService } from "./jobs.js";
import { createUtilityJobService } from "./jobs.js";

export type UtilitiesSessionOptions = {
  readonly workspaceRoot: string;
  readonly ingestRoot?: string;
  readonly consentPath?: string;
};

/**
 * P0 utilities session: ingest store + consent + async jobs (X-01–X-03, X-06).
 */
export type UtilitiesSession = {
  readonly ingest: IngestStore;
  readonly consent: ConsentStore;
  readonly jobs: UtilityJobService;
};

export function createUtilitiesSession(
  options: UtilitiesSessionOptions,
): UtilitiesSession {
  const ingest = createIngestStore({
    workspaceRoot: options.workspaceRoot,
    ...(options.ingestRoot === undefined
      ? {}
      : { ingestRoot: options.ingestRoot }),
  });
  const consent = createConsentStore({
    workspaceRoot: options.workspaceRoot,
    ...(options.consentPath === undefined
      ? {}
      : { consentPath: options.consentPath }),
  });
  const jobs = createUtilityJobService({
    ingest,
    consent,
    workspaceRoot: options.workspaceRoot,
  });
  return { ingest, consent, jobs };
}
