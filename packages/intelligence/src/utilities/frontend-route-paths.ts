/**
 * Pure (Node-free) frontend route path helpers for browser / webview use.
 * Workspace discovery that needs `fs` lives in `frontend-routes.ts`.
 */

/** Normalize a path to `/foo` form (no trailing slash except `/`). */
export function normalizeFrontendRoute(path: string): string {
  let p = path.trim();
  if (!p) return "/";
  if (!p.startsWith("/")) p = `/${p}`;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p || "/";
}

/**
 * Pull route paths from React Router JSX / SEO catalogs / path literals.
 * Relative `path="login"` entries become `/login` (pathless layout parents).
 */
export function extractFrontendRoutesFromSource(source: string): string[] {
  const routes = new Set<string>();

  for (const m of source.matchAll(/\bpath\s*:\s*['"](\/[^'"]*)['"]/g)) {
    const raw = m[1];
    if (!raw || raw.includes("*")) continue;
    routes.add(normalizeFrontendRoute(raw));
  }

  for (const m of source.matchAll(
    /<Route\b[^>]*\bpath\s*=\s*\{?\s*['"]([^'"]+)['"]\s*\}?/g,
  )) {
    const raw = m[1]?.trim();
    if (!raw || raw === "*" || raw.includes("*")) continue;
    routes.add(normalizeFrontendRoute(raw));
  }

  if (/<Route\b[^>]*\bindex\b/.test(source)) {
    routes.add("/");
  }

  return [...routes];
}

/** Strip Next route-group `(…)`, intercepting `(.)…`, and parallel `@…` segments. */
function stripNextSpecialSegments(seg: string): string {
  return seg
    .replace(/\/@[A-Za-z0-9_-]+/g, "")
    .replace(/\/\(\.{1,4}\)[^/]+/g, "")
    .replace(/\/\([^)]+\)/g, "");
}

/**
 * Next.js dynamic segments (`[slug]`, `[...slug]`, `[[...slug]]`) are folder
 * names, not measurable URLs — a lab request for the literal segment measures
 * nothing real. React Router `:param` segments are filtered the same way.
 */
export function hasDynamicRouteSegment(route: string): boolean {
  return route
    .split("/")
    .some((seg) => /^\[.+\]$/.test(seg) || seg.startsWith(":"));
}

/** Next.js / pages file path → URL route. */
export function routeFromPageFilePath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, "/");
  const app = /(?:^|\/)app(?:(\/.*?))?\/page\.(tsx?|jsx?)$/i.exec(norm);
  if (app) {
    const seg = stripNextSpecialSegments(app[1] ?? "");
    const route = normalizeFrontendRoute(seg === "" ? "/" : seg);
    return hasDynamicRouteSegment(route) ? null : route;
  }
  const pages = /(?:^|\/)pages(\/.*?)\.(tsx?|jsx?)$/i.exec(norm);
  if (pages) {
    let seg = pages[1]!.replace(/\/index$/i, "");
    if (seg.startsWith("/_")) return null;
    if (seg === "") seg = "/";
    const route = normalizeFrontendRoute(seg);
    return hasDynamicRouteSegment(route) ? null : route;
  }
  return null;
}

/**
 * Heuristic Next.js / pages routes from DNA signals or path markers.
 * Sync / pure — no workspace snapshot. Prefer `discoverFrontendAppRoutes` in Core.
 */
export function heuristicFrontendRoutes(
  dnaSignals: readonly string[] | undefined,
  fileHints: readonly string[] | undefined,
): string[] {
  const routes = new Set<string>();
  for (const s of dnaSignals ?? []) {
    if (/^frontend-/i.test(s)) {
      /* framework signal only */
    }
  }
  for (const path of fileHints ?? []) {
    const route = routeFromPageFilePath(path);
    if (route) routes.add(route);
  }
  if (routes.size === 0) routes.add("/");
  return [...routes].sort((a, b) => a.localeCompare(b));
}
