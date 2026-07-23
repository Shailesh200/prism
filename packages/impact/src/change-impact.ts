import {
  ok,
  type BreakingChangeHint,
  type PrismError,
  type RenameImpactReport,
  type Result,
  type SafeDeleteReport,
  type TestImpactReport,
} from "@prism/shared";
import {
  affectedItems,
  buildReverseAdjacency,
  computeAffected,
  isRepoCriticalPath,
  isTestPath,
  referencesToSymbol,
  resolveOrigin,
  WIDELY_USED_THRESHOLD,
  type BlastRadiusOrigin,
  type ImpactContext,
  type ResolvedSymbol,
} from "./internal.js";

/** Rename target — a change origin plus the proposed new name. */
export type RenameTarget = BlastRadiusOrigin & { readonly newName?: string };

/**
 * Files that become unreachable once `originPath` is removed. Fixpoint: a file
 * whose every importer is already in the removed set becomes an orphan too.
 * Files with no importers are roots/entrypoints and are never orphaned.
 */
function computeOrphans(originPath: string, context: ImpactContext): string[] {
  const reverse = buildReverseAdjacency(context.dependencyGraph);
  const removed = new Set<string>([originPath]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const file of context.analyzedPaths) {
      if (removed.has(file)) continue;
      const importers = reverse.get(file) ?? [];
      if (importers.length === 0) continue;
      if (importers.every((e) => removed.has(e.fromPath))) {
        removed.add(file);
        changed = true;
      }
    }
  }
  removed.delete(originPath);
  return [...removed].sort((a, b) => a.localeCompare(b));
}

function foundationalConfigHint(originPath: string): BreakingChangeHint | null {
  if (!isRepoCriticalPath(originPath)) return null;
  return {
    kind: "foundational-config",
    severity: "danger",
    message: `${originPath} is a foundational config/build file; changes can break the repository even without direct import edges.`,
  };
}

function breakingHintsFor(
  originKind: "file" | "symbol",
  originPath: string,
  symbol: ResolvedSymbol | null,
  context: ImpactContext,
): BreakingChangeHint[] {
  const hints: BreakingChangeHint[] = [];

  const configHint = foundationalConfigHint(originPath);
  if (configHint) hints.push(configHint);

  if (originKind === "symbol" && symbol) {
    if (symbol.exported) {
      hints.push({
        kind: "exported-symbol",
        severity: "warning",
        message: `"${symbol.name}" is exported; changing or removing it may break importers.`,
      });
    }
    const refs = referencesToSymbol(context, symbol);
    const subtyped = refs.some(
      (r) => r.kind === "extends" || r.kind === "implements",
    );
    if (subtyped) {
      hints.push({
        kind: "subclassed",
        severity: "danger",
        message: `"${symbol.name}" is extended or implemented elsewhere; changes may break subtypes.`,
      });
    }
    if (refs.length >= WIDELY_USED_THRESHOLD) {
      const files = new Set(refs.map((r) => r.path)).size;
      hints.push({
        kind: "widely-used",
        severity: "warning",
        message: `"${symbol.name}" is referenced ${refs.length} times across ${files} files.`,
      });
    }
    return hints;
  }

  const reverse = buildReverseAdjacency(context.dependencyGraph);
  const importers = new Set(
    (reverse.get(originPath) ?? []).map((e) => e.fromPath),
  ).size;
  if (importers >= WIDELY_USED_THRESHOLD) {
    hints.push({
      kind: "widely-used",
      severity: "warning",
      message: `${originPath} is imported by ${importers} files; renaming or moving it requires updating those imports.`,
    });
  }
  return hints;
}

/**
 * Whether the target can be deleted safely. `blockers` are the files that
 * (transitively) depend on it; `orphans` are files that would be left dead.
 */
export function computeSafeDelete(
  origin: BlastRadiusOrigin,
  context: ImpactContext,
): Result<SafeDeleteReport, PrismError> {
  const result = computeAffected(origin, context);
  if (!result.ok) return result;
  const { originPath, affected } = result.value;

  const blockers = affectedItems(affected);
  const testsLikelyAffected = blockers
    .map((b) => b.path)
    .filter((p) => isTestPath(p))
    .sort((a, b) => a.localeCompare(b));
  const orphans =
    origin.kind === "file" ? computeOrphans(originPath, context) : [];

  // Repo-critical config/build files are never safe to delete, even with zero
  // import dependents: removing them can break builds/CI. Surface a synthetic
  // depth-0 blocker so the UI can explain WHY.
  const critical = origin.kind === "file" && isRepoCriticalPath(originPath);
  if (critical && !blockers.some((b) => b.path === originPath)) {
    blockers.push({
      path: originPath,
      reason:
        "repo-critical config/build file — removing it can break builds/CI",
      depth: 0,
      category: "config",
    });
    blockers.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  }

  return ok({
    origin: { kind: origin.kind, id: origin.id, path: originPath },
    safe: blockers.length === 0 && !critical,
    blockers,
    orphans,
    testsLikelyAffected,
  });
}

/** Edit sites (declaration + references) and breaking hints for a rename. */
export function computeRenameImpact(
  target: RenameTarget,
  context: ImpactContext,
): Result<RenameImpactReport, PrismError> {
  const analyzed = new Set(context.analyzedPaths);
  const resolved = resolveOrigin(target, context, analyzed);
  if (!resolved.ok) return resolved;
  const { originPath, symbol } = resolved.value;

  const counts = new Map<string, number>();
  const bump = (path: string, n: number) =>
    counts.set(path, (counts.get(path) ?? 0) + n);

  if (target.kind === "symbol" && symbol) {
    bump(originPath, 1); // the declaration itself
    for (const ref of referencesToSymbol(context, symbol)) bump(ref.path, 1);
  } else {
    const reverse = buildReverseAdjacency(context.dependencyGraph);
    for (const e of reverse.get(originPath) ?? []) bump(e.fromPath, 1);
  }

  const editSites = [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const breakingChanges = breakingHintsFor(
    target.kind,
    originPath,
    symbol,
    context,
  );
  // Renaming an exported symbol used across many files breaks every importer.
  if (target.kind === "symbol" && symbol?.exported) {
    const files = new Set(
      referencesToSymbol(context, symbol).map((r) => r.path),
    ).size;
    if (files >= WIDELY_USED_THRESHOLD) {
      breakingChanges.push({
        kind: "rename-breaking",
        severity: "warning",
        message: `Renaming an exported symbol used in ${files} files is a breaking change for importers.`,
      });
    }
  }

  return ok({
    origin: { kind: target.kind, id: target.id, path: originPath },
    ...(target.newName === undefined ? {} : { newName: target.newName }),
    editSites,
    affectedFiles: editSites.map((s) => s.path),
    breakingChanges,
  });
}

/** Test files transitively reachable from the change. */
export function computeTestImpact(
  origin: BlastRadiusOrigin,
  context: ImpactContext,
): Result<TestImpactReport, PrismError> {
  const result = computeAffected(origin, context);
  if (!result.ok) return result;
  const { originPath, affected } = result.value;
  return ok({
    origin: { kind: origin.kind, id: origin.id, path: originPath },
    tests: affectedItems(affected).filter((i) => isTestPath(i.path)),
  });
}

/** Heuristic breaking-change hints for a change target. */
export function computeBreakingChangeHints(
  origin: BlastRadiusOrigin,
  context: ImpactContext,
): Result<BreakingChangeHint[], PrismError> {
  const analyzed = new Set(context.analyzedPaths);
  const resolved = resolveOrigin(origin, context, analyzed);
  if (!resolved.ok) return resolved;
  return ok(
    breakingHintsFor(
      origin.kind,
      resolved.value.originPath,
      resolved.value.symbol,
      context,
    ),
  );
}
