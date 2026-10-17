/**
 * Prepare reads the same graphs several times per call, and again on every
 * call against the same index (M-093). They are pure functions of the
 * snapshot, so they are built once per snapshot object and dropped with it.
 */

import type { IndexSnapshot } from "@repo-prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { buildFeatureGraph } from "../feature/build.js";
import { buildKnowledgeGraph } from "../semantic/build.js";
import { collectRationale } from "../semantic/rationale.js";

function perSnapshot<T>(
  build: (snapshot: IndexSnapshot) => T,
): (snapshot: IndexSnapshot) => T {
  const cache = new WeakMap<IndexSnapshot, T>();
  return (snapshot) => {
    const hit = cache.get(snapshot);
    if (hit !== undefined) return hit;
    const value = build(snapshot);
    cache.set(snapshot, value);
    return value;
  };
}

export const cachedDependencyGraph = perSnapshot((s) =>
  buildDependencyGraph(s),
);
export const cachedFeatureGraph = perSnapshot(buildFeatureGraph);
export const cachedKnowledgeGraph = perSnapshot(buildKnowledgeGraph);
export const cachedRationale = perSnapshot(collectRationale);
