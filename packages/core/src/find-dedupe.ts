/**
 * `graph find` dedupe (plan §4.5): one row per declaration, with its line.
 * Overload signatures of one name in one file collapse to the first. A
 * re-export row is folded into the declaration it forwards (followed through
 * re-export edges of the dependency graph) and listed in `reexportedBy`; it
 * stays a row of its own only when no declaration it forwards is found.
 */
export type FindHit = {
  readonly name: string;
  readonly kind: string;
  readonly path: string;
  readonly start: number;
};

export type DeclarationRow = FindHit & {
  readonly reexportedBy: readonly string[];
};

const EXPORT_KIND = "export";

export function dedupeDeclarations(
  hits: readonly FindHit[],
  reexportTargets: (path: string) => readonly string[],
): DeclarationRow[] {
  const decls = new Map<string, { hit: FindHit; by: Set<string> }>();
  for (const hit of hits) {
    if (hit.kind === EXPORT_KIND) continue;
    const key = `${hit.path}\0${hit.name}\0${hit.kind}`;
    const prior = decls.get(key);
    if (!prior || hit.start < prior.hit.start)
      decls.set(key, { hit, by: prior?.by ?? new Set() });
  }
  const byPath = new Map<string, { hit: FindHit; by: Set<string> }[]>();
  for (const d of decls.values()) {
    const list = byPath.get(d.hit.path) ?? [];
    list.push(d);
    byPath.set(d.hit.path, list);
  }
  const orphanExports: FindHit[] = [];
  for (const hit of hits) {
    if (hit.kind !== EXPORT_KIND) continue;
    // Breadth-first through re-export edges to the defining file(s).
    const seen = new Set<string>([hit.path]);
    let frontier = [hit.path];
    let found = false;
    while (frontier.length > 0 && !found) {
      const next: string[] = [];
      for (const p of frontier) {
        for (const t of reexportTargets(p)) {
          if (seen.has(t)) continue;
          seen.add(t);
          const targets = byPath.get(t)?.filter((d) => d.hit.name === hit.name);
          if (targets && targets.length > 0) {
            for (const d of targets) d.by.add(hit.path);
            found = true;
          } else next.push(t);
        }
      }
      frontier = next;
    }
    if (!found) orphanExports.push(hit);
  }
  const rows: DeclarationRow[] = [
    ...[...decls.values()].map(({ hit, by }) => ({
      ...hit,
      reexportedBy: [...by].sort(),
    })),
    ...orphanExports.map((hit) => ({ ...hit, reexportedBy: [] })),
  ];
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.start - b.start);
}

/** 1-based line of a UTF-16 offset in `text`. */
export function lineAt(text: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, text.length);
  for (let i = 0; i < end; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}
