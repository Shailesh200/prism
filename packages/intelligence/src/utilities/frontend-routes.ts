/**
 * Discover frontend URL routes for lab “Routes & components”.
 * Covers Next app/pages files + React Router / SEO path literals in source.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { resolveLabAppRoot } from "./lab-server.js";

const MAX_ROUTES = 100;
const MAX_FILES = 80;
const MAX_FILE_BYTES = 400_000;

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

/** Next.js / pages file path → URL route. */
export function routeFromPageFilePath(filePath: string): string | null {
  const norm = filePath.replace(/\\/g, "/");
  const app = /(?:^|\/)app(?:(\/.*?))?\/page\.(tsx?|jsx?)$/i.exec(norm);
  if (app) {
    const seg = (app[1] ?? "").replace(/\/\([^)]+\)/g, "");
    return normalizeFrontendRoute(seg === "" ? "/" : seg);
  }
  const pages = /(?:^|\/)pages(\/.*?)\.(tsx?|jsx?)$/i.exec(norm);
  if (pages) {
    let seg = pages[1]!.replace(/\/index$/i, "");
    if (seg.startsWith("/_")) return null;
    if (seg === "") seg = "/";
    return normalizeFrontendRoute(seg);
  }
  return null;
}

function shouldScanFile(name: string): boolean {
  const n = name.toLowerCase();
  if (!/\.(tsx?|jsx?)$/.test(n)) return false;
  return (
    n === "app.tsx" ||
    n === "app.jsx" ||
    n === "routes.tsx" ||
    n === "routes.ts" ||
    n === "router.tsx" ||
    n === "router.ts" ||
    n === "seo.ts" ||
    n === "seo.tsx" ||
    n.endsWith("router.tsx") ||
    n.endsWith("routes.tsx") ||
    n === "page.tsx" ||
    n === "page.jsx" ||
    n === "page.ts" ||
    n === "page.js"
  );
}

function walkFiles(dir: string, out: string[], depth: number): void {
  if (out.length >= MAX_FILES || depth > 8) return;
  if (!existsSync(dir)) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (out.length >= MAX_FILES) return;
    if (
      name === "node_modules" ||
      name === "dist" ||
      name === "build" ||
      name === ".git" ||
      name === ".prism" ||
      name === "coverage"
    ) {
      continue;
    }
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, out, depth + 1);
      continue;
    }
    if (!st.isFile() || st.size > MAX_FILE_BYTES) continue;
    const rel = full.replace(/\\/g, "/");
    if (
      shouldScanFile(name) ||
      /\/(app|pages)\/.*page\.(tsx?|jsx?)$/i.test(rel)
    ) {
      out.push(full);
    }
  }
}

function candidateRoots(workspaceRoot: string): string[] {
  const roots = new Set<string>([
    workspaceRoot,
    resolveLabAppRoot(workspaceRoot),
  ]);
  for (const apps of ["apps", "packages"]) {
    const base = join(workspaceRoot, apps);
    if (!existsSync(base)) continue;
    try {
      for (const name of readdirSync(base)) {
        const pkg = join(base, name);
        try {
          if (statSync(pkg).isDirectory()) roots.add(pkg);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip */
    }
  }
  return [...roots];
}

/**
 * Scan the workspace for frontend URL routes (Next pages + Router/SEO sources).
 * Always includes `/`. Caps result size for UI.
 */
export function discoverFrontendAppRoutes(workspaceRoot: string): string[] {
  const routes = new Set<string>(["/"]);
  const files: string[] = [];
  for (const root of candidateRoots(workspaceRoot)) {
    walkFiles(root, files, 0);
  }

  for (const file of files) {
    const fromPath = routeFromPageFilePath(
      relative(workspaceRoot, file).replace(/\\/g, "/"),
    );
    if (fromPath) routes.add(fromPath);

    try {
      const text = readFileSync(file, "utf8");
      for (const r of extractFrontendRoutesFromSource(text)) {
        routes.add(r);
      }
    } catch {
      /* skip unreadable */
    }
  }

  return [...routes]
    .filter((r) => r.length > 0 && !r.includes("*") && isLikelyUrlRoute(r))
    .sort((a, b) => {
      if (a === "/") return -1;
      if (b === "/") return 1;
      return a.localeCompare(b);
    })
    .slice(0, MAX_ROUTES);
}

/** Drop PascalCase leaks (e.g. `/HomePage`) from loose source scans. */
function isLikelyUrlRoute(route: string): boolean {
  if (route === "/") return true;
  const body = route.startsWith("/") ? route.slice(1) : route;
  if (!body) return false;
  // Single PascalCase segment → likely a component identifier, not a URL.
  if (/^[A-Z][A-Za-z0-9]+$/.test(body)) return false;
  return true;
}
