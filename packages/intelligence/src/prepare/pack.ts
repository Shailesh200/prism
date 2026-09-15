/**
 * Context pack + reuse-by-intent + House Style for `prepare_change` (M-070).
 *
 * Ranker scores files, not bodies. Serializer callers must pass the DTO
 * through MCP/CLI as-is — never attach file contents.
 */

import {
  isTestPath,
  prepareMapTokenWeight,
  type FeatureInfo,
  type GitFileSignal,
  type IndexSnapshot,
  type PrepareChange,
  type PrepareAmbiguous,
  type ReuseHit,
  type Exemplar,
  type ContextFile,
  type HouseStylePatternId,
  type SignalProvenance,
  DEFAULT_PREPARE_BUDGET,
} from "@repo-prism/shared";
import { buildDependencyGraph } from "../dependency/build.js";
import { buildFeatureGraph } from "../feature/build.js";
import { buildKnowledgeGraph } from "../semantic/build.js";

const STOP = new Set([
  "add",
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "into",
  "onto",
  "when",
  "then",
  "an",
  "to",
  "of",
  "in",
  "on",
  "or",
  "a",
]);

const SCORE_THRESHOLD = 0.12;
const REUSE_THRESHOLD = 0.55;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export type BuildPrepareChangeInput = {
  readonly snapshot: IndexSnapshot;
  readonly task: string;
  readonly budget?: number;
  readonly gitFiles?: readonly GitFileSignal[];
  readonly frameworks?: readonly string[];
  readonly now?: Date;
};

export function tokenizeTask(task: string): string[] {
  const out = new Set<string>();
  const parts = task.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  for (const part of parts) {
    const pieces = splitIdent(part);
    for (const piece of pieces) {
      const lower = piece.toLowerCase();
      if (lower.length < 3 || STOP.has(lower)) continue;
      out.add(lower);
      if (lower.endsWith("ing") && lower.length > 5) {
        out.add(`${lower.slice(0, -3)}e`);
        out.add(lower.slice(0, -3));
      }
    }
  }
  return [...out];
}

function splitIdent(value: string): string[] {
  const camel = value.split(/(?<=[a-z])(?=[A-Z])/);
  return camel.length > 1 ? [value, ...camel] : [value];
}

function featureMembership(
  file: string,
  features: readonly FeatureInfo[],
  tokens: readonly string[],
): { hit: boolean; name?: string; provenance: SignalProvenance } {
  let best: FeatureInfo | undefined;
  for (const feature of features) {
    if (!feature.memberFiles.includes(file)) continue;
    const nameTokens = tokenizeTask(feature.name);
    const overlap = nameTokens.some((t) => tokens.includes(t));
    if (!overlap && !tokens.some((t) => feature.slug.includes(t))) continue;
    if (!best || feature.confidence > best.confidence) best = feature;
  }
  if (!best) {
    return { hit: false, provenance: "unavailable" };
  }
  const provenance: SignalProvenance =
    best.provenance === "inferred" ||
    best.provenance === "measured" ||
    best.provenance === "heuristic"
      ? best.provenance
      : "inferred";
  return { hit: true, name: best.name, provenance };
}

function importNeighbors(snapshot: IndexSnapshot): Map<string, Set<string>> {
  const graph = buildDependencyGraph(snapshot).graph;
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    const set = adj.get(a) ?? new Set<string>();
    set.add(b);
    adj.set(a, set);
  };
  for (const edge of graph.edges) {
    if (!edge.from.startsWith("file:") || !edge.to.startsWith("file:")) {
      continue;
    }
    const from = edge.from.slice("file:".length);
    const to = edge.to.slice("file:".length);
    add(from, to);
    add(to, from);
  }
  return adj;
}

function depDistance(
  file: string,
  seeds: readonly string[],
  adj: Map<string, Set<string>>,
): number | null {
  if (seeds.length === 0) return null;
  if (seeds.includes(file)) return 0;
  const seen = new Set<string>(seeds);
  let frontier = [...seeds];
  let dist = 0;
  while (frontier.length > 0 && dist < 6) {
    dist += 1;
    const next: string[] = [];
    for (const node of frontier) {
      for (const n of adj.get(node) ?? []) {
        if (seen.has(n)) continue;
        if (n === file) return dist;
        seen.add(n);
        next.push(n);
      }
    }
    frontier = next;
  }
  return seen.has(file) ? dist : null;
}

function ownershipHot(
  file: string,
  gitFiles: readonly GitFileSignal[] | undefined,
): number {
  const row = gitFiles?.find((g) => g.path === file);
  if (!row || row.commits <= 0) return 0;
  const top = row.contributors.reduce((m, c) => Math.max(m, c.commits), 0);
  return Math.min(1, top / row.commits);
}

function recentChurn(
  file: string,
  gitFiles: readonly GitFileSignal[] | undefined,
  now: Date,
): number {
  const row = gitFiles?.find((g) => g.path === file);
  if (!row) return 0;
  if (typeof row.recency === "number" && row.recency > 0) return row.recency;
  const cutoff = now.getTime() - FOURTEEN_DAYS_MS;
  const recent = row.recent.filter((c) => Date.parse(c.date) >= cutoff).length;
  return Math.min(1, recent / 5);
}

function exportedSymbols(snapshot: IndexSnapshot, path: string): string[] {
  const file = snapshot.files.find((f) => f.path === path);
  if (!file) return [];
  return file.symbols.filter((s) => s.exported).map((s) => s.name);
}

function testsFor(snapshot: IndexSnapshot, paths: readonly string[]): string[] {
  const kg = buildKnowledgeGraph(snapshot);
  const out = new Set<string>();
  for (const path of paths) {
    if (isTestPath(path)) out.add(path);
  }
  for (const file of snapshot.files) {
    if (!isTestPath(file.path)) continue;
    if (paths.some((p) => file.path.startsWith(p.replace(/\/[^/]+$/, "/")))) {
      out.add(file.path);
    }
  }
  for (const edge of kg.graph.edges) {
    if (edge.kind !== "tests") continue;
    const from = edge.from.startsWith("file:")
      ? edge.from.slice("file:".length)
      : "";
    const to = edge.to.startsWith("file:") ? edge.to.slice("file:".length) : "";
    if (paths.includes(to) && from) out.add(from);
    if (paths.includes(from) && to && isTestPath(to)) out.add(to);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

function identifiers(task: string): string[] {
  const out: string[] = [];
  const re = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(task))) {
    const raw = match[0]!;
    if (STOP.has(raw.toLowerCase())) continue;
    if (raw[0] === raw[0]!.toLowerCase() && !/[A-Z]/.test(raw)) continue;
    out.push(raw);
  }
  return [...new Set(out)];
}

function resolveSeeds(
  snapshot: IndexSnapshot,
  task: string,
): {
  seeds: string[];
  ambiguous: PrepareAmbiguous | null;
} {
  const kg = buildKnowledgeGraph(snapshot);
  let ambiguous: PrepareAmbiguous | null = null;
  const seeds = new Set<string>();
  for (const name of identifiers(task)) {
    const hits = kg.symbols.filter((s) => s.name === name);
    const files = [...new Set(hits.map((h) => h.path))];
    if (files.length > 1) {
      ambiguous = {
        query: name,
        candidates: hits.map((h) => ({
          path: h.path,
          symbol: h.name,
          ...(h.kind ? { kind: h.kind } : {}),
        })),
      };
      continue;
    }
    if (files[0]) seeds.add(files[0]);
  }
  return { seeds: [...seeds], ambiguous };
}

function scoreReuse(
  snapshot: IndexSnapshot,
  taskTokens: readonly string[],
  seedFiles: readonly string[],
  features: readonly FeatureInfo[],
): ReuseHit[] {
  const kg = buildKnowledgeGraph(snapshot);
  const seedFeatureIds = new Set(
    features
      .filter((f) => seedFiles.some((p) => f.memberFiles.includes(p)))
      .map((f) => f.id),
  );
  const imported = new Set<string>();
  for (const path of seedFiles) {
    const file = snapshot.files.find((f) => f.path === path);
    for (const spec of file?.imports.flatMap((i) => i.specifiers) ?? []) {
      imported.add(spec);
    }
  }
  const out: ReuseHit[] = [];
  for (const symbol of kg.symbols) {
    if (!symbol.exported) continue;
    if (seedFiles.includes(symbol.path)) continue;
    const nameTokens = tokenizeTask(symbol.name);
    let score = 0;
    const reasons: string[] = [];
    if (nameTokens.some((t) => taskTokens.includes(t))) {
      score += 0.55;
      reasons.push(`name overlaps task (${symbol.name})`);
    }
    if (
      score >= 0.55 &&
      (symbol.kind === "function" || symbol.kind === "class")
    ) {
      score += 0.15;
      reasons.push(`kind ${symbol.kind}`);
    }
    const shared = features.filter(
      (f) =>
        f.memberFiles.includes(symbol.path) &&
        (seedFeatureIds.has(f.id) ||
          tokenizeTask(f.name).some((t) => taskTokens.includes(t))),
    );
    if (shared.length > 0) {
      score += 0.25;
      reasons.push(`feature ${shared[0]!.name}`);
    }
    if (imported.has(symbol.name)) {
      score += 0.05;
      reasons.push("already imported in a seed file");
    }
    if (score < REUSE_THRESHOLD) continue;
    out.push({
      path: symbol.path,
      symbol: symbol.name,
      kind: symbol.kind,
      score: Math.min(1, score),
      evidence: reasons.join("; "),
      provenance: "heuristic",
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 8);
}

function looksLikeExpress(
  snapshot: IndexSnapshot,
  frameworks: readonly string[] | undefined,
): boolean {
  if (frameworks?.some((f) => /express/i.test(f))) return true;
  return snapshot.files.some((f) =>
    f.imports.some((imp) => imp.source === "express"),
  );
}

function inboundCount(snapshot: IndexSnapshot, path: string): number {
  const graph = buildDependencyGraph(snapshot).graph;
  return graph.edges.filter(
    (e) => e.to === `file:${path}` && e.from.startsWith("file:"),
  ).length;
}

function pickSymbol(snapshot: IndexSnapshot, path: string): string {
  const exported = exportedSymbols(snapshot, path);
  return exported[0] ?? path.split("/").pop() ?? path;
}

function houseStyle(
  snapshot: IndexSnapshot,
  frameworks: readonly string[] | undefined,
  gitFiles: readonly GitFileSignal[] | undefined,
): { exemplars: Exemplar[]; provenance: SignalProvenance } {
  if (!looksLikeExpress(snapshot, frameworks)) {
    return { exemplars: [], provenance: "unavailable" };
  }
  const handlers = snapshot.files.filter((f) => {
    const route = /(?:^|\/)routes\//.test(f.path);
    const express = f.imports.some((imp) => imp.source === "express");
    return route || express;
  });
  if (handlers.length === 0) {
    return { exemplars: [], provenance: "unavailable" };
  }
  const ranked = [...handlers].sort((a, b) => {
    const inbound =
      inboundCount(snapshot, b.path) - inboundCount(snapshot, a.path);
    if (inbound !== 0) return inbound;
    const local =
      b.imports.filter((imp) => imp.source !== "express").length -
      a.imports.filter((imp) => imp.source !== "express").length;
    if (local !== 0) return local;
    return a.path.localeCompare(b.path);
  });
  const byGit = [...handlers].sort((a, b) => {
    const da = gitFiles?.find((g) => g.path === a.path)?.lastCommit.date ?? "";
    const db = gitFiles?.find((g) => g.path === b.path)?.lastCommit.date ?? "";
    return db.localeCompare(da);
  });
  const canonical = ranked[0]!;
  const recent = byGit[0] ?? ranked[0]!;
  const older = byGit[byGit.length - 1] ?? ranked[ranked.length - 1]!;
  const pattern: HouseStylePatternId = "route-handler";
  const exemplars: Exemplar[] = [
    {
      path: canonical.path,
      symbol: pickSymbol(snapshot, canonical.path),
      patternId: pattern,
      whyCanonical: "handlers next to the route",
    },
  ];
  if (recent.path !== canonical.path) {
    exemplars.push({
      path: recent.path,
      symbol: pickSymbol(snapshot, recent.path),
      patternId: pattern,
      whyCanonical: "most recently touched handler",
    });
  }
  if (older.path !== canonical.path && older.path !== recent.path) {
    exemplars.push({
      path: older.path,
      symbol: pickSymbol(snapshot, older.path),
      patternId: pattern,
      whyCanonical: "older handler in the same layout",
    });
  }
  while (exemplars.length < 3 && ranked[exemplars.length]) {
    const extra = ranked[exemplars.length]!;
    if (exemplars.some((e) => e.path === extra.path)) break;
    exemplars.push({
      path: extra.path,
      symbol: pickSymbol(snapshot, extra.path),
      patternId: pattern,
      whyCanonical: "same Express route layout",
    });
  }
  return { exemplars: exemplars.slice(0, 3), provenance: "heuristic" };
}

export function buildPrepareChange(
  input: BuildPrepareChangeInput,
): PrepareChange {
  const snapshot = input.snapshot;
  const task = input.task.trim() || "change";
  const budget = input.budget ?? DEFAULT_PREPARE_BUDGET;
  const now = input.now ?? new Date();
  const tokens = tokenizeTask(task);
  const features = buildFeatureGraph(snapshot).features;
  const { seeds, ambiguous } = resolveSeeds(snapshot, task);
  const adj = importNeighbors(snapshot);
  const git = input.gitFiles;

  type Ranked = {
    path: string;
    score: number;
    why: string[];
    provenance: SignalProvenance;
  };
  const ranked: Ranked[] = [];
  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    const why: string[] = [];
    let score = 0;
    const feature = featureMembership(file.path, features, tokens);
    if (feature.hit) {
      score += 0.35;
      why.push(`feature ${feature.name}`);
    }
    const dist = depDistance(file.path, seeds, adj);
    if (dist !== null) {
      score += 0.25 * (1 - Math.min(dist, 6) / 6);
      why.push(dist === 0 ? "seed file" : `import distance ${dist}`);
    }
    const testsHit = isTestPath(file.path)
      ? seeds.some((s) => file.path.includes(s.replace(/\/[^/]+$/, "/")))
      : false;
    if (isTestPath(file.path) && (feature.hit || testsHit)) {
      score += 0.15;
      why.push("colocated test");
    }
    const own = ownershipHot(file.path, git);
    if (own > 0) {
      score += 0.1 * own;
      why.push("ownership hot");
    }
    const churn = recentChurn(file.path, git, now);
    if (churn > 0) {
      score += 0.15 * churn;
      why.push("recent churn");
    }
    if (score < SCORE_THRESHOLD) continue;
    const provenance: SignalProvenance = feature.hit
      ? feature.provenance
      : dist !== null
        ? "measured"
        : "heuristic";
    ranked.push({ path: file.path, score, why, provenance });
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const packed: ContextFile[] = [];
  let tokenEstimate = 0;
  for (const row of ranked) {
    const symbols = exportedSymbols(snapshot, row.path);
    const tokenWeight = prepareMapTokenWeight(row.path, symbols, row.why);
    if (packed.length > 0 && tokenEstimate + tokenWeight > budget) break;
    packed.push({
      path: row.path,
      symbols,
      why: row.why,
      tokenWeight,
      provenance: row.provenance,
    });
    tokenEstimate += tokenWeight;
  }
  const tests = testsFor(
    snapshot,
    packed.map((f) => f.path),
  );
  let testsWeight = 0;
  const testsInBudget: string[] = [];
  for (const path of tests) {
    const w = prepareMapTokenWeight(path, [], ["test"]);
    if (tokenEstimate + testsWeight + w > budget && testsInBudget.length > 0) {
      break;
    }
    testsInBudget.push(path);
    testsWeight += w;
  }
  tokenEstimate += testsWeight;
  const truncated = packed.length < ranked.length;
  const reuse = scoreReuse(snapshot, tokens, seeds, features);
  const style = houseStyle(snapshot, input.frameworks, git);

  return {
    pack: {
      task,
      files: packed,
      tokenEstimate,
      tests: testsInBudget,
      truncated,
      totalCount: ranked.length,
    },
    reuse,
    conventions: style.exemplars.length > 0 ? style.exemplars : [],
    order: null,
    workingSet: null,
    generatedAt: now.toISOString(),
    indexIndexedAt: snapshot.indexedAt,
    reuseProvenance: reuse.length > 0 ? "heuristic" : "unavailable",
    conventionsProvenance: style.provenance,
    ambiguous,
  };
}
