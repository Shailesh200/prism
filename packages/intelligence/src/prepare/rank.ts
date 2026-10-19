/**
 * Prepare file ranking (plan §5.1 / §5.5, P§2).
 *
 * Per-index IDF over path tokens and symbol names: a task token that few
 * files carry is strong evidence, one that every file carries is none. The
 * best lexical matches seed the pack; their import neighbours follow by
 * import distance, and files git saw change with a seed follow by how often
 * (P7). Both outrank recency and ownership, which only break ties. Source files only: tests go to `tests[]`, and off-limits
 * (generated, vendored) files are never ranked. No keyword lists and no
 * per-repo cases — every weight comes from the index itself.
 */
import {
  isTestPath,
  offLimitReason,
  sourceLanguageOf,
  type IndexSnapshot,
} from "@repo-prism/shared";

/** Splits identifiers and paths into lowercase word tokens. */
export function wordTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length >= 2 && !/^\d+$/.test(t));
}

/** A light suffix stem so "headers"/"header", "matching"/"match" meet. */
export function stem(token: string): string {
  let t = token;
  if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 4 && t.endsWith("es") && /(?:ss|x|ch|sh)es$/.test(t))
    t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !/(?:ss|us|is)$/.test(t))
    t = t.slice(0, -1);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  return t;
}

type Doc = {
  /** stem → channel weight (filename 1, symbol 0.8, directory 0.5). */
  readonly weights: ReadonlyMap<string, number>;
};

export type RankIndex = {
  readonly n: number;
  readonly df: ReadonlyMap<string, number>;
  readonly docs: ReadonlyMap<string, Doc>;
};

const FILENAME_WEIGHT = 1;
const SYMBOL_WEIGHT = 0.8;
const DIRECTORY_WEIGHT = 0.5;

/** Whether `path` is a source file Prepare may put in `files[]`. */
export function isRankableSource(path: string): boolean {
  return (
    sourceLanguageOf(path) === "TypeScript/JavaScript" &&
    !/\.d\.[cm]?ts$/i.test(path) &&
    !isTestPath(path) &&
    offLimitReason(path) === undefined
  );
}

const indexCache = new WeakMap<IndexSnapshot, RankIndex>();

export function rankIndexFor(snapshot: IndexSnapshot): RankIndex {
  const hit = indexCache.get(snapshot);
  if (hit) return hit;
  const docs = new Map<string, Doc>();
  const df = new Map<string, number>();
  for (const file of snapshot.files) {
    if (file.status !== "analyzed" || !isRankableSource(file.path)) continue;
    const weights = new Map<string, number>();
    const put = (token: string, w: number) => {
      const s = stem(token);
      if ((weights.get(s) ?? 0) < w) weights.set(s, w);
    };
    const segs = file.path.split("/");
    const base = (segs.pop() ?? "").replace(/\.[^.]+$/, "");
    for (const seg of segs)
      for (const t of wordTokens(seg)) put(t, DIRECTORY_WEIGHT);
    for (const s of file.symbols)
      for (const t of wordTokens(s.name)) put(t, SYMBOL_WEIGHT);
    // `index.ts` is named by its folder.
    const named = /^index$/i.test(base) ? (segs.at(-1) ?? base) : base;
    for (const t of wordTokens(named)) put(t, FILENAME_WEIGHT);
    for (const t of wordTokens(base)) put(t, FILENAME_WEIGHT);
    docs.set(file.path, { weights });
    for (const s of weights.keys()) df.set(s, (df.get(s) ?? 0) + 1);
  }
  const value: RankIndex = { n: docs.size, df, docs };
  indexCache.set(snapshot, value);
  return value;
}

export function idf(index: RankIndex, stemmed: string): number {
  const d = index.df.get(stemmed) ?? 0;
  if (d === 0) return 0;
  return Math.log(1 + index.n / d);
}

/**
 * English function words. IDF already discounts words that are common in the
 * index, but a function word that happens to be rare there ("when.ts") must
 * not seed a pack. This is the language's grammar, not a repo keyword list.
 */
const FUNCTION_WORDS = new Set(
  "a an the and or but if of to in on at by for with from into onto over under as is are was were be been being it its this that these those there their then than when while where which who what why how so not no do does did can could should would will shall may might must some any all each every our your my we you they he she them us me i".split(
    " ",
  ),
);

/** Task query: distinct stems, each with its IDF (0 when absent from index). */
export function queryStems(
  index: RankIndex,
  task: string,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of wordTokens(task)) {
    if (FUNCTION_WORDS.has(t)) continue;
    const s = stem(t);
    if (out.has(s)) continue;
    out.set(s, idf(index, s));
  }
  return out;
}

/**
 * Lexical score in [0, 1]: the IDF mass of query stems the file carries
 * (weighted by channel), over the IDF mass of all query stems the index
 * knows. Common words carry little IDF, so they cannot dominate.
 */
export function lexicalScores(
  index: RankIndex,
  query: ReadonlyMap<string, number>,
): Map<string, { score: number; matched: string[] }> {
  let mass = 0;
  for (const w of query.values()) mass += w;
  const out = new Map<string, { score: number; matched: string[] }>();
  if (mass === 0) return out;
  for (const [path, doc] of index.docs) {
    let s = 0;
    const matched: string[] = [];
    for (const [q, w] of query) {
      const cw = doc.weights.get(q);
      if (cw === undefined || w === 0) continue;
      s += cw * w;
      matched.push(q);
    }
    if (s > 0) out.set(path, { score: s / mass, matched });
  }
  return out;
}

/**
 * Workspace packages (a folder with a package.json, not inside another one)
 * whose folder name the task says outright: "the website" is apps/website.
 * Whole words, not stems, so "check links" does not mean packages/checks.
 */
export function taskAreas(snapshot: IndexSnapshot, task: string): string[] {
  const roots = snapshot.files
    .map((f) => f.path)
    .filter((p) => p.endsWith("/package.json"))
    .map((p) => p.slice(0, -"/package.json".length));
  const top = roots.filter(
    (r) => !roots.some((o) => o !== r && r.startsWith(`${o}/`)),
  );
  const words = new Set(wordTokens(task));
  return top.filter((root) => {
    const name = wordTokens(root.split("/").at(-1) ?? "");
    return name.length > 0 && name.every((t) => words.has(t));
  });
}

export type RankConfidence = "high" | "medium" | "low";

export type RankedFile = {
  readonly path: string;
  readonly score: number;
  /** Top 1–2 ranking features in words (plan P9). */
  readonly why: string[];
  readonly provenance: "measured" | "heuristic";
  /** Derived from provenance + evidence strength (plan P9). */
  readonly confidence: RankConfidence;
};

/** Map ranking provenance to a pick confidence (CONF-1..3). */
export function rankConfidence(
  provenance: RankedFile["provenance"],
  why: readonly string[],
  /**
   * CONF-4: the task named the file, or its own text matches the task about
   * as well as the best match. Being near a seed alone is not enough to be
   * sure: seeds include any match within 60% of the best.
   */
  strongEvidence = true,
): RankConfidence {
  // CONF-3: stale index always low.
  if (why.some((w) => /stale index|partial index/i.test(w))) return "low";
  // Dynamic-access fallback is weak evidence.
  if (why.some((w) => /dynamic/i.test(w))) return "low";
  // CONF-2: unresolved import → medium (honest, not high).
  if (why.some((w) => /unresolved/i.test(w))) return "medium";
  if (!strongEvidence) return "medium";
  if (
    provenance === "measured" &&
    why.some(
      (w) =>
        w.startsWith("import distance") ||
        w === "seed file" ||
        w.startsWith("changed with"),
    )
  ) {
    return "high";
  }
  if (provenance === "measured") return "high";
  return "medium";
}

/** A file that changed in the same commits as another (git co-change). */
export type CoChangePartner = {
  readonly path: string;
  readonly together: number;
  /** together / commits touching either file, in (0, 1]. */
  readonly jaccard: number;
};

export type RankInput = {
  readonly snapshot: IndexSnapshot;
  readonly task: string;
  /** Files the task named outright (pasted path, declared identifier). */
  readonly strong: ReadonlySet<string>;
  /** Undirected import adjacency. */
  readonly neighbors: ReadonlyMap<string, ReadonlySet<string>>;
  /** Co-change partners of a path, strongest first (absent without git). */
  readonly coChange?: (path: string) => readonly CoChangePartner[];
  /** Tie-breaker in [0, 1] per path (recency/ownership); never outranks distance. */
  readonly tieBreak?: (path: string) => number;
  /**
   * Per-path feedback score in [0, 1] from past suggested→edited (P6).
   * Multiplied by FEEDBACK_WEIGHT (≤ 0.12) so it cannot dominate.
   */
  readonly feedback?: (path: string) => number;
  /** Paths that import something the index could not resolve (CONF-2). */
  readonly unresolvedFrom?: ReadonlySet<string>;
  /** True when the index is known stale (CONF-3). */
  readonly indexStale?: boolean;
  /** True when the index was capped and is missing files (round 4). */
  readonly partialIndex?: boolean;
};

/** Seeds: strong names, then lexical matches within 60% of the best. */
const SEED_RATIO = 0.6;
const MAX_SEEDS = 5;
const MAX_HOPS = 3;
const PROXIMITY_WEIGHT = 0.45;
/** A partner that always changes with a seed (jaccard 1) ranks like import distance 1. */
const COCHANGE_WEIGHT = 0.225;
/** Past edits for similar tasks (P6); capped so it cannot dominate. */
/** @deprecated use shared FEEDBACK_WEIGHT_CAP — kept in sync. */
export const RANK_FEEDBACK_WEIGHT = 0.12;
const FEEDBACK_WEIGHT = RANK_FEEDBACK_WEIGHT;
const STRONG_BONUS = 1;
const TIE_WEIGHT = 0.02;
const MIN_SCORE = 0.05;
/** CONF-4: a file is "sure" only when its own match is this close to the best. */
const SURE_RATIO = 0.8;

export function rankFiles(input: RankInput): {
  ranked: RankedFile[];
  seeds: string[];
} {
  const index = rankIndexFor(input.snapshot);
  const query = queryStems(index, input.task);
  const lex = lexicalScores(index, query);
  // A task that names a package matches text inside it only (when any does).
  const areas = taskAreas(input.snapshot, input.task);
  if (areas.length > 0) {
    const inArea = (p: string) => areas.some((a) => p.startsWith(`${a}/`));
    if ([...lex.keys()].some(inArea)) {
      // Deleting while iterating a Map is safe.
      for (const p of lex.keys()) if (!inArea(p)) lex.delete(p);
    }
  }
  const best = Math.max(0, ...[...lex.values()].map((v) => v.score));
  const lexSeeds = [...lex.entries()]
    .filter(([, v]) => best > 0 && v.score >= best * SEED_RATIO)
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, MAX_SEEDS)
    .map(([p]) => p);
  const seeds = [
    ...[...input.strong].filter((p) => index.docs.has(p)),
    ...lexSeeds.filter((p) => !input.strong.has(p)),
  ];

  // Import distance from the nearest seed (undirected, bounded).
  const dist = new Map<string, number>(seeds.map((s) => [s, 0]));
  let frontier = [...seeds];
  for (let d = 1; d <= MAX_HOPS && frontier.length > 0; d += 1) {
    const next: string[] = [];
    for (const node of frontier)
      for (const n of input.neighbors.get(node) ?? []) {
        if (dist.has(n)) continue;
        dist.set(n, d);
        next.push(n);
      }
    frontier = next;
  }

  // Git coupling with a seed, where no import may say so.
  const co = new Map<string, CoChangePartner & { readonly seed: string }>();
  for (const seed of seeds)
    for (const partner of input.coChange?.(seed) ?? []) {
      if (!index.docs.has(partner.path)) continue;
      const prev = co.get(partner.path);
      if (!prev || partner.jaccard > prev.jaccard)
        co.set(partner.path, { ...partner, seed });
    }

  const candidates = new Set<string>([
    ...lex.keys(),
    ...dist.keys(),
    ...co.keys(),
  ]);
  if (input.feedback) {
    for (const path of index.docs.keys()) {
      if ((input.feedback(path) ?? 0) > 0) candidates.add(path);
    }
  }
  const ranked: RankedFile[] = [];
  for (const path of candidates) {
    if (!index.docs.has(path)) continue;
    const l = lex.get(path);
    const d = dist.get(path);
    const why: string[] = [];
    let score = l?.score ?? 0;
    if (l) why.push(`matches ${l.matched.slice(0, 4).join(", ")}`);
    if (input.strong.has(path)) {
      score += STRONG_BONUS;
      why.push("named in task");
    }
    if (d !== undefined) {
      // Neighbours inherit relevance from the seed, decaying with distance.
      score += PROXIMITY_WEIGHT * best * (d === 0 ? 1 : 1 / (1 + d));
      why.push(d === 0 ? "seed file" : `import distance ${d}`);
    }
    const c = co.get(path);
    if (c) {
      score += COCHANGE_WEIGHT * best * c.jaccard;
      why.push(`changed with ${c.seed} in ${c.together} commits`);
    }
    const tie = input.tieBreak?.(path) ?? 0;
    if (tie > 0) score += TIE_WEIGHT * Math.min(1, tie);
    const fb = input.feedback?.(path) ?? 0;
    if (fb > 0) {
      const add = FEEDBACK_WEIGHT * Math.min(1, fb) * Math.max(best, 0.01);
      score += add;
      why.push("edited for similar tasks before");
    }
    if (input.unresolvedFrom?.has(path)) {
      why.push("unresolved import");
    }
    if (input.indexStale) {
      why.push("stale index");
    }
    if (input.partialIndex) {
      why.push("partial index");
    }
    if (score < MIN_SCORE * Math.max(best, 0.01) && !input.strong.has(path))
      continue;
    const provenance: RankedFile["provenance"] =
      d !== undefined || c ? "measured" : "heuristic";
    // Prefer honesty signals in the top-2 why phrases (P9).
    const priority = (w: string): number => {
      if (/stale index|partial index/i.test(w)) return 0;
      if (/unresolved/i.test(w)) return 1;
      if (/dynamic/i.test(w)) return 2;
      return 10;
    };
    const shortWhy = [...why]
      .sort((a, b) => priority(a) - priority(b))
      .slice(0, 2);
    ranked.push({
      path,
      score,
      why: shortWhy,
      provenance,
      confidence: rankConfidence(
        provenance,
        shortWhy,
        input.strong.has(path) ||
          (l !== undefined && best > 0 && l.score >= best * SURE_RATIO),
      ),
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return { ranked, seeds };
}
