/**
 * Context pack + reuse-by-intent + House Style for `prepare_change` (M-070).
 *
 * Ranker scores files, not bodies. Serializer callers must pass the DTO
 * through MCP/CLI as-is — never attach file contents.
 */

import {
  isTestPath,
  offLimitReason,
  prepareMapTokenWeight,
  type FeatureInfo,
  type GitFileSignal,
  type IndexSnapshot,
  type IndexedFile,
  type PrepareChange,
  type PrepareAmbiguous,
  type ReuseHit,
  type Exemplar,
  type ContextFile,
  type HouseStylePatternId,
  type PrepareNote,
  type SignalProvenance,
  clampPrepareBudget,
  fitPrepareToBudget,
} from "@repo-prism/shared";
import { buildWorkOrder } from "./work-order.js";
import { rankFiles } from "./rank.js";
import {
  cachedDependencyGraph,
  cachedFeatureGraph,
  cachedKnowledgeGraph,
  cachedRationale,
} from "./graph-cache.js";
import type { KnowledgeGraphResult } from "../semantic/build.js";

export type PrepareMemory = {
  readonly text: string;
  readonly path?: string;
  readonly symbol?: string;
};

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

/** Path/token pieces that match too many files to be a unique seed. */
const WEAK_SEED = new Set([
  "src",
  "lib",
  "app",
  "pkg",
  "packages",
  "dist",
  "build",
  "test",
  "tests",
  "tmp",
  "node",
  "index",
  "main",
  "code",
  "file",
  "tsx",
  "jsx",
  "css",
  "mjs",
  "cjs",
]);

const FRAMEWORK_IMPORT = /^(express|next)(\/|$)/;
const HTTP_HANDLER =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|handler|default)$/;

const REUSE_THRESHOLD = 0.25;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export type BuildPrepareChangeInput = {
  readonly snapshot: IndexSnapshot;
  readonly task: string;
  readonly budget?: number;
  readonly gitFiles?: readonly GitFileSignal[];
  readonly frameworks?: readonly string[];
  readonly now?: Date;
  /** Dispatch memories to attach when they match a pack file (M-075). */
  readonly memories?: readonly PrepareMemory[];
};

function stemWord(token: string): string {
  const t = token.toLowerCase();
  if (t.length < 4) return t;
  if (t.endsWith("ies") && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith("ses") && t.length > 4) return t.slice(0, -2);
  if (
    t.endsWith("s") &&
    !t.endsWith("ss") &&
    !t.endsWith("us") &&
    !t.endsWith("is")
  ) {
    return t.slice(0, -1);
  }
  return t;
}

function tokensOverlap(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((t) => rightSet.has(t));
}

export function tokenizeTask(task: string): string[] {
  const out = new Set<string>();
  const parts = task.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  for (const part of parts) {
    const pieces = splitIdent(part);
    for (const piece of pieces) {
      const lower = piece.toLowerCase();
      if (lower.length < 3 || STOP.has(lower)) continue;
      out.add(lower);
      const stemmed = stemWord(lower);
      if (stemmed.length >= 3 && !STOP.has(stemmed)) out.add(stemmed);
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

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function fileStemKey(path: string): string {
  const base = basename(path)
    .replace(/\.(test|spec)\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i, "")
    .replace(/\.[^.]+$/, "");
  return base.replace(/[^A-Za-z0-9]+/g, "").toLowerCase();
}

/** Pure functions of a path, asked once per file on every Prepare call. */
const pathTokenCache = new Map<string, string[]>();
const offLimitCache = new Map<string, ReturnType<typeof offLimitReason>>();

function remember<V>(cache: Map<string, V>, key: string, value: V): V {
  if (cache.size > 200_000) cache.clear();
  cache.set(key, value);
  return value;
}

function pathTokens(path: string): string[] {
  const hit = pathTokenCache.get(path);
  if (hit) return hit;
  const segs = path.replace(/\\/g, "/").split("/").filter(Boolean);
  const out = new Set<string>();
  for (const seg of segs) {
    const noExt = seg.replace(/\.[A-Za-z][A-Za-z0-9.]*$/, "");
    for (const piece of tokenizeTask(noExt)) out.add(piece);
  }
  return remember(pathTokenCache, path, [...out]);
}

function offLimit(path: string): ReturnType<typeof offLimitReason> {
  if (offLimitCache.has(path)) return offLimitCache.get(path);
  return remember(offLimitCache, path, offLimitReason(path));
}

/*
 * Prepare scores every file in the snapshot. The lookups below were linear
 * scans per file, which made one call quadratic: 11s at 10k files (M-095).
 * Each is built once per snapshot (or feature list) and dropped with it.
 */

const featuresByFileCache = new WeakMap<
  readonly FeatureInfo[],
  Map<string, FeatureInfo[]>
>();

function featuresByFile(
  features: readonly FeatureInfo[],
): Map<string, FeatureInfo[]> {
  const hit = featuresByFileCache.get(features);
  if (hit) return hit;
  const map = new Map<string, FeatureInfo[]>();
  for (const feature of features) {
    for (const path of feature.memberFiles) {
      const list = map.get(path) ?? [];
      list.push(feature);
      map.set(path, list);
    }
  }
  featuresByFileCache.set(features, map);
  return map;
}

/** Identifier names repeat across files; tokenize each distinct one once. */
const nameTokenCache = new Map<string, string[]>();

function nameTokens(name: string): string[] {
  return (
    nameTokenCache.get(name) ??
    remember(nameTokenCache, name, tokenizeTask(name))
  );
}

function importNeighbors(snapshot: IndexSnapshot): Map<string, Set<string>> {
  const graph = cachedDependencyGraph(snapshot).graph;
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

const gitByPathCache = new WeakMap<
  readonly GitFileSignal[],
  Map<string, GitFileSignal>
>();

function gitRow(
  file: string,
  gitFiles: readonly GitFileSignal[] | undefined,
): GitFileSignal | undefined {
  if (!gitFiles) return undefined;
  let byPath = gitByPathCache.get(gitFiles);
  if (!byPath) {
    byPath = new Map(gitFiles.map((g) => [g.path, g]));
    gitByPathCache.set(gitFiles, byPath);
  }
  return byPath.get(file);
}

function ownershipHot(
  file: string,
  gitFiles: readonly GitFileSignal[] | undefined,
): number {
  const row = gitRow(file, gitFiles);
  if (!row || row.commits <= 0) return 0;
  const top = row.contributors.reduce((m, c) => Math.max(m, c.commits), 0);
  return Math.min(1, top / row.commits);
}

function recentChurn(
  file: string,
  gitFiles: readonly GitFileSignal[] | undefined,
  now: Date,
): number {
  const row = gitRow(file, gitFiles);
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

function importCovers(source: string, implPath: string): boolean {
  const implBase = basename(implPath).replace(/\.[^.]+$/, "");
  const trimmed = source.replace(/\\/g, "/").replace(/\.[^.]+$/, "");
  return trimmed === implBase || trimmed.endsWith(`/${implBase}`);
}

function samePackagePrefix(a: string, b: string): boolean {
  const as = a.split("/");
  const bs = b.split("/");
  if (as[0] === "packages" && bs[0] === "packages") {
    return as[1] !== undefined && as[1] === bs[1];
  }
  return as[0] === bs[0];
}

function nearbyTestDir(impl: string, test: string): boolean {
  const implDir = dirname(impl);
  const testDir = dirname(test);
  if (testDir === implDir) return true;
  if (
    implDir &&
    (test.startsWith(`${implDir}/`) || impl.startsWith(`${testDir}/`))
  ) {
    return true;
  }
  const implParent = dirname(implDir);
  if (
    implParent &&
    (testDir === implParent || testDir.startsWith(`${implParent}/`))
  ) {
    return true;
  }
  return false;
}

function stemsCover(impl: string, test: string): boolean {
  const implKey = fileStemKey(impl);
  const testKey = fileStemKey(test);
  if (!implKey || !testKey) return false;
  if (implKey === testKey) return true;
  if (
    implKey.length >= 6 &&
    testKey.length >= 6 &&
    (implKey.includes(testKey) || testKey.includes(implKey))
  ) {
    return true;
  }
  const implTok = new Set(pathTokens(impl));
  const overlap = pathTokens(test).filter(
    (t) => implTok.has(t) && t.length >= 3,
  );
  return overlap.length >= 2;
}

function testsFor(snapshot: IndexSnapshot, paths: readonly string[]): string[] {
  const kg = cachedKnowledgeGraph(snapshot);
  const out = new Set<string>();
  for (const path of paths) {
    if (isTestPath(path)) out.add(path);
  }
  for (const file of snapshot.files) {
    if (!isTestPath(file.path)) continue;
    if (paths.some((p) => file.path.startsWith(p.replace(/\/[^/]+$/, "/")))) {
      out.add(file.path);
    }
    const covers = paths.some(
      (p) =>
        file.imports.some((imp) => importCovers(imp.source, p)) ||
        ((nearbyTestDir(p, file.path) || samePackagePrefix(p, file.path)) &&
          stemsCover(p, file.path)),
    );
    if (covers) out.add(file.path);
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

function pastedPaths(task: string): string[] {
  const out: string[] = [];
  const re =
    /(?:^|[\s`"'(])((?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.[A-Za-z][A-Za-z0-9.]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(task))) {
    const raw = match[1]!.replace(/^\.?\//, "");
    if (raw && !raw.startsWith("/")) out.push(raw);
  }
  return [...new Set(out)];
}

function resolvePastedPath(
  snapshot: IndexSnapshot,
  pasted: string,
): string | undefined {
  const exact = snapshot.files.find((f) => f.path === pasted);
  if (exact) return exact.path;
  const ends = snapshot.files.filter(
    (f) => f.path.endsWith(`/${pasted}`) || f.path === pasted,
  );
  return ends.length === 1 ? ends[0]!.path : undefined;
}

function filenameTokens(path: string): string[] {
  const base = basename(path).replace(/\.[^.]+$/, "");
  return tokenizeTask(base);
}

function exactFilenameToken(path: string, token: string): boolean {
  const base = basename(path)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
  return (
    base === token ||
    stemWord(base) === token ||
    fileStemKey(path) === token ||
    fileStemKey(path) === token.replace(/[^a-z0-9]/g, "")
  );
}

function exactSymbolFiles(snapshot: IndexSnapshot, token: string): string[] {
  const files = new Set<string>();
  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    for (const symbol of file.symbols) {
      const lower = symbol.name.toLowerCase();
      if (lower === token || stemWord(lower) === token) files.add(file.path);
    }
  }
  return [...files];
}

function resolveSeeds(
  snapshot: IndexSnapshot,
  task: string,
  tokens: readonly string[],
): {
  seeds: string[];
  /** Seeds the task named outright: a pasted path or a declared identifier. */
  strong: Set<string>;
  ambiguous: PrepareAmbiguous | null;
} {
  const kg = cachedKnowledgeGraph(snapshot);
  let ambiguous: PrepareAmbiguous | null = null;
  const seeds = new Set<string>();
  const strong = new Set<string>();

  for (const pasted of pastedPaths(task)) {
    const hit = resolvePastedPath(snapshot, pasted);
    if (hit) {
      seeds.add(hit);
      strong.add(hit);
    }
  }

  for (const name of identifiers(task)) {
    const named = kg.symbols.filter((s) => s.name === name);
    // `export { x } from` re-exports carry kind "export"; the declaration is the target.
    const declared = named.filter((s) => s.kind !== "export");
    const hits = declared.length > 0 ? declared : named;
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
    if (files[0]) {
      seeds.add(files[0]);
      strong.add(files[0]);
    }
  }

  const blocked = new Set(ambiguous?.candidates.map((c) => c.path) ?? []);
  for (const token of tokens) {
    if (WEAK_SEED.has(token) || STOP.has(token)) continue;
    const files = exactSymbolFiles(snapshot, token).filter(
      (p) => !blocked.has(p),
    );
    if (files.length === 1 && files[0]) seeds.add(files[0]);
  }

  for (const token of tokens) {
    if (WEAK_SEED.has(token) || STOP.has(token)) continue;
    const files = snapshot.files
      .filter((f) => !blocked.has(f.path) && exactFilenameToken(f.path, token))
      .map((f) => f.path);
    if (files.length === 1 && files[0]) seeds.add(files[0]);
  }

  // Two-token filename overlap ("list" + "users" → listUsers.ts) is a reuse
  // name hit, not a change-target seed. Only promote when nothing else seeded.
  if (seeds.size === 0) {
    const strongPath: string[] = [];
    for (const file of snapshot.files) {
      if (blocked.has(file.path)) continue;
      const overlap = filenameTokens(file.path).filter((t) =>
        tokens.includes(t),
      );
      if (overlap.length >= 2) strongPath.push(file.path);
    }
    if (strongPath.length === 1 && strongPath[0]) seeds.add(strongPath[0]);
  }

  return { seeds: [...seeds], strong, ambiguous };
}

export function scoreReuse(
  snapshot: IndexSnapshot,
  taskTokens: readonly string[],
  seedFiles: readonly string[],
  features: readonly FeatureInfo[],
  /**
   * Pass the caller's own knowledge graph when it already built one —
   * rebuilding it per call is fine once per request, but ruinous in a loop
   * (Prism Guard's per-symbol duplicate check learned this the hard way).
   */
  knowledgeGraph?: KnowledgeGraphResult,
): ReuseHit[] {
  const kg = knowledgeGraph ?? cachedKnowledgeGraph(snapshot);
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
  const byFile = featuresByFile(features);
  const seedSet = new Set(seedFiles);
  for (const symbol of kg.symbols) {
    if (!symbol.exported) continue;
    if (seedSet.has(symbol.path)) continue;
    if (offLimit(symbol.path)) continue;
    let score = 0;
    const reasons: string[] = [];
    const nameHit = tokensOverlap(nameTokens(symbol.name), taskTokens);
    if (nameHit) {
      score += 0.55;
      reasons.push(`name overlaps task (${symbol.name})`);
    }
    if (nameHit && (symbol.kind === "function" || symbol.kind === "class")) {
      score += 0.15;
      reasons.push(`kind ${symbol.kind}`);
    }
    const shared = (byFile.get(symbol.path) ?? []).filter(
      (f) =>
        seedFeatureIds.has(f.id) ||
        tokensOverlap(nameTokens(f.name), taskTokens),
    );
    if (shared.length > 0) {
      score += 0.25;
      reasons.push(`feature ${shared[0]!.name}`);
    }
    if (imported.has(symbol.name)) {
      score += 0.05;
      reasons.push("already imported in a seed file");
    }
    if (!nameHit && shared.length === 0) continue;
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
  const graph = cachedDependencyGraph(snapshot).graph;
  return graph.edges.filter(
    (e) => e.to === `file:${path}` && e.from.startsWith("file:"),
  ).length;
}

function pickSymbol(snapshot: IndexSnapshot, path: string): string {
  const exported = exportedSymbols(snapshot, path);
  return exported[0] ?? path.split("/").pop() ?? path;
}

function isNextRouteFile(path: string): boolean {
  return (
    /(?:^|\/)app\/(?:.+\/)?route\.(t|j)sx?$/.test(path) ||
    /(?:^|\/)pages\/api\/.+\.(t|j)sx?$/.test(path)
  );
}

function isRouteHandlerFile(
  file: IndexedFile,
  frameworks: readonly string[] | undefined,
): boolean {
  if (isTestPath(file.path)) return false;
  if (/(?:^|\/)routes\//.test(file.path)) return true;
  if (isNextRouteFile(file.path)) return true;
  if (
    file.imports.some(
      (imp) => imp.source === "express" || imp.source.startsWith("express/"),
    )
  ) {
    return true;
  }
  if (
    frameworks?.some((f) => /express/i.test(f)) &&
    /handler/i.test(file.path)
  ) {
    return true;
  }
  const nextImport = file.imports.some(
    (imp) => imp.source === "next" || imp.source.startsWith("next/"),
  );
  if (nextImport && file.symbols.some((s) => HTTP_HANDLER.test(s.name))) {
    return true;
  }
  return false;
}

function isScreenFile(file: IndexedFile): boolean {
  if (isTestPath(file.path) || isNextRouteFile(file.path)) return false;
  if (/(?:^|\/)routes\//.test(file.path)) return false;
  if (/(?:^|\/)[^/]*(?:view|screen|page)\.(t|j)sx?$/i.test(file.path)) {
    return true;
  }
  if (
    /(?:^|\/)(?:views|screens|pages|dashboard)\//i.test(file.path) &&
    /\.(t|j)sx$/.test(file.path)
  ) {
    return true;
  }
  if (/(?:^|\/)app\/.+\/page\.(t|j)sx?$/.test(file.path)) return true;
  return file.symbols.some((s) => /(?:Screen|View|Page)$/.test(s.name));
}

function implBesideTest(impl: string, test: string): boolean {
  if (dirname(impl) !== dirname(test)) return false;
  const implBase = basename(impl)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
  const testBase = basename(test)
    .replace(/\.(test|spec)\.[^.]+$/i, "")
    .toLowerCase();
  return implBase === testBase;
}

function isColocatedTestFile(
  file: IndexedFile,
  snapshot: IndexSnapshot,
): boolean {
  if (!isTestPath(file.path)) return false;
  return snapshot.files.some(
    (other) =>
      other.path !== file.path &&
      !isTestPath(other.path) &&
      implBesideTest(other.path, file.path),
  );
}

function isWorkerFile(file: IndexedFile): boolean {
  if (isTestPath(file.path)) return false;
  if (/(?:^|\/)(?:workers?|jobs?|queues?)\//i.test(file.path)) return true;
  if (
    /(?:^|\/)[^/]*(?:worker|queue-handler|job-handler)\.[tj]sx?$/i.test(
      file.path,
    )
  ) {
    return true;
  }
  return file.symbols.some((s) =>
    /(?:Worker|QueueHandler|JobHandler|process\w*Job|handle\w*Job)$/.test(
      s.name,
    ),
  );
}

function rankPatternFiles(
  files: readonly IndexedFile[],
  snapshot: IndexSnapshot,
  gitFiles: readonly GitFileSignal[] | undefined,
  pattern: HouseStylePatternId,
  copy: {
    canonical: string;
    recent: string;
    older: string;
    extra: string;
  },
): Exemplar[] {
  if (files.length === 0) return [];
  const ranked = [...files].sort((a, b) => {
    const inbound =
      inboundCount(snapshot, b.path) - inboundCount(snapshot, a.path);
    if (inbound !== 0) return inbound;
    const local =
      b.imports.filter((imp) => !FRAMEWORK_IMPORT.test(imp.source)).length -
      a.imports.filter((imp) => !FRAMEWORK_IMPORT.test(imp.source)).length;
    if (local !== 0) return local;
    return a.path.localeCompare(b.path);
  });
  const byGit = [...files].sort((a, b) => {
    const da = gitFiles?.find((g) => g.path === a.path)?.lastCommit.date ?? "";
    const db = gitFiles?.find((g) => g.path === b.path)?.lastCommit.date ?? "";
    return db.localeCompare(da);
  });
  const canonical = ranked[0]!;
  const recent = byGit[0] ?? ranked[0]!;
  const older = byGit[byGit.length - 1] ?? ranked[ranked.length - 1]!;
  const exemplars: Exemplar[] = [
    {
      path: canonical.path,
      symbol: pickSymbol(snapshot, canonical.path),
      patternId: pattern,
      whyCanonical: copy.canonical,
    },
  ];
  if (recent.path !== canonical.path) {
    exemplars.push({
      path: recent.path,
      symbol: pickSymbol(snapshot, recent.path),
      patternId: pattern,
      whyCanonical: copy.recent,
    });
  }
  if (older.path !== canonical.path && older.path !== recent.path) {
    exemplars.push({
      path: older.path,
      symbol: pickSymbol(snapshot, older.path),
      patternId: pattern,
      whyCanonical: copy.older,
    });
  }
  while (exemplars.length < 3 && ranked[exemplars.length]) {
    const extra = ranked[exemplars.length]!;
    if (exemplars.some((e) => e.path === extra.path)) break;
    exemplars.push({
      path: extra.path,
      symbol: pickSymbol(snapshot, extra.path),
      patternId: pattern,
      whyCanonical: copy.extra,
    });
  }
  return exemplars.slice(0, 3);
}

const houseStyleCache = new WeakMap<
  IndexSnapshot,
  {
    key: string;
    git: readonly GitFileSignal[] | undefined;
    value: ReturnType<typeof houseStyle>;
  }
>();

/** House style does not depend on the task, only on the index and git. */
function cachedHouseStyle(
  snapshot: IndexSnapshot,
  frameworks: readonly string[] | undefined,
  gitFiles: readonly GitFileSignal[] | undefined,
): ReturnType<typeof houseStyle> {
  const key = (frameworks ?? []).join("\0");
  const hit = houseStyleCache.get(snapshot);
  if (hit && hit.key === key && hit.git === gitFiles) return hit.value;
  const value = houseStyle(snapshot, frameworks, gitFiles);
  houseStyleCache.set(snapshot, { key, git: gitFiles, value });
  return value;
}

function houseStyle(
  snapshot: IndexSnapshot,
  frameworks: readonly string[] | undefined,
  gitFiles: readonly GitFileSignal[] | undefined,
): { exemplars: Exemplar[]; provenance: SignalProvenance } {
  const handlers = snapshot.files.filter((f) =>
    isRouteHandlerFile(f, frameworks),
  );
  const screens = snapshot.files.filter((f) => isScreenFile(f));
  const colocated = snapshot.files.filter((f) =>
    isColocatedTestFile(f, snapshot),
  );
  const workers = snapshot.files.filter((f) => isWorkerFile(f));

  const express = looksLikeExpress(snapshot, frameworks);
  const exemplars: Exemplar[] = [
    ...rankPatternFiles(handlers, snapshot, gitFiles, "route-handler", {
      canonical: "handlers next to the route",
      recent: "most recently touched handler",
      older: "older handler in the same layout",
      extra: express
        ? "same Express route layout"
        : "same route-handler layout",
    }),
    ...rankPatternFiles(screens, snapshot, gitFiles, "screen", {
      canonical: "UI screen next to its feature",
      recent: "most recently touched screen",
      older: "older screen in the same layout",
      extra: "same screen layout",
    }),
    ...rankPatternFiles(colocated, snapshot, gitFiles, "colocated-test", {
      canonical: "test file next to the implementation",
      recent: "most recently touched colocated test",
      older: "older colocated test",
      extra: "same colocated-test layout",
    }),
    ...rankPatternFiles(workers, snapshot, gitFiles, "worker", {
      canonical: "job / queue worker in this repo",
      recent: "most recently touched worker",
      older: "older worker in the same layout",
      extra: "same worker layout",
    }),
  ];

  if (exemplars.length === 0) {
    return { exemplars: [], provenance: "unavailable" };
  }
  return { exemplars, provenance: "heuristic" };
}

function notesForPack(
  snapshot: IndexSnapshot,
  packed: readonly ContextFile[],
  memories: readonly PrepareMemory[] | undefined,
): PrepareNote[] {
  const packPaths = new Set(packed.map((f) => f.path));
  const packSymbols = new Set(packed.flatMap((f) => f.symbols));
  const notes: PrepareNote[] = [];
  const seen = new Set<string>();
  const push = (note: PrepareNote) => {
    const key = `${note.source}\0${note.path}\0${note.symbol ?? ""}\0${note.text}`;
    if (seen.has(key)) return;
    seen.add(key);
    notes.push(note);
  };
  for (const memory of memories ?? []) {
    const pathHit = memory.path !== undefined && packPaths.has(memory.path);
    const symbolHit =
      memory.symbol !== undefined && packSymbols.has(memory.symbol);
    if (!pathHit && !symbolHit) continue;
    const path =
      memory.path && packPaths.has(memory.path)
        ? memory.path
        : (packed.find((f) => f.symbols.includes(memory.symbol ?? ""))?.path ??
          memory.path);
    if (!path) continue;
    push({
      path,
      text: memory.text,
      source: "memory",
      ...(memory.symbol ? { symbol: memory.symbol } : {}),
    });
  }
  for (const hit of cachedRationale(snapshot).hits) {
    if (!packPaths.has(hit.toPath)) continue;
    push({
      path: hit.toPath,
      text: hit.text,
      source: "rationale",
      rationaleFor: hit.adrPath,
    });
  }
  return notes.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.source.localeCompare(b.source) ||
      a.text.localeCompare(b.text),
  );
}

export function buildPrepareChange(
  input: BuildPrepareChangeInput,
): PrepareChange {
  const snapshot = input.snapshot;
  const task = input.task.trim() || "change";
  const budget = clampPrepareBudget(input.budget);
  const now = input.now ?? new Date();
  const tokens = tokenizeTask(task);
  const features = cachedFeatureGraph(snapshot).features;
  // Named seeds (pasted path, declared identifier, unique exact name) anchor
  // reuse; the ranker adds IDF seeds of its own for the file list.
  const { seeds, strong, ambiguous } = resolveSeeds(snapshot, task, tokens);
  const adj = importNeighbors(snapshot);
  const git = input.gitFiles;

  // Plan §5.1: IDF seeds + import distance; tests and off-limits excluded;
  // recency/ownership only break ties.
  const { ranked } = rankFiles({
    snapshot,
    task,
    strong,
    neighbors: adj,
    tieBreak: (path) =>
      Math.max(ownershipHot(path, git), recentChurn(path, git, now)),
  });

  // Files and tests share what the reserves (reuse 15%, house style 10%,
  // work order 10%) leave; fitPrepareToBudget enforces the hard cap.
  const fileBudget = Math.floor(budget * 0.65);
  const packed: ContextFile[] = [];
  let tokenEstimate = 0;
  for (const row of ranked) {
    const symbols = exportedSymbols(snapshot, row.path);
    const tokenWeight = prepareMapTokenWeight(row.path, symbols, row.why);
    if (packed.length > 0 && tokenEstimate + tokenWeight > fileBudget) break;
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
    if (
      tokenEstimate + testsWeight + w > fileBudget &&
      testsInBudget.length > 0
    ) {
      break;
    }
    testsInBudget.push(path);
    testsWeight += w;
  }
  tokenEstimate += testsWeight;
  const truncated = packed.length < ranked.length;
  const reuse = scoreReuse(snapshot, tokens, seeds, features);
  const style = cachedHouseStyle(snapshot, input.frameworks, git);
  const notes = notesForPack(snapshot, packed, input.memories);
  const order = buildWorkOrder({
    snapshot,
    packPaths: packed.map((f) => f.path),
    ...(git && git.length > 0 ? { gitFiles: git } : {}),
  });

  return fitPrepareToBudget(
    {
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
      notes,
      order,
      workingSet: null,
      generatedAt: now.toISOString(),
      indexIndexedAt: snapshot.indexedAt,
      reuseProvenance: reuse.length > 0 ? "heuristic" : "unavailable",
      conventionsProvenance: style.provenance,
      ambiguous,
    },
    budget,
  );
}
