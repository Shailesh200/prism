/**
 * Detect frontend bundle-analyze scripts and bundler stacks (M-050).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  BundleAnalyzeCapability,
  BundleAnalyzePackageInfo,
  BundleAnalyzeScriptInfo,
  BundleBundler,
} from "@prism/shared";
import { discoverPackageRoots } from "../stack/package-roots.js";

const ANALYZE_SCRIPT_NAMES = [
  "analyze",
  "bundle:analyze",
  "analyze:bundle",
  "bundle-analyze",
  "webpack-bundle-analyzer",
] as const;

const ANALYZER_DEPS = [
  "@next/bundle-analyzer",
  "webpack-bundle-analyzer",
  "rollup-plugin-visualizer",
  "vite-bundle-visualizer",
  "vite-plugin-bundle-analyzer",
  "source-map-explorer",
] as const;

type PkgJson = {
  readonly name?: string;
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly scripts?: Record<string, string>;
};

function readPkg(absDir: string): PkgJson | null {
  try {
    return JSON.parse(
      readFileSync(join(absDir, "package.json"), "utf8"),
    ) as PkgJson;
  } catch {
    return null;
  }
}

function hasDep(pkg: PkgJson | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] || pkg.devDependencies?.[name]);
}

function detectBundler(absDir: string, pkg: PkgJson | null): BundleBundler {
  if (
    hasDep(pkg, "next") ||
    existsSync(join(absDir, "next.config.js")) ||
    existsSync(join(absDir, "next.config.mjs")) ||
    existsSync(join(absDir, "next.config.cjs")) ||
    existsSync(join(absDir, "next.config.ts"))
  ) {
    return "next";
  }
  if (
    hasDep(pkg, "vite") ||
    existsSync(join(absDir, "vite.config.ts")) ||
    existsSync(join(absDir, "vite.config.js")) ||
    existsSync(join(absDir, "vite.config.mjs")) ||
    existsSync(join(absDir, "vite.config.cjs"))
  ) {
    return "vite";
  }
  if (
    hasDep(pkg, "webpack") ||
    hasDep(pkg, "webpack-cli") ||
    existsSync(join(absDir, "webpack.config.js")) ||
    existsSync(join(absDir, "webpack.config.ts")) ||
    existsSync(join(absDir, "webpack.config.mjs")) ||
    existsSync(join(absDir, "webpack.config.cjs"))
  ) {
    return "webpack";
  }
  if (hasDep(pkg, "esbuild") || hasDep(pkg, "esbuild-loader")) {
    return "esbuild";
  }
  if (hasDep(pkg, "rollup") || existsSync(join(absDir, "rollup.config.js"))) {
    return "rollup";
  }
  return "unknown";
}

function listAnalyzers(pkg: PkgJson | null): string[] {
  if (!pkg) return [];
  return ANALYZER_DEPS.filter((d) => hasDep(pkg, d));
}

function findAnalyzeScripts(
  packageId: string | undefined,
  packagePath: string,
  packageName: string | undefined,
  pkg: PkgJson | null,
): BundleAnalyzeScriptInfo[] {
  if (!pkg?.scripts) return [];
  const out: BundleAnalyzeScriptInfo[] = [];
  for (const name of ANALYZE_SCRIPT_NAMES) {
    const command = pkg.scripts[name];
    if (typeof command === "string" && command.trim().length > 0) {
      out.push({
        ...(packageId === undefined ? {} : { packageId }),
        packagePath,
        ...(packageName === undefined ? {} : { packageName }),
        scriptName: name,
        command: command.trim(),
      });
    }
  }
  // Also catch scripts whose body mentions known analyzers.
  for (const [scriptName, command] of Object.entries(pkg.scripts)) {
    if (
      ANALYZE_SCRIPT_NAMES.includes(
        scriptName as (typeof ANALYZE_SCRIPT_NAMES)[number],
      )
    ) {
      continue;
    }
    if (typeof command !== "string") continue;
    const lower = command.toLowerCase();
    if (
      lower.includes("bundle-analyzer") ||
      lower.includes("rollup-plugin-visualizer") ||
      lower.includes("vite-bundle-visualizer") ||
      lower.includes("source-map-explorer")
    ) {
      out.push({
        ...(packageId === undefined ? {} : { packageId }),
        packagePath,
        ...(packageName === undefined ? {} : { packageName }),
        scriptName,
        command: command.trim(),
      });
    }
  }
  return out;
}

function isJsPackageRoot(absDir: string): boolean {
  return existsSync(join(absDir, "package.json"));
}

/**
 * Scan workspace (and package roots) for analyze scripts / bundlers.
 * Pure FS — no network, no builds.
 */
export function detectBundleAnalyzeCapability(
  workspaceRoot: string,
  options?: { readonly packageId?: string },
): BundleAnalyzeCapability {
  const roots = discoverPackageRoots(workspaceRoot);
  const packages: BundleAnalyzePackageInfo[] = [];
  const scripts: BundleAnalyzeScriptInfo[] = [];
  const bundlerSet = new Set<BundleBundler>();

  for (const root of roots) {
    if (options?.packageId && root.id !== options.packageId) continue;
    const absDir = join(workspaceRoot, root.rootDir);
    if (!isJsPackageRoot(absDir)) continue;
    const pkg = readPkg(absDir);
    const bundler = detectBundler(absDir, pkg);
    const analyzers = listAnalyzers(pkg);
    const pkgScripts = findAnalyzeScripts(
      root.id,
      root.rootDir === "" ? "." : root.rootDir,
      pkg?.name ?? root.name,
      pkg,
    );
    const hasAnalyzeScript = pkgScripts.length > 0;
    const packageName = pkg?.name ?? root.name ?? root.id;
    packages.push({
      packageId: root.id,
      packagePath: root.rootDir === "" ? "." : root.rootDir,
      packageName,
      hasAnalyzeScript,
      bundler,
      analyzers,
    });
    if (bundler !== "unknown") bundlerSet.add(bundler);
    scripts.push(...pkgScripts);
  }

  // Ensure workspace root is considered even when discoverPackageRoots is empty-ish.
  if (packages.length === 0 && isJsPackageRoot(workspaceRoot)) {
    const pkg = readPkg(workspaceRoot);
    const bundler = detectBundler(workspaceRoot, pkg);
    const analyzers = listAnalyzers(pkg);
    const pkgScripts = findAnalyzeScripts("pkg:.", ".", pkg?.name, pkg);
    packages.push({
      packageId: "pkg:.",
      packagePath: ".",
      packageName: pkg?.name ?? "workspace",
      hasAnalyzeScript: pkgScripts.length > 0,
      bundler,
      analyzers,
    });
    if (bundler !== "unknown") bundlerSet.add(bundler);
    scripts.push(...pkgScripts);
  }

  const managedBundlers = new Set<BundleBundler>(["next", "vite", "webpack"]);
  const canManaged = packages.some((p) => managedBundlers.has(p.bundler));
  const hasScript = scripts.length > 0;

  let preferredStrategy: BundleAnalyzeCapability["preferredStrategy"] = "none";
  if (hasScript) preferredStrategy = "project-script";
  else if (canManaged) preferredStrategy = "prism-managed";

  const supported = preferredStrategy !== "none";
  let reason: string | undefined;
  if (!supported) {
    reason =
      "No analyze npm script and no detectable Next / Vite / Webpack package. Bundle Weight needs real build stats — Prism will not invent sizes from the import graph.";
  }

  return {
    supported,
    ...(reason === undefined ? {} : { reason }),
    preferredStrategy,
    scripts,
    bundlers: [...bundlerSet],
    packages,
  };
}

/** Walk for recently modified analyzer JSON under a package (assist after run). */
export function discoverFreshBundleStatsFiles(
  absPackageDir: string,
  options?: { readonly maxAgeMs?: number; readonly now?: number },
): string[] {
  const maxAgeMs = options?.maxAgeMs ?? 15 * 60 * 1000;
  const now = options?.now ?? Date.now();
  const candidates: { path: string; mtime: number }[] = [];

  const visit = (dir: string, depth: number): void => {
    if (depth > 5) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (
        name === "node_modules" ||
        name === ".git" ||
        name === ".prism" ||
        name === "coverage"
      ) {
        continue;
      }
      const abs = join(dir, name);
      if (entry.isDirectory()) {
        if (
          name === "stats" ||
          name === "analyze" ||
          name === "bundle" ||
          name === ".next" ||
          name === "dist" ||
          name === "build" ||
          name === "out"
        ) {
          visit(abs, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = name.toLowerCase();
      if (!lower.endsWith(".json")) continue;
      if (
        !(
          lower.includes("stats") ||
          lower.includes("metafile") ||
          lower.includes("visualize") ||
          lower.includes("bundle") ||
          lower === "stats.json" ||
          lower.endsWith(".meta.json")
        )
      ) {
        continue;
      }
      try {
        const st = statSync(abs);
        if (now - st.mtimeMs <= maxAgeMs) {
          candidates.push({ path: abs, mtime: st.mtimeMs });
        }
      } catch {
        /* skip */
      }
    }
  };

  visit(absPackageDir, 0);
  // Also peek known default paths regardless of age (up to 24h for ingest assist).
  const known = [
    "stats.json",
    "dist/stats.json",
    "build/stats.json",
    "analyze/stats.json",
    "bundle-stats.json",
    "dist/bundle-stats.json",
    "stats.html.json",
    "dist/stats.html.json",
    ".next/analyze/client.json",
    ".next/diagnose/analyze/client.json",
  ];
  for (const rel of known) {
    const abs = join(absPackageDir, rel);
    if (!existsSync(abs)) continue;
    try {
      const st = statSync(abs);
      if (now - st.mtimeMs <= 24 * 60 * 60 * 1000) {
        candidates.push({ path: abs, mtime: st.mtimeMs });
      }
    } catch {
      /* skip */
    }
  }

  candidates.sort((a, b) => b.mtime - a.mtime);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    if (seen.has(c.path)) continue;
    seen.add(c.path);
    out.push(c.path);
    if (out.length >= 8) break;
  }
  return out;
}
