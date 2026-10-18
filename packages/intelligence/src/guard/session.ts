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
import { isOrphanEligibleSource } from "../dependency/entry-points.js";
import {
  packageForFile,
  discoverLocalPackages,
} from "../dependency/packages.js";
import {
  cachedFeatureGraph,
  cachedKnowledgeGraph,
} from "../prepare/graph-cache.js";
import { scoreReuse, tokenizeTask } from "../prepare/pack.js";
import { wordTokens } from "../prepare/rank.js";
import { isSlowTypeCandidate, newSlowTypeExports } from "./slow-types.js";

const DUPLICATE_THRESHOLD = 0.7;

export type GuardCheckInput = {
  readonly snapshot: IndexSnapshot;
  readonly sessionPaths: readonly string[];
  readonly dependencyGraph: GraphSnapshotDto;
  /** Entry roles (plan §4.4): an entry point is never an orphan. */
  readonly entryRoles?: ReadonlyMap<string, string>;
  /**
   * The file as committed at HEAD: null for a new file, undefined when it
   * cannot be read (round 5). With it, a duplicate is only reported for a
   * symbol this change adds; without it, every exported symbol is checked.
   */
  readonly headSource?: (path: string) => string | null | undefined;
  /** The file as it is now, for the slow-type check (round 5). */
  readonly readSource?: (path: string) => string | null;
  /** The repo publishes to JSR, so exported functions need a return type. */
  readonly jsrPackage?: boolean;
};

/** `name` appears in `source` as a whole identifier. */
function mentions(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\w$])${escaped}($|[^\\w$])`).test(source);
}

/**
 * Exported functions this change left without a return type, in a JSR
 * package (round 5): `jsr publish` rejects them though every check passes.
 */
function checkSlowTypes(input: GuardCheckInput): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  if (!input.jsrPackage || !input.readSource) return out;
  for (const path of input.sessionPaths) {
    if (!isSlowTypeCandidate(path) || isTestPath(path)) continue;
    const current = input.readSource(path);
    if (current == null) continue;
    const head = input.headSource?.(path);
    if (head === undefined && input.headSource) continue;
    const names = newSlowTypeExports(current, head ?? null);
    if (names.length === 0) continue;
    out.set(
      path,
      names.map((name) => ({
        kind: "slow-type" as const,
        detail: `export "${name}" has no return type; jsr publish rejects slow types. Write the type.`,
        provenance: "measured" as const,
      })),
    );
  }
  return out;
}

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
    if (input.entryRoles?.has(path) || !isOrphanEligibleSource(path)) continue;
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

/**
 * `scoreReuse` scans every exported symbol in the repo per call — fine once,
 * ruinous per session symbol on a large monorepo with a big dirty session
 * (a 47-file session against this repo's own ~10k-symbol graph took 40+
 * blocking seconds before this cap existed). Guard is heuristic advice, not
 * an exhaustive audit, so a bounded sample is the right tradeoff: check the
 * first N exported symbols across the session and stop.
 */
const MAX_DUPLICATE_CHECKS = 40;

/**
 * `scoreReuse`'s 0.7 threshold is meant for "consider reusing this" — a
 * single shared word (e.g. both named `fetchSomething`) plus being a
 * function already clears it, which floods a large, conventionally-named
 * codebase with false positives when reused as a "this looks duplicated"
 * warning. Guard also requires one name to contain the other, matching its
 * own framing ("looks like an existing one") rather than "shares a word
 * with something". The contained name needs two words: one word alone
 * ("metadata" in "pageMetadata", "Page" in "AdminPage") is a common noun,
 * not a copy (website round).
 */
export function looksLikeSameSymbol(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) return true;
  const shorter = left.length <= right.length ? a : b;
  if (wordTokens(shorter).length < 2) return false;
  return left.includes(right) || right.includes(left);
}

/**
 * Files on `path`'s own re-export chain: the barrels that re-export it
 * (transitively) and the sources it re-exports from (transitively). A symbol
 * re-exported through a barrel is the same declaration, never a duplicate of
 * itself. The two directions are walked separately: two siblings that share
 * a barrel are different declarations, so they stay comparable (B3 fix).
 */
export function reexportFamily(
  graph: GraphSnapshotDto,
  path: string,
): ReadonlySet<string> {
  const sources = new Map<string, string[]>();
  const barrels = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "re-export") continue;
    const from = String(edge.from).replace(/^file:/, "");
    const to = String(edge.to).replace(/^file:/, "");
    sources.set(from, [...(sources.get(from) ?? []), to]);
    barrels.set(to, [...(barrels.get(to) ?? []), from]);
  }
  const family = new Set<string>();
  for (const next of [sources, barrels]) {
    const seen = new Set<string>([path]);
    const queue = [path];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const other of next.get(current) ?? []) {
        if (seen.has(other)) continue;
        seen.add(other);
        family.add(other);
        queue.push(other);
      }
    }
  }
  family.delete(path);
  return family;
}

function checkDuplicates(input: GuardCheckInput): Map<string, GuardFlag[]> {
  const out = new Map<string, GuardFlag[]>();
  // Per-snapshot graphs: every stop receipt runs this against the same
  // index, and rebuilding them took most of the receipt's time.
  const kg = cachedKnowledgeGraph(input.snapshot);
  const features = cachedFeatureGraph(input.snapshot).features;
  const sessionSet = new Set(input.sessionPaths);
  let checked = 0;
  for (const path of input.sessionPaths) {
    if (checked >= MAX_DUPLICATE_CHECKS) break;
    // A framework route's exports (metadata, default Page, GET) are the
    // framework's names, the same in every route by design.
    if (isTestPath(path) || input.entryRoles?.get(path) === "route") continue;
    const exportedHere = kg.symbols.filter(
      (s) => s.path === path && s.exported,
    );
    const family = reexportFamily(input.dependencyGraph, path);
    // Round 5: a symbol the file already had at HEAD is not a copy this
    // change made (B3: all 30 duplicate flags were on such symbols).
    const head = input.headSource?.(path);
    for (const symbol of exportedHere) {
      if (checked >= MAX_DUPLICATE_CHECKS) break;
      if (typeof head === "string" && mentions(head, symbol.name)) continue;
      checked += 1;
      const hits = scoreReuse(
        input.snapshot,
        tokenizeTask(symbol.name),
        [path],
        features,
        kg,
      );
      const top = hits.find(
        (hit) =>
          !sessionSet.has(hit.path) &&
          !family.has(hit.path) &&
          !isTestPath(hit.path) &&
          input.entryRoles?.get(hit.path) !== "route" &&
          looksLikeSameSymbol(symbol.name, hit.symbol),
      );
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

  // Only analysed source files place a session (docs and assets do not), and
  // only a package other packages import is a boundary worth a warning: a
  // leaf package (benchmarks, docs, examples) cannot break anyone else.
  const analyzed = new Set(
    input.snapshot.files
      .filter((f) => f.status === "analyzed")
      .map((f) => f.path),
  );
  const imported = new Set<string>();
  for (const edge of input.dependencyGraph.edges) {
    const from = packageForFile(
      String(edge.from).replace(/^file:/, ""),
      packages,
    );
    const to = packageForFile(String(edge.to).replace(/^file:/, ""), packages);
    if (from && to && from.name !== to.name) imported.add(to.name);
  }
  const counts = new Map<string, number>();
  const packageByPath = new Map<string, ReturnType<typeof packageForFile>>();
  for (const path of input.sessionPaths) {
    if (!analyzed.has(path)) continue;
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
    if (!pkg || pkg.name === dominant || !imported.has(pkg.name)) continue;
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
    checkSlowTypes(input),
  ]);
}
