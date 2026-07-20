/**
 * Best-effort relative import resolution against an indexed path set.
 * Collapses `..`, remaps `.js`→`.ts`/`.tsx`, does not use Node/TS module resolution.
 */

export function isRelativeSpecifier(source: string): boolean {
  return source.startsWith("./") || source.startsWith("../");
}

export function isBarePackageSpecifier(source: string): boolean {
  if (isRelativeSpecifier(source)) return false;
  if (source.startsWith("/") || source.startsWith("file:")) return false;
  if (source.startsWith("node:")) return false;
  return true;
}

/** Package name for bare specifier (`@scope/pkg/sub` → `@scope/pkg`). */
export function barePackageName(source: string): string {
  if (source.startsWith("@")) {
    const parts = source.split("/");
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : source;
  }
  return source.split("/")[0] ?? source;
}

function dirnamePosix(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  return path.slice(0, i);
}

/** Join + collapse `.` / `..`; return null if escapes repo root. */
export function resolveRelativePath(
  fromFile: string,
  specifier: string,
): string | null {
  if (!isRelativeSpecifier(specifier)) return null;
  const base = dirnamePosix(fromFile);
  const joined = base ? `${base}/${specifier}` : specifier;
  const parts: string[] = [];
  for (const seg of joined.replace(/\\/g, "/").split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join("/");
}

const EXTENSION_TRIES = [
  "",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  "/index.ts",
  "/index.tsx",
  "/index.js",
] as const;

function stripJsExtension(path: string): string {
  return path.replace(/\.(js|jsx|mjs|cjs)$/i, "");
}

/**
 * Resolve a relative specifier to an indexed file path, or null if unresolved.
 */
export function resolveImportTarget(
  fromFile: string,
  specifier: string,
  indexedPaths: ReadonlySet<string>,
): string | null {
  const resolved = resolveRelativePath(fromFile, specifier);
  if (resolved === null) return null;

  const candidates = new Set<string>();
  candidates.add(resolved);
  candidates.add(stripJsExtension(resolved));

  for (const base of candidates) {
    for (const ext of EXTENSION_TRIES) {
      const tryPath = `${base}${ext}`.replace(/\/{2,}/g, "/");
      if (indexedPaths.has(tryPath)) return tryPath;
    }
    // .js → .ts / .tsx directly
    if (
      /\.(js|jsx|mjs|cjs)$/i.test(base) === false &&
      /\.(js|jsx)$/i.test(resolved)
    ) {
      const stem = stripJsExtension(resolved);
      for (const ext of [".ts", ".tsx", ".mts", ".cts"]) {
        if (indexedPaths.has(stem + ext)) return stem + ext;
      }
    }
  }

  // Explicit: foo.js → foo.ts when only .ts is indexed
  if (/\.(js|jsx|mjs|cjs)$/i.test(resolved)) {
    const stem = stripJsExtension(resolved);
    for (const ext of [".ts", ".tsx", ".mts", ".cts", ".d.ts"]) {
      if (indexedPaths.has(stem + ext)) return stem + ext;
    }
  }

  return null;
}
