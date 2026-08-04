/**
 * Fallback bundle stats from on-disk production output (dist / .next chunks).
 * Honest file sizes after a real build — not import-graph estimates.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import type { BundleBundler, BundleChunk, BundleLoadType } from "@prism/shared";
import type { ParsedBundleStats } from "./bundle-parsers.js";

const ASSET_EXT = /\.(js|mjs|cjs|css)$/i;
const SKIP_DIR = new Set([
  "node_modules",
  ".git",
  "server",
  "ssr",
  "cache",
  "tmp",
]);

function inferLoadType(name: string, rel: string): BundleLoadType {
  const lower = `${name} ${rel}`.toLowerCase();
  if (
    lower.includes("entry") ||
    lower.includes("main") ||
    lower.includes("index") ||
    lower.includes("runtime") ||
    lower.includes("framework") ||
    /\/assets\/index[-.]/.test(lower)
  ) {
    return "initial";
  }
  if (
    lower.includes("async") ||
    lower.includes("chunk") ||
    lower.includes("lazy") ||
    /-[a-f0-9]{6,}\.(js|css)$/i.test(name)
  ) {
    return "async";
  }
  return "unknown";
}

function candidateRoots(
  packageAbs: string,
  bundler: BundleBundler,
): string[] {
  const roots: string[] = [];
  if (bundler === "next" || bundler === "unknown") {
    roots.push(
      join(packageAbs, ".next", "static", "chunks"),
      join(packageAbs, ".next", "static", "css"),
    );
  }
  if (bundler === "vite" || bundler === "webpack" || bundler === "unknown") {
    roots.push(join(packageAbs, "dist"), join(packageAbs, "build"));
  }
  if (bundler === "vite") {
    // Client assets only — skip SSR outDir when nested under dist/server.
    roots.push(join(packageAbs, "dist", "assets"));
  }
  return roots;
}

type AssetFile = {
  rel: string;
  abs: string;
  bytes: number;
  gzip?: number;
};

/** Raw size from stat; gzip from compressing file bytes (sync — analyze job only). */
function measureAsset(abs: string): { bytes: number; gzip?: number } | null {
  try {
    const st = statSync(abs);
    if (st.size <= 0) return null;
    try {
      const buf = readFileSync(abs);
      const gzip = gzipSync(buf).byteLength;
      return { bytes: buf.byteLength, gzip };
    } catch {
      return { bytes: st.size };
    }
  } catch {
    return null;
  }
}

function walkAssets(
  absDir: string,
  packageAbs: string,
  out: AssetFile[],
  depth: number,
): void {
  if (depth > 8 || out.length >= 400) return;
  if (!existsSync(absDir)) return;
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= 400) break;
    const name = entry.name;
    if (name.startsWith(".")) continue;
    const abs = join(absDir, name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      // Avoid scanning Vite SSR output as client chunks.
      if (name === "server" && absDir.endsWith("dist")) continue;
      walkAssets(abs, packageAbs, out, depth + 1);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!ASSET_EXT.test(name)) continue;
    if (name.endsWith(".map")) continue;
    const measured = measureAsset(abs);
    if (!measured) continue;
    out.push({
      abs,
      rel: relative(packageAbs, abs).replace(/\\/g, "/"),
      bytes: measured.bytes,
      ...(measured.gzip === undefined ? {} : { gzip: measured.gzip }),
    });
  }
}

/**
 * Build ParsedBundleStats from files produced by a production build.
 * Returns null when no assets are found.
 */
export function parseBuiltOutputAssets(
  packageAbs: string,
  bundler: BundleBundler,
): ParsedBundleStats | null {
  const files: AssetFile[] = [];
  const seen = new Set<string>();
  for (const root of candidateRoots(packageAbs, bundler)) {
    if (!existsSync(root)) continue;
    const batch: AssetFile[] = [];
    walkAssets(root, packageAbs, batch, 0);
    for (const f of batch) {
      if (seen.has(f.abs)) continue;
      seen.add(f.abs);
      files.push(f);
    }
  }
  if (files.length === 0) return null;

  files.sort((a, b) => b.bytes - a.bytes);
  const total = files.reduce((s, f) => s + f.bytes, 0);
  const chunks: BundleChunk[] = files.map((f, i) => {
    const name = basename(f.rel);
    const bytes = {
      raw: f.bytes,
      ...(f.gzip === undefined ? {} : { gzip: f.gzip }),
    };
    return {
      id: `asset:${i}:${f.rel}`,
      name: f.rel,
      bytes,
      percentOfTotal: total > 0 ? Math.round((f.bytes / total) * 1000) / 10 : 0,
      loadType: inferLoadType(name, f.rel),
      moduleCount: 1,
      modules: [
        {
          id: f.rel,
          name: name,
          path: f.rel,
          bytes,
          percentOfChunk: 100,
        },
      ],
    };
  });

  return {
    bundler: bundler === "unknown" ? "vite" : bundler,
    mode: "production",
    chunks,
  };
}
