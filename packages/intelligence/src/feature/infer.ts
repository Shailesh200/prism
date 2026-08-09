import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { labelPropagationCommunities } from "@repo-prism/graph-engine";
import type { IndexSnapshot, SignalProvenance } from "@repo-prism/shared";
import {
  discoverLocalPackages,
  resolveLocalPackageSpecifier,
} from "../dependency/packages.js";
import {
  isRelativeSpecifier,
  resolveImportTarget,
} from "../dependency/resolve.js";
import {
  loadTsconfigPathAliases,
  resolveAliasSpecifier,
} from "../dependency/aliases.js";
import { featureSlug, NOISE_SEGMENTS } from "./slug.js";

export type FeatureDraft = {
  slug: string;
  name: string;
  confidence: number;
  files: Set<string>;
  evidence: string[];
  /** ADR-0029 / M-061 — community fallback uses `"inferred"`. */
  provenance?: SignalProvenance;
};

/** Max confidence for label-propagation community features (M-061 P-E2). */
export const INFERRED_FEATURE_CONFIDENCE_CAP = 0.5;

function analyzedPaths(snapshot: IndexSnapshot): string[] {
  return snapshot.files
    .filter((f) => f.status === "analyzed")
    .map((f) => f.path);
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function pushDraft(
  drafts: FeatureDraft[],
  slug: string,
  name: string,
  confidence: number,
  files: Iterable<string>,
  evidence: string,
  provenance: SignalProvenance = "heuristic",
): void {
  if (!slug || NOISE_SEGMENTS.has(slug)) return;
  const fileSet = new Set(
    [...files].filter((p) => p.length > 0 && !p.endsWith("/package.json")),
  );
  if (fileSet.size === 0) return;
  drafts.push({
    slug,
    name: name || titleCase(slug),
    confidence,
    files: fileSet,
    evidence: [evidence],
    provenance,
  });
}

function filesUnderPrefix(paths: readonly string[], prefix: string): string[] {
  const withSlash = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return paths.filter((p) => p === prefix || p.startsWith(withSlash));
}

/** `features|modules|domains/<name>/…` */
function inferDirectoryPacks(
  paths: readonly string[],
  drafts: FeatureDraft[],
): void {
  const re = /(?:^|\/)(?:features|modules|domains)\/([^/]+)\/(.+)$/;
  const bySlug = new Map<string, Set<string>>();
  for (const p of paths) {
    const m = re.exec(p);
    if (!m) continue;
    const slug = featureSlug(m[1]!);
    if (!slug || NOISE_SEGMENTS.has(slug)) continue;
    const set = bySlug.get(slug) ?? new Set();
    set.add(p);
    bySlug.set(slug, set);
  }
  for (const [slug, files] of bySlug) {
    pushDraft(
      drafts,
      slug,
      titleCase(slug),
      0.85,
      files,
      `directory-pack:${slug}`,
    );
  }
}

/** `routes|pages/<name>/…` */
function inferRouteFolders(
  paths: readonly string[],
  drafts: FeatureDraft[],
): void {
  const re = /(?:^|\/)(?:routes|pages)\/([^/]+)\/(.+)$/;
  const bySlug = new Map<string, Set<string>>();
  for (const p of paths) {
    const m = re.exec(p);
    if (!m) continue;
    const seg = m[1]!;
    if (seg.startsWith("(") || seg.startsWith("_") || seg.startsWith("@")) {
      continue;
    }
    const slug = featureSlug(seg);
    if (!slug || NOISE_SEGMENTS.has(slug)) continue;
    const set = bySlug.get(slug) ?? new Set();
    set.add(p);
    bySlug.set(slug, set);
  }
  for (const [slug, files] of bySlug) {
    pushDraft(
      drafts,
      slug,
      titleCase(slug),
      0.75,
      files,
      `route-folder:${slug}`,
    );
  }
}

/** Non-root workspace packages. */
function inferPackages(
  snapshot: IndexSnapshot,
  paths: readonly string[],
  drafts: FeatureDraft[],
): void {
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
  );
  for (const pkg of packages) {
    if (pkg.rootDir === "") continue;
    const folder = pkg.rootDir.includes("/")
      ? pkg.rootDir.slice(pkg.rootDir.lastIndexOf("/") + 1)
      : pkg.rootDir;
    const slug = featureSlug(folder) || featureSlug(pkg.name);
    const files = filesUnderPrefix(paths, pkg.rootDir).filter(
      (p) => !p.endsWith("package.json"),
    );
    pushDraft(drafts, slug, pkg.name, 0.8, files, `package:${pkg.name}`);
  }
}

/** Immediate `src/<name>/` with ≥2 analyzed files. */
function inferSrcBoundaries(
  paths: readonly string[],
  drafts: FeatureDraft[],
): void {
  const bySlug = new Map<string, Set<string>>();
  for (const p of paths) {
    const m = /(?:^|\/)src\/([^/]+)\/(.+)$/.exec(p);
    if (!m) continue;
    const seg = m[1]!;
    if (
      NOISE_SEGMENTS.has(seg) ||
      seg === "features" ||
      seg === "modules" ||
      seg === "domains" ||
      seg === "routes" ||
      seg === "pages"
    ) {
      continue;
    }
    const slug = featureSlug(seg);
    if (!slug) continue;
    const set = bySlug.get(slug) ?? new Set();
    set.add(p);
    bySlug.set(slug, set);
  }
  for (const [slug, files] of bySlug) {
    if (files.size < 2) continue;
    pushDraft(
      drafts,
      slug,
      titleCase(slug),
      0.55,
      files,
      `src-boundary:${slug}`,
    );
  }
}

function parseReadmeFeatureNames(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const names: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const heading = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      const title = heading[2]!.toLowerCase();
      inSection =
        title === "features" ||
        title === "capabilities" ||
        title.startsWith("features ") ||
        title.startsWith("capabilities ");
      continue;
    }
    if (!inSection) continue;
    if (/^#{1,6}\s+/.test(line)) {
      inSection = false;
      continue;
    }
    const bullet =
      /^[-*+]\s+(?:\*\*|`)?([A-Za-z][\w\s/-]*?)(?:\*\*|`)?(?:\s*[—–:].*)?$/.exec(
        line.trim(),
      );
    if (!bullet) continue;
    const name = bullet[1]!.trim();
    if (name.length > 0 && name.length < 60) names.push(name);
  }
  return names;
}

function inferReadmeHints(
  snapshot: IndexSnapshot,
  paths: readonly string[],
  drafts: FeatureDraft[],
): void {
  const readmePath = join(snapshot.rootPath, "README.md");
  if (!existsSync(readmePath)) return;
  let md: string;
  try {
    md = readFileSync(readmePath, "utf8");
  } catch {
    return;
  }
  for (const name of parseReadmeFeatureNames(md)) {
    const slug = featureSlug(name);
    if (!slug || NOISE_SEGMENTS.has(slug)) continue;
    // Attach files from matching directories when present
    const prefixes = [
      `src/features/${slug}`,
      `src/modules/${slug}`,
      `src/domains/${slug}`,
      `src/routes/${slug}`,
      `src/pages/${slug}`,
      `packages/${slug}`,
      `features/${slug}`,
      `modules/${slug}`,
    ];
    const files = new Set<string>();
    for (const prefix of prefixes) {
      for (const f of filesUnderPrefix(paths, prefix)) files.add(f);
    }
    // README-only feature still needs ≥1 file: try any path containing /slug/
    if (files.size === 0) {
      for (const p of paths) {
        if (
          p.includes(`/${slug}/`) ||
          p.endsWith(`/${slug}.ts`) ||
          p.endsWith(`/${slug}.tsx`)
        ) {
          files.add(p);
        }
      }
    }
    if (files.size === 0) continue;
    pushDraft(drafts, slug, name, 0.6, files, `readme:${name}`);
  }
}

/**
 * Build undirected import edges (relative + alias + workspace) for community
 * detection when path conventions yield nothing.
 */
function importGraphEdges(snapshot: IndexSnapshot): {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
} {
  const paths = analyzedPaths(snapshot);
  const indexedPaths = new Set(paths);
  const packages = discoverLocalPackages(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
  );
  const aliases = loadTsconfigPathAliases(
    snapshot.rootPath,
    snapshot.files.map((f) => f.path),
  );

  const edgeKeys = new Set<string>();
  const edges: Array<{ from: string; to: string }> = [];
  const push = (from: string, to: string) => {
    if (from === to) return;
    const key = from < to ? `${from}\0${to}` : `${to}\0${from}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const file of snapshot.files) {
    if (file.status !== "analyzed") continue;
    for (const imp of file.imports) {
      let target: string | null = null;
      if (isRelativeSpecifier(imp.source)) {
        target = resolveImportTarget(file.path, imp.source, indexedPaths);
      } else {
        target =
          resolveAliasSpecifier(file.path, imp.source, indexedPaths, aliases) ??
          resolveLocalPackageSpecifier(imp.source, packages, indexedPaths);
      }
      if (target && indexedPaths.has(target)) {
        push(file.path, target);
      }
    }
  }

  return { nodes: paths, edges };
}

function communityLabelSlug(memberPaths: readonly string[]): string {
  // Prefer a meaningful directory segment shared by members.
  const segCounts = new Map<string, number>();
  for (const p of memberPaths) {
    const parts = p.split("/").filter(Boolean);
    for (const seg of parts.slice(0, -1)) {
      if (NOISE_SEGMENTS.has(seg)) continue;
      if (
        ["src", "lib", "app", "apps", "packages", "pkg", "internal"].includes(
          seg,
        )
      ) {
        continue;
      }
      const slug = featureSlug(seg);
      if (!slug) continue;
      segCounts.set(slug, (segCounts.get(slug) ?? 0) + 1);
    }
  }
  const ranked = [...segCounts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
  if (ranked.length > 0 && ranked[0]![1] >= 2) return ranked[0]![0];

  const first = memberPaths[0] ?? "community";
  const base = first.includes("/")
    ? first.slice(first.lastIndexOf("/") + 1)
    : first;
  const stem = base.replace(/\.[^.]+$/, "");
  return featureSlug(stem) || `community-${featureSlug(first) || "cluster"}`;
}

/**
 * Label-propagation fallback when directory / package heuristics find nothing
 * (M-061 P-E2). Confidence capped at 0.5 with provenance `"inferred"`.
 */
function inferCommunities(
  snapshot: IndexSnapshot,
  drafts: FeatureDraft[],
): void {
  const { nodes, edges } = importGraphEdges(snapshot);
  if (nodes.length < 2 || edges.length === 0) return;

  const partition = labelPropagationCommunities(nodes, edges, {
    minCommunitySize: 2,
  });

  let communityIndex = 0;
  const usedSlugs = new Set<string>();
  for (const members of partition.communities.values()) {
    const codeMembers = members.filter(
      (p) => !p.endsWith("/package.json") && !p.endsWith("package.json"),
    );
    if (codeMembers.length < 2) continue;

    let slug = communityLabelSlug(codeMembers);
    if (!slug || NOISE_SEGMENTS.has(slug) || usedSlugs.has(slug)) {
      communityIndex += 1;
      slug = `community-${communityIndex}`;
    }
    usedSlugs.add(slug);

    pushDraft(
      drafts,
      slug,
      titleCase(slug),
      INFERRED_FEATURE_CONFIDENCE_CAP,
      codeMembers,
      `community:${slug}`,
      "inferred",
    );
  }
}

/** Merge drafts with the same slug. */
export function mergeFeatureDrafts(
  drafts: readonly FeatureDraft[],
): FeatureDraft[] {
  const bySlug = new Map<string, FeatureDraft>();
  for (const d of drafts) {
    const existing = bySlug.get(d.slug);
    if (!existing) {
      bySlug.set(d.slug, {
        slug: d.slug,
        name: d.name,
        confidence: d.confidence,
        files: new Set(d.files),
        evidence: [...d.evidence],
        ...(d.provenance !== undefined ? { provenance: d.provenance } : {}),
      });
      continue;
    }
    for (const f of d.files) existing.files.add(f);
    existing.confidence = Math.max(existing.confidence, d.confidence);
    for (const e of d.evidence) {
      if (!existing.evidence.includes(e)) existing.evidence.push(e);
    }
    // Prefer package-scoped display names when present
    if (d.name.includes("/") || d.name.startsWith("@")) {
      existing.name = d.name;
    }
    // Stronger provenance wins; never upgrade inferred over heuristic.
    if (
      d.provenance === "heuristic" ||
      (d.provenance === "measured" && existing.provenance !== "measured")
    ) {
      existing.provenance = d.provenance;
    } else if (!existing.provenance && d.provenance) {
      existing.provenance = d.provenance;
    }
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Run path-convention heuristics; when they yield zero features, fall back to
 * label-propagation communities over the import graph (M-061 P-E2).
 */
export function inferFeatures(snapshot: IndexSnapshot): FeatureDraft[] {
  const paths = analyzedPaths(snapshot);
  const drafts: FeatureDraft[] = [];
  inferDirectoryPacks(paths, drafts);
  inferRouteFolders(paths, drafts);
  inferPackages(snapshot, paths, drafts);
  inferSrcBoundaries(paths, drafts);
  inferReadmeHints(snapshot, paths, drafts);
  const merged = mergeFeatureDrafts(drafts);
  if (merged.length > 0) return merged;

  const communityDrafts: FeatureDraft[] = [];
  inferCommunities(snapshot, communityDrafts);
  return mergeFeatureDrafts(communityDrafts);
}

export { parseReadmeFeatureNames };
