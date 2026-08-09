import type {
  BackendEndpoint,
  CodeExplorerOwner,
  CodeExplorerRelatedItem,
  CodeExplorerReport,
  CodeExplorerSimilarItem,
  CodeExplorerTarget,
  CodeExplorerUsage,
  FeatureInfo,
  GitFileSignal,
  IndexSnapshot,
} from "@repo-prism/shared";
import { isTestPath } from "@repo-prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { buildFeatureGraph } from "../feature/build.js";
import {
  buildKnowledgeGraph,
  findReferences,
  findSymbol,
  type KnowledgeGraphResult,
} from "../semantic/build.js";

export type BuildCodeExplorerInput = {
  snapshot: IndexSnapshot;
  target: CodeExplorerTarget;
  gitFiles?: readonly GitFileSignal[];
  /** Optional backend endpoints (from getBackendReport) for related APIs. */
  endpoints?: readonly BackendEndpoint[];
  now?: Date;
};

function pathFromFileNodeId(id: string): string | null {
  return id.startsWith("file:") ? id.slice("file:".length) : null;
}

function resolvePath(
  snapshot: IndexSnapshot,
  kg: KnowledgeGraphResult,
  target: CodeExplorerTarget,
): { path: string; symbolName?: string; symbolId?: string } | null {
  if (target.kind === "file") {
    const exists = snapshot.files.some((f) => f.path === target.path);
    if (!exists) return null;
    return { path: target.path };
  }
  const hits = findSymbol(kg, {
    name: target.name,
    ...(target.path !== undefined ? { path: target.path } : {}),
  });
  const hit =
    target.start !== undefined
      ? (hits.find((h) => h.start === target.start) ?? hits[0])
      : hits[0];
  if (!hit) return null;
  return { path: hit.path, symbolName: hit.name, symbolId: hit.id };
}

function buildUsages(
  kg: KnowledgeGraphResult,
  target: CodeExplorerTarget,
  resolved: { path: string; symbolName?: string },
): CodeExplorerUsage[] {
  if (target.kind === "symbol" || resolved.symbolName) {
    const name = target.kind === "symbol" ? target.name : resolved.symbolName!;
    const refs = findReferences(kg, {
      name,
      path: resolved.path,
      ...(target.kind === "symbol" && target.start !== undefined
        ? { start: target.start }
        : {}),
    });
    return refs.references.map((r) => ({
      name: r.name,
      kind: r.kind,
      path: r.path,
      start: r.start,
      end: r.end,
      targetSymbolId: r.targetSymbolId,
    }));
  }

  // File target: all references whose target symbol lives in this file.
  const ids = new Set(
    kg.symbols.filter((s) => s.path === resolved.path).map((s) => s.id),
  );
  return kg.references
    .filter((r) => r.targetSymbolId !== null && ids.has(r.targetSymbolId))
    .map((r) => ({
      name: r.name,
      kind: r.kind,
      path: r.path,
      start: r.start,
      end: r.end,
      targetSymbolId: r.targetSymbolId,
    }))
    .sort((a, b) =>
      `${a.path}\0${a.start}`.localeCompare(`${b.path}\0${b.start}`),
    );
}

function buildOwnership(
  path: string,
  gitFiles: readonly GitFileSignal[] | undefined,
): CodeExplorerReport["ownership"] {
  const signal = gitFiles?.find((f) => f.path === path);
  if (!signal) {
    return {
      gitAvailable: false,
      contributors: [],
      note: "Git history unavailable for this path",
    };
  }
  const total = signal.contributors.reduce((n, c) => n + c.commits, 0) || 1;
  const contributors: CodeExplorerOwner[] = signal.contributors
    .map((c) => ({
      author: c.author,
      commits: c.commits,
      share: c.commits / total,
      additions: c.additions,
      deletions: c.deletions,
    }))
    .sort((a, b) => b.commits - a.commits);
  return {
    gitAvailable: true,
    ...(contributors[0] ? { primary: contributors[0] } : {}),
    contributors,
    note: `${contributors.length} contributor(s) in scanned window`,
  };
}

function buildTimeline(
  path: string,
  gitFiles: readonly GitFileSignal[] | undefined,
): CodeExplorerReport["timeline"] {
  const signal = gitFiles?.find((f) => f.path === path);
  if (!signal) {
    return {
      gitAvailable: false,
      commits: [],
      weeks: [],
      note: "Git history unavailable for this path",
    };
  }
  return {
    gitAvailable: true,
    commits: signal.recent,
    weeks: signal.weeks,
    note: `${signal.commits} commit(s) touching this file in window`,
  };
}

function relatedFeatures(
  path: string,
  features: readonly FeatureInfo[],
): CodeExplorerRelatedItem[] {
  return features
    .filter((f) => f.memberFiles.includes(path))
    .map((f) => ({
      id: f.id,
      label: f.name,
      reason: "Member of inferred feature",
      confidence: f.confidence,
    }))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
}

function relatedTests(
  path: string,
  kg: KnowledgeGraphResult,
  snapshot: IndexSnapshot,
): CodeExplorerRelatedItem[] {
  const out: CodeExplorerRelatedItem[] = [];
  const seen = new Set<string>();

  for (const e of kg.graph.edges) {
    if (e.kind !== "tests") continue;
    const from = pathFromFileNodeId(e.from);
    const to = pathFromFileNodeId(e.to);
    if (to === path && from && isTestPath(from)) {
      if (!seen.has(from)) {
        seen.add(from);
        out.push({
          id: `test:${from}`,
          label: from.split("/").pop() ?? from,
          path: from,
          reason: "KG tests edge",
        });
      }
    }
  }

  const stem = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "");
  for (const f of snapshot.files) {
    if (!isTestPath(f.path) || seen.has(f.path)) continue;
    const tStem = (f.path.split("/").pop() ?? f.path)
      .replace(/\.(test|spec)\.[^.]+$/i, "")
      .replace(/\.[^.]+$/, "");
    if (tStem === stem || f.path.includes(stem)) {
      seen.add(f.path);
      out.push({
        id: `test:${f.path}`,
        label: f.path.split("/").pop() ?? f.path,
        path: f.path,
        reason: "Filename / stem heuristic",
        confidence: 0.55,
      });
    }
  }
  return out;
}

function relatedApis(
  path: string,
  endpoints: readonly BackendEndpoint[] | undefined,
): CodeExplorerRelatedItem[] {
  if (!endpoints) return [];
  return endpoints
    .filter((e) => e.handlerFile === path)
    .map((e) => ({
      id: e.id,
      label: `${e.method} ${e.path}`,
      path: e.handlerFile,
      reason: `Backend endpoint (${e.framework})`,
      confidence: e.confidence,
    }));
}

function relatedComponents(
  path: string,
  snapshot: IndexSnapshot,
  features: readonly FeatureInfo[],
): CodeExplorerRelatedItem[] {
  const dep = buildDependencyGraph(snapshot);
  const neighbors = new Set<string>();
  for (const e of dep.graph.edges) {
    const from = pathFromFileNodeId(e.from);
    const to = pathFromFileNodeId(e.to);
    if (from === path && to) neighbors.add(to);
    if (to === path && from) neighbors.add(from);
  }

  const featurePeers = new Set<string>();
  for (const f of features) {
    if (!f.memberFiles.includes(path)) continue;
    for (const m of f.memberFiles) {
      if (m !== path) featurePeers.add(m);
    }
  }

  const out: CodeExplorerRelatedItem[] = [];
  const seen = new Set<string>();
  for (const p of [...neighbors, ...featurePeers]) {
    if (seen.has(p) || isTestPath(p)) continue;
    seen.add(p);
    const viaFeature = featurePeers.has(p);
    const viaDep = neighbors.has(p);
    out.push({
      id: `comp:${p}`,
      label: p.split("/").pop() ?? p,
      path: p,
      reason: viaFeature
        ? viaDep
          ? "Same feature + dependency neighbor"
          : "Same inferred feature"
        : "Dependency neighbor",
      confidence: viaFeature && viaDep ? 0.85 : viaFeature ? 0.7 : 0.6,
    });
  }
  return out
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, 20);
}

function findSimilar(
  kg: KnowledgeGraphResult,
  resolved: { path: string; symbolName?: string; symbolId?: string },
  features: readonly FeatureInfo[],
): CodeExplorerSimilarItem[] {
  const out: CodeExplorerSimilarItem[] = [];
  const focusSymbols = resolved.symbolName
    ? kg.symbols.filter(
        (s) =>
          s.name === resolved.symbolName &&
          (resolved.symbolId
            ? s.id === resolved.symbolId
            : s.path === resolved.path),
      )
    : kg.symbols.filter((s) => s.path === resolved.path && s.exported);

  const focusNames = new Set(focusSymbols.map((s) => s.name));
  const focusKinds = new Set(focusSymbols.map((s) => s.kind));
  const myFeatures = features.filter((f) =>
    f.memberFiles.includes(resolved.path),
  );

  for (const s of kg.symbols) {
    if (s.path === resolved.path) continue;
    if (!s.exported && !focusNames.has(s.name)) continue;

    let score = 0;
    const reasons: string[] = [];
    if (focusNames.has(s.name)) {
      score += 0.55;
      reasons.push(`same name "${s.name}"`);
    }
    if (focusKinds.has(s.kind) && focusNames.has(s.name)) {
      score += 0.15;
      reasons.push(`same kind (${s.kind})`);
    }
    const shared = myFeatures.filter((f) => f.memberFiles.includes(s.path));
    if (shared.length > 0) {
      score += 0.25;
      reasons.push(`shared feature ${shared[0]!.name}`);
    }
    if (score < 0.55) continue;
    out.push({
      path: s.path,
      name: s.name,
      kind: s.kind,
      score: Math.min(1, score),
      reason: reasons.join("; "),
      symbolId: s.id,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 15);
}

/**
 * Build a selection-scoped Code Explorer report (M-023 / ADR-0018).
 */
export function buildCodeExplorerReport(
  input: BuildCodeExplorerInput,
): CodeExplorerReport | null {
  const { snapshot, target } = input;
  const kg = buildKnowledgeGraph(snapshot);
  const resolved = resolvePath(snapshot, kg, target);
  if (!resolved) return null;

  const features = buildFeatureGraph(snapshot).features;
  const usages = buildUsages(kg, target, resolved);
  const ownership = buildOwnership(resolved.path, input.gitFiles);
  const timeline = buildTimeline(resolved.path, input.gitFiles);
  const related = {
    features: relatedFeatures(resolved.path, features),
    tests: relatedTests(resolved.path, kg, snapshot),
    apis: relatedApis(resolved.path, input.endpoints),
    components: relatedComponents(resolved.path, snapshot, features),
  };
  const similar = findSimilar(kg, resolved, features);
  const generatedAt = (input.now ?? new Date()).toISOString();

  return {
    rootPath: snapshot.rootPath,
    generatedAt,
    summary: [
      `path=${resolved.path}`,
      `usages=${usages.length}`,
      `tests=${related.tests.length}`,
      `features=${related.features.length}`,
      `similar=${similar.length}`,
      ownership.gitAvailable ? "git=on" : "git=off",
    ].join("; "),
    target,
    path: resolved.path,
    usages,
    ownership,
    related,
    similar,
    timeline,
  };
}
