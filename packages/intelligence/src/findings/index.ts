/** Finding sources aggregator (M-071 L1). Extend the list as sources grow. */

import type { FindingRef, IndexSnapshot } from "@repo-prism/shared";
import { listUnusedExportFindings } from "./unused-exports.js";
import { listDuplicateImplementationFindings } from "./duplicate-implementation.js";
import { listWrapperOverExistingFindings } from "./wrapper-over-existing.js";

export function listFindings(snapshot: IndexSnapshot): readonly FindingRef[] {
  return [
    ...listUnusedExportFindings(snapshot),
    ...listDuplicateImplementationFindings(snapshot),
    ...listWrapperOverExistingFindings(snapshot),
  ];
}

/** Re-scan: is a finding with this fingerprint still present? (M-071 L3) */
export function findingStillOpen(
  snapshot: IndexSnapshot,
  fingerprint: string,
): boolean {
  return listFindings(snapshot).some(
    (finding) => finding.fingerprint === fingerprint,
  );
}

export {
  listUnusedExportFindings,
  UNUSED_EXPORT_SOURCE,
} from "./unused-exports.js";
export {
  listDuplicateImplementationFindings,
  DUPLICATE_IMPLEMENTATION_SOURCE,
} from "./duplicate-implementation.js";
export {
  listWrapperOverExistingFindings,
  WRAPPER_OVER_EXISTING_SOURCE,
} from "./wrapper-over-existing.js";
export {
  computeFindingFingerprint,
  normalizeFindingTitle,
} from "./fingerprint.js";
