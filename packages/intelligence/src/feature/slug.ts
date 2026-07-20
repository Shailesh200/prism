/** Normalize a feature label to a stable slug id segment. */
export function featureSlug(raw: string): string {
  let s = raw.trim().toLowerCase();
  // @scope/pkg → pkg (keep scope-pkg if helpful)
  if (s.startsWith("@")) {
    const parts = s.split("/");
    s = parts.length >= 2 ? `${parts[0]!.slice(1)}-${parts[1]}` : s.slice(1);
  }
  s = s
    .replace(/\.tsx?$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s;
}

export function featureNodeId(slug: string): string {
  return `feature:${slug}`;
}

/** Path segments that are structural, not product features. */
export const NOISE_SEGMENTS = new Set([
  "src",
  "lib",
  "dist",
  "build",
  "out",
  "node_modules",
  "test",
  "tests",
  "__tests__",
  "fixtures",
  "types",
  "utils",
  "shared",
  "common",
  "internal",
  "packages",
  "apps",
  "components",
  "hooks",
  "assets",
  "public",
  "static",
  "config",
  "scripts",
  "vendor",
  "generated",
  "api",
]);
