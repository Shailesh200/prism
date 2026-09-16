/**
 * Prism Guard's three flags (M-072): duplicate, orphan, boundary. Blast-rank
 * ordering happens in Core, which owns `computeBlastRadius` — this module
 * only produces per-file flags from the knowledge graph, dependency graph,
 * and local package layout, all of which are already intelligence-level
 * concerns.
 */

import {
  isTestPath,
  type GuardFlag,
  type GraphSnapshotDto,
  type IndexSnapshot,
} from "@repo-prism/shared";
import { buildFeatureGraph } from "../feature/build.js";
import {
  packageForFile,
  discoverLocalPackages,
} from "../dependency/packages.js";
import { scoreReuse, tokenizeTask } from "../prepare/pack.js";
import { buildKnowledgeGraph } from "../semantic/build.js";

const DUPLICATE_THRESHOLD = 0.7;

export type GuardCheckInput = {
  readonly snapshot: IndexSnapshot;
  readonly sessionPaths: readonly string[];
  readonly dependencyGraph: GraphSnapshotDto;
};

function checkOrphans(input: GuardCheckInput): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  const inbound = new Map<string, number>();
  for (const edge of input.dependencyGraph.edges) {
    inbound.set(edge.to, (inbound.get(edge.to) ?? 0) + 1);
  }
  const analyzed = new Set(
    input.snapshot.files
      .filter((f) => f.status === "analyzed")
      .map((f) => f.path),
  );
  for (const path of input.sessionPaths) {
    if (!analyzed.has(path) || isTestPath(path)) continue;
    const nodeId = `file:${path}`;
    if ((inbound.get(nodeId) ?? 0) > 0) continue;
    out.set(path, [
      {
        kind: "orphan",
        detail: "Nothing in the index imports this file yet",
        provenance: "measured",
      },
    ]);
  }
  return out;
}

function checkDuplicates(input: GuardCheckInput): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  const kg = buildKnowledgeGraph(input.snapshot);
  const features = buildFeatureGraph(input.snapshot).features;
  const sessionSet = new Set(input.sessionPaths);
  for (const path of input.sessionPaths) {
    if (isTestPath(path)) continue;
    const exportedHere = kg.symbols.filter(
      (s) => s.path === path && s.exported,
    );
    for (const symbol of exportedHere) {
      const hits = scoreReuse(
        input.snapshot,
        tokenizeTask(symbol.name),
        [path],
        features,
      );
      const top = hits.find((hit) => !sessionSet.has(hit.path));
      if (!top || top.score < DUPLICATE_THRESHOLD) continue;
      const flags = out.get(path) ?? [];
      flags.push({
        kind: "duplicate",
        detail: `"${symbol.name}" looks like "${top.symbol}" in ${top.path} (${top.evidence})`,
        provenance: "heuristic",
      });
      out.set(path, flags);
    }
  }
  return out;
}

function checkBoundaries(input: GuardCheckInput): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  const indexedPaths = input.snapshot.files.map((f) => f.path);
  const packages = discoverLocalPackages(input.snapshot.rootPath, indexedPaths);
  if (packages.length <= 1) return out;

  const counts = new Map<string, number>();
  const packageByPath = new Map<string, ReturnType<typeof packageForFile>>();
  for (const path of input.sessionPaths) {
    const pkg = packageForFile(path, packages);
    packageByPath.set(path, pkg);
    if (pkg) counts.set(pkg.name, (counts.get(pkg.name) ?? 0) + 1);
  }
  if (counts.size <= 1) return out;
  let dominant: string | undefined;
  let dominantCount = 0;
  for (const [name, count] of counts) {
    if (count > dominantCount) {
      dominant = name;
      dominantCount = count;
    }
  }
  if (!dominant) return out;
  for (const path of input.sessionPaths) {
    const pkg = packageByPath.get(path);
    if (!pkg || pkg.name === dominant) continue;
    out.set(path, [
      {
        kind: "boundary",
        detail: `Touches ${pkg.name}; this session is mostly in ${dominant}`,
        provenance: "heuristic",
      },
    ]);
  }
  return out;
}

function mergeFlags(
  maps: readonly Map<string, GuardFlag[]>[],
): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  for (const map of maps) {
    for (const [path, flags] of map) {
      out.set(path, [...(out.get(path) ?? []), ...flags]);
    }
  }
  return out;
}

/** Duplicate / orphan / boundary flags for every session file that has any. */
export function checkGuardSession(
  input: GuardCheckInput,
): ReadonlyMap<string, GuardFlag[]> {
  return mergeFlags([
    checkDuplicates(input),
    checkOrphans(input),
    checkBoundaries(input),
  ]);
}
