/**
 * Unused-export finding source (M-071 L1): an exported symbol with zero
 * inbound references in the resolved knowledge graph. Conservative on
 * purpose — barrels and test files never qualify, so this never flags a
 * re-export or a symbol only a test exercises.
 */

import { isTestPath, type FindingRef } from "@repo-prism/shared";
import type { IndexSnapshot } from "@repo-prism/shared";
import { buildKnowledgeGraph } from "../semantic/build.js";
import { computeFindingFingerprint } from "./fingerprint.js";

const BARREL_BASENAMES = new Set(["index.ts", "index.tsx", "index.js"]);

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

export const UNUSED_EXPORT_SOURCE = "unused_export";

export function listUnusedExportFindings(
  snapshot: IndexSnapshot,
): readonly FindingRef[] {
  const kg = buildKnowledgeGraph(snapshot);
  const referenced = new Set<string>();
  for (const ref of kg.references) {
    if (ref.targetSymbolId) referenced.add(ref.targetSymbolId);
  }
  const findings: FindingRef[] = [];
  for (const symbol of kg.symbols) {
    if (!symbol.exported) continue;
    if (referenced.has(symbol.id)) continue;
    if (isTestPath(symbol.path)) continue;
    if (BARREL_BASENAMES.has(basename(symbol.path))) continue;
    const title = `Unused export "${symbol.name}" in ${symbol.path}`;
    findings.push({
      id: symbol.id,
      source: UNUSED_EXPORT_SOURCE,
      title,
      path: symbol.path,
      fingerprint: computeFindingFingerprint({
        source: UNUSED_EXPORT_SOURCE,
        path: symbol.path,
        title,
      }),
    });
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}
