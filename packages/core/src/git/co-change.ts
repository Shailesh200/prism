/**
 * Co-change (plan P7): files that change in the same commits are coupled
 * even when no import says so (a component and its stylesheet, a route and
 * its schema). Jaccard over the scanned commits: |A ∩ B| / |A ∪ B|, where A
 * and B are the commits touching each file. Commits that touch more than
 * {@link CO_CHANGE_MAX_FILES} files (formatting sweeps, renames, releases)
 * say nothing about coupling and are skipped. Pure; the IO lives in
 * `readGitSignals`.
 */

/** Commits touching more files than this are ignored. */
export const CO_CHANGE_MAX_FILES = 30;
/** A pair must change together at least this often to count. */
export const CO_CHANGE_MIN_TOGETHER = 2;

export type CoChangePartner = {
  readonly path: string;
  /** Commits that touched both files. */
  readonly together: number;
  /** together / commits touching either file, in (0, 1]. */
  readonly jaccard: number;
};

export type CoChangeIndex = {
  /** Partners of `path`, strongest first; empty when it has none. */
  partners(path: string): readonly CoChangePartner[];
};

/**
 * Builds the index from each commit's changed paths (all of them, so the
 * size cut sees the whole commit). Only paths in `keep` are indexed.
 */
export function buildCoChange(
  commits: readonly (readonly string[])[],
  keep?: ReadonlySet<string>,
): CoChangeIndex {
  const touched = new Map<string, number>();
  const pairs = new Map<string, Map<string, number>>();
  for (const all of commits) {
    if (all.length > CO_CHANGE_MAX_FILES) continue;
    const paths = [...new Set(keep ? all.filter((p) => keep.has(p)) : all)];
    for (const p of paths) touched.set(p, (touched.get(p) ?? 0) + 1);
    for (let i = 0; i < paths.length; i += 1)
      for (let j = i + 1; j < paths.length; j += 1) {
        const a = paths[i]!;
        const b = paths[j]!;
        bump(pairs, a, b);
        bump(pairs, b, a);
      }
  }
  const memo = new Map<string, readonly CoChangePartner[]>();
  return {
    partners(path) {
      const hit = memo.get(path);
      if (hit) return hit;
      const own = touched.get(path) ?? 0;
      const out: CoChangePartner[] = [];
      for (const [other, together] of pairs.get(path) ?? []) {
        if (together < CO_CHANGE_MIN_TOGETHER) continue;
        const union = own + (touched.get(other) ?? 0) - together;
        out.push({ path: other, together, jaccard: together / union });
      }
      out.sort(
        (x, y) =>
          y.jaccard - x.jaccard ||
          y.together - x.together ||
          x.path.localeCompare(y.path),
      );
      memo.set(path, out);
      return out;
    },
  };
}

function bump(
  pairs: Map<string, Map<string, number>>,
  from: string,
  to: string,
): void {
  let row = pairs.get(from);
  if (!row) {
    row = new Map();
    pairs.set(from, row);
  }
  row.set(to, (row.get(to) ?? 0) + 1);
}
