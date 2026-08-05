/**
 * Parsers for common frontend bundle analyzer / stats JSON (M-050).
 * Never invent sizes — return null when the payload is not recognizable.
 */

import type {
  BundleBundler,
  BundleChunk,
  BundleLoadType,
  BundleModule,
} from "@repo-prism/shared";

export type ParsedBundleStats = {
  readonly bundler: BundleBundler;
  readonly mode: "production" | "development" | "unknown";
  readonly chunks: readonly BundleChunk[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;
}

function packageNameFromPath(path: string): string | undefined {
  const norm = path.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("node_modules/");
  if (idx < 0) return undefined;
  const rest = norm.slice(idx + "node_modules/".length);
  if (rest.startsWith("@")) {
    const parts = rest.split("/");
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
    return parts[0];
  }
  return rest.split("/")[0];
}

function inferLoadType(
  name: string,
  flags?: { initial?: boolean; entry?: boolean; async?: boolean },
): BundleLoadType {
  if (flags?.initial || flags?.entry) return "initial";
  if (flags?.async) return "async";
  const lower = name.toLowerCase();
  if (
    lower.includes("main") ||
    lower.includes("app") ||
    lower.includes("runtime") ||
    lower.includes("framework") ||
    lower.includes("entry") ||
    lower.startsWith("page-") ||
    lower === "index"
  ) {
    return "initial";
  }
  if (
    lower.includes("async") ||
    lower.includes("chunk") ||
    lower.includes("lazy") ||
    /\[\d+\]/.test(lower)
  ) {
    return "async";
  }
  return "unknown";
}

function finalizeChunks(
  rawChunks: Array<{
    id: string;
    name: string;
    raw: number;
    gzip?: number;
    brotli?: number;
    loadType: BundleLoadType;
    modules: BundleModule[];
  }>,
): BundleChunk[] {
  const total = rawChunks.reduce((s, c) => s + c.raw, 0);
  return rawChunks
    .filter((c) => c.raw > 0)
    .sort((a, b) => b.raw - a.raw)
    .map((c) => {
      const chunkRaw = c.raw || 1;
      const modules = c.modules
        .slice()
        .sort((a, b) => b.bytes.raw - a.bytes.raw)
        .slice(0, 40)
        .map((m) => ({
          ...m,
          percentOfChunk: Math.round((m.bytes.raw / chunkRaw) * 1000) / 10,
        }));
      return {
        id: c.id,
        name: c.name,
        bytes: {
          raw: c.raw,
          ...(c.gzip === undefined ? {} : { gzip: c.gzip }),
          ...(c.brotli === undefined ? {} : { brotli: c.brotli }),
        },
        percentOfTotal: total > 0 ? Math.round((c.raw / total) * 1000) / 10 : 0,
        loadType: c.loadType,
        moduleCount: c.modules.length,
        modules,
      };
    });
}

/** Webpack stats.json (webpack-bundle-analyzer / webpack --json). */
export function parseWebpackStats(raw: unknown): ParsedBundleStats | null {
  if (!isRecord(raw)) return null;
  const assets = raw.assets;
  const chunks = raw.chunks;
  const modules = raw.modules;

  // Prefer chunk graph when present.
  if (Array.isArray(chunks) && chunks.length > 0) {
    const moduleById = new Map<string | number, Record<string, unknown>>();
    if (Array.isArray(modules)) {
      for (const m of modules) {
        if (!isRecord(m)) continue;
        if (m.id !== undefined) moduleById.set(m.id as string | number, m);
      }
    }

    const parsed = chunks
      .filter(isRecord)
      .map((ch, i) => {
        const names = Array.isArray(ch.names)
          ? ch.names.filter((n): n is string => typeof n === "string")
          : [];
        const files = Array.isArray(ch.files)
          ? ch.files.filter((n): n is string => typeof n === "string")
          : [];
        const name =
          names[0] ??
          files[0] ??
          (typeof ch.id === "string" || typeof ch.id === "number"
            ? String(ch.id)
            : `chunk-${i}`);
        const size =
          asNumber(ch.size) ??
          asNumber(ch.renderedLength) ??
          asNumber(ch.parsedLength) ??
          0;
        const gzip = asNumber(ch.gzipSize) ?? asNumber(ch.sizeGzip);
        const brotli = asNumber(ch.brotliSize) ?? asNumber(ch.sizeBrotli);
        const initial = ch.initial === true || ch.entry === true;
        const asyncFlag = ch.async === true || ch.initial === false;
        const mods: BundleModule[] = [];
        const chModules = ch.modules;
        if (Array.isArray(chModules)) {
          for (const m of chModules) {
            if (!isRecord(m)) continue;
            const mName =
              (typeof m.name === "string" && m.name) ||
              (typeof m.identifier === "string" && m.identifier) ||
              (typeof m.id === "string" || typeof m.id === "number"
                ? String(m.id)
                : "module");
            const mSize =
              asNumber(m.size) ??
              asNumber(m.renderedLength) ??
              asNumber(m.parsedLength) ??
              0;
            if (mSize <= 0) continue;
            const path =
              typeof m.nameForCondition === "string"
                ? m.nameForCondition
                : typeof m.identifier === "string"
                  ? m.identifier
                  : undefined;
            mods.push({
              id: String(m.id ?? mName),
              name: mName,
              ...(path === undefined ? {} : { path }),
              ...(packageNameFromPath(path ?? mName)
                ? { packageName: packageNameFromPath(path ?? mName) }
                : {}),
              bytes: { raw: mSize },
            });
          }
        } else if (Array.isArray(ch.moduleIds)) {
          for (const mid of ch.moduleIds) {
            const m = moduleById.get(mid as string | number);
            if (!m) continue;
            const mName =
              (typeof m.name === "string" && m.name) ||
              (typeof m.identifier === "string" && m.identifier) ||
              String(mid);
            const mSize = asNumber(m.size) ?? 0;
            if (mSize <= 0) continue;
            mods.push({
              id: String(mid),
              name: mName,
              ...(packageNameFromPath(mName)
                ? { packageName: packageNameFromPath(mName) }
                : {}),
              bytes: { raw: mSize },
            });
          }
        }
        return {
          id: String(ch.id ?? name),
          name,
          raw: size,
          ...(gzip === undefined ? {} : { gzip }),
          ...(brotli === undefined ? {} : { brotli }),
          loadType: inferLoadType(name, {
            initial,
            entry: ch.entry === true,
            async: asyncFlag && !initial,
          }),
          modules: mods,
        };
      })
      .filter((c) => c.raw > 0);

    if (parsed.length === 0) return null;
    const mode =
      raw.mode === "production" || raw.mode === "development"
        ? raw.mode
        : "unknown";
    return {
      bundler: "webpack",
      mode,
      chunks: finalizeChunks(parsed),
    };
  }

  // Fallback: assets only.
  if (Array.isArray(assets) && assets.length > 0) {
    const parsed = assets
      .filter(isRecord)
      .map((a, i) => {
        const name =
          (typeof a.name === "string" && a.name) ||
          (typeof a.id === "string" && a.id) ||
          `asset-${i}`;
        const size = asNumber(a.size) ?? 0;
        const gzip = asNumber(a.gzipSize);
        const brotli = asNumber(a.brotliSize);
        return {
          id: name,
          name,
          raw: size,
          ...(gzip === undefined ? {} : { gzip }),
          ...(brotli === undefined ? {} : { brotli }),
          loadType: inferLoadType(name),
          modules: [] as BundleModule[],
        };
      })
      .filter((c) => c.raw > 0 && /\.(js|css|mjs|cjs)(\?|$)/i.test(c.name));
    if (parsed.length === 0) return null;
    return {
      bundler: "webpack",
      mode: "unknown",
      chunks: finalizeChunks(parsed),
    };
  }

  return null;
}

/**
 * rollup-plugin-visualizer JSON (`template: "raw-data"` / `json`).
 * Shape: { version, tree?, nodeParts?, nodeMetas? } or flat { chunks/assets }.
 */
export function parseRollupVisualizer(raw: unknown): ParsedBundleStats | null {
  if (!isRecord(raw)) return null;

  // Template json: { version, tree: { name, children } }
  if (isRecord(raw.tree) || isRecord(raw.nodeParts)) {
    const nodeParts = isRecord(raw.nodeParts)
      ? (raw.nodeParts as Record<string, unknown>)
      : {};
    const nodeMetas = isRecord(raw.nodeMetas)
      ? (raw.nodeMetas as Record<string, unknown>)
      : {};

    type Acc = {
      id: string;
      name: string;
      raw: number;
      gzip?: number;
      brotli?: number;
      loadType: BundleLoadType;
      modules: BundleModule[];
    };
    const byChunk = new Map<string, Acc>();

    for (const [uid, part] of Object.entries(nodeParts)) {
      if (!isRecord(part)) continue;
      const meta = isRecord(nodeMetas[uid])
        ? (nodeMetas[uid] as Record<string, unknown>)
        : {};
      const rendered =
        asNumber(part.renderedLength) ?? asNumber(part.gzipLength) ?? 0;
      const gzip = asNumber(part.gzipLength);
      const brotli = asNumber(part.brotliLength);
      const id = typeof meta.id === "string" ? meta.id : uid;
      const moduleName =
        (typeof meta.id === "string" && meta.id) ||
        (Array.isArray(meta.moduleParts) ? String(uid) : uid);
      const importers = Array.isArray(meta.imported)
        ? meta.imported
        : Array.isArray(meta.importers)
          ? meta.importers
          : [];
      const chunkHint =
        (typeof meta.chunkName === "string" && meta.chunkName) ||
        (typeof part.chunkName === "string" && part.chunkName) ||
        (importers.length === 0 ? "entry" : "async");
      const existing = byChunk.get(chunkHint) ?? {
        id: chunkHint,
        name: chunkHint,
        raw: 0,
        loadType: inferLoadType(chunkHint, {
          entry: chunkHint === "entry" || chunkHint === "main",
        }),
        modules: [],
      };
      existing.raw += rendered;
      if (gzip !== undefined) {
        existing.gzip = (existing.gzip ?? 0) + gzip;
      }
      if (brotli !== undefined) {
        existing.brotli = (existing.brotli ?? 0) + brotli;
      }
      if (rendered > 0) {
        existing.modules.push({
          id,
          name: moduleName,
          path: typeof meta.id === "string" ? meta.id : undefined,
          ...(packageNameFromPath(moduleName)
            ? { packageName: packageNameFromPath(moduleName) }
            : {}),
          bytes: {
            raw: rendered,
            ...(gzip === undefined ? {} : { gzip }),
            ...(brotli === undefined ? {} : { brotli }),
          },
        });
      }
      byChunk.set(chunkHint, existing);
    }

    if (byChunk.size === 0 && isRecord(raw.tree)) {
      // Flatten tree children as modules under a single "bundle" chunk.
      const mods: BundleModule[] = [];
      const walk = (node: unknown, prefix: string): number => {
        if (!isRecord(node)) return 0;
        const children = node.children;
        if (Array.isArray(children) && children.length > 0) {
          let sum = 0;
          for (const child of children) {
            sum += walk(child, prefix);
          }
          return sum;
        }
        const size =
          asNumber(node.gzipSize) ??
          asNumber(node.brotliSize) ??
          asNumber(node.uid !== undefined ? undefined : node.value) ??
          asNumber(node.value) ??
          0;
        const name =
          (typeof node.name === "string" && node.name) || prefix || "module";
        if (size > 0) {
          mods.push({
            id: name,
            name,
            ...(packageNameFromPath(name)
              ? { packageName: packageNameFromPath(name) }
              : {}),
            bytes: { raw: size },
          });
        }
        return size;
      };
      const total = walk(raw.tree, "");
      if (total <= 0 && mods.length === 0) return null;
      return {
        bundler: "rollup",
        mode: "unknown",
        chunks: finalizeChunks([
          {
            id: "bundle",
            name: "bundle",
            raw: mods.reduce((s, m) => s + m.bytes.raw, 0) || total,
            loadType: "initial",
            modules: mods,
          },
        ]),
      };
    }

    if (byChunk.size === 0) return null;
    return {
      bundler: "rollup",
      mode: "unknown",
      chunks: finalizeChunks([...byChunk.values()]),
    };
  }

  // Flat list used by some visualizer exports.
  if (Array.isArray(raw.chunks) || Array.isArray(raw.assets)) {
    const list = (
      Array.isArray(raw.chunks) ? raw.chunks : raw.assets
    ) as unknown[];
    const parsed = list
      .filter(isRecord)
      .map((c, i) => {
        const name =
          (typeof c.name === "string" && c.name) ||
          (typeof c.fileName === "string" && c.fileName) ||
          `chunk-${i}`;
        const size =
          asNumber(c.size) ??
          asNumber(c.renderedLength) ??
          asNumber(c.value) ??
          0;
        const gzip = asNumber(c.gzipSize) ?? asNumber(c.gzipLength);
        const brotli = asNumber(c.brotliSize) ?? asNumber(c.brotliLength);
        return {
          id: name,
          name,
          raw: size,
          ...(gzip === undefined ? {} : { gzip }),
          ...(brotli === undefined ? {} : { brotli }),
          loadType: inferLoadType(name),
          modules: [] as BundleModule[],
        };
      })
      .filter((c) => c.raw > 0);
    if (parsed.length === 0) return null;
    return {
      bundler: "rollup",
      mode: "unknown",
      chunks: finalizeChunks(parsed),
    };
  }

  return null;
}

/** esbuild metafile JSON. */
export function parseEsbuildMetafile(raw: unknown): ParsedBundleStats | null {
  if (!isRecord(raw)) return null;
  const outputs = raw.outputs;
  if (!isRecord(outputs)) return null;

  const parsed: Array<{
    id: string;
    name: string;
    raw: number;
    gzip?: number;
    brotli?: number;
    loadType: BundleLoadType;
    modules: BundleModule[];
  }> = [];

  for (const [outPath, info] of Object.entries(outputs)) {
    if (!isRecord(info)) continue;
    if (!/\.(js|css|mjs|cjs)(\?|$)/i.test(outPath)) continue;
    const bytes = asNumber(info.bytes) ?? 0;
    if (bytes <= 0) continue;
    const mods: BundleModule[] = [];
    const inputs = info.inputs;
    if (isRecord(inputs)) {
      for (const [inPath, inInfo] of Object.entries(inputs)) {
        if (!isRecord(inInfo)) continue;
        const b = asNumber(inInfo.bytesInOutput) ?? asNumber(inInfo.bytes) ?? 0;
        if (b <= 0) continue;
        mods.push({
          id: inPath,
          name: inPath,
          path: inPath,
          ...(packageNameFromPath(inPath)
            ? { packageName: packageNameFromPath(inPath) }
            : {}),
          bytes: { raw: b },
        });
      }
    }
    const base = outPath.split("/").pop() ?? outPath;
    parsed.push({
      id: outPath,
      name: base,
      raw: bytes,
      loadType: inferLoadType(base, {
        entry:
          Array.isArray(info.entryPoint) || typeof info.entryPoint === "string",
      }),
      modules: mods,
    });
  }

  if (parsed.length === 0) return null;
  return {
    bundler: "esbuild",
    mode: "unknown",
    chunks: finalizeChunks(parsed),
  };
}

/**
 * Next.js analyze output — often webpack stats under `.next/analyze/` or a
 * nested client/server stats object.
 */
export function parseNextAnalyze(raw: unknown): ParsedBundleStats | null {
  if (!isRecord(raw)) return null;
  // Direct webpack stats.
  const asWebpack = parseWebpackStats(raw);
  if (asWebpack) {
    return { ...asWebpack, bundler: "next" };
  }
  // Nested { client, server } or { clientStats, serverStats }.
  for (const key of [
    "client",
    "clientStats",
    "server",
    "serverStats",
  ] as const) {
    const nested = raw[key];
    const parsed = parseWebpackStats(nested);
    if (parsed) return { ...parsed, bundler: "next" };
  }
  return null;
}

/** Try known formats in order; return first successful parse. */
export function parseBundleStatsJson(raw: unknown): ParsedBundleStats | null {
  if (!isRecord(raw)) return null;
  // esbuild metafile has outputs map without webpack `chunks`.
  if (isRecord(raw.outputs) && !Array.isArray(raw.chunks)) {
    const es = parseEsbuildMetafile(raw);
    if (es) return es;
  }
  if (isRecord(raw.nodeParts) || isRecord(raw.tree)) {
    const rv = parseRollupVisualizer(raw);
    if (rv) return rv;
  }
  const next = parseNextAnalyze(raw);
  if (next) return next;
  const webpack = parseWebpackStats(raw);
  if (webpack) return webpack;
  const rollup = parseRollupVisualizer(raw);
  if (rollup) return rollup;
  return null;
}
