/**
 * Duplicate-implementation finding source (M-074 B1): two different files
 * export a function or class with the exact same name.
 *
 * Deliberately exact-name-only, not fuzzy. Guard's own duplicate check
 * (packages/intelligence/src/guard/session.ts) tried "shares a token" and
 * flooded a large, conventionally named codebase with false positives
 * (`fetchDna` / `fetchHealth` both containing "fetch") — expensive to
 * compute at session scale, worse at whole-repo scale. An exact name match
 * across files is a strict subset of that signal: cheap (single group-by,
 * no pairwise scoring) and near-zero false-positive rate, at the cost of
 * missing near-duplicates with different names (`fetchUser` / `getUser`).
 * That tradeoff is intentional for a repo-wide scan.
 */

import { isTestPath, type FindingRef } from "@repo-prism/shared";
import type { IndexSnapshot } from "@repo-prism/shared";
import { buildKnowledgeGraph } from "../semantic/build.js";
import { computeFindingFingerprint } from "./fingerprint.js";

const BARREL_BASENAMES = new Set(["index.ts", "index.tsx", "index.js"]);
const DUPLICATE_KINDS = new Set(["function", "class"]);

function basename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? path : path.slice(slash + 1);
}

export const DUPLICATE_IMPLEMENTATION_SOURCE = "duplicate_implementation";

export function listDuplicateImplementationFindings(
  snapshot: IndexSnapshot,
): readonly FindingRef[] {
  const kg = buildKnowledgeGraph(snapshot);
  const candidates = kg.symbols.filter(
    (s) =>
      s.exported &&
      DUPLICATE_KINDS.has(s.kind) &&
      s.name.length >= 4 &&
      !isTestPath(s.path) &&
      !BARREL_BASENAMES.has(basename(s.path)),
  );

  const byName = new Map<string, typeof candidates>();
  for (const symbol of candidates) {
    const key = symbol.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), symbol]);
  }

  const findings: FindingRef[] = [];
  for (const group of byName.values()) {
    const distinctPaths = new Set(group.map((s) => s.path));
    if (distinctPaths.size < 2) continue;
    // Stable order: the first file (by path) is treated as canonical and
    // never flagged; every later one is "a duplicate of the first".
    const sorted = [...group].sort((a, b) => a.path.localeCompare(b.path));
    const original = sorted[0]!;
    for (const dup of sorted.slice(1)) {
      if (dup.path === original.path) continue;
      const title = `"${dup.name}" in ${dup.path} duplicates "${original.name}" in ${original.path}`;
      findings.push({
        id: dup.id,
        source: DUPLICATE_IMPLEMENTATION_SOURCE,
        title,
        path: dup.path,
        fingerprint: computeFindingFingerprint({
          source: DUPLICATE_IMPLEMENTATION_SOURCE,
          path: dup.path,
          title,
        }),
      });
    }
  }
  return findings.sort((a, b) => a.id.localeCompare(b.id));
}
