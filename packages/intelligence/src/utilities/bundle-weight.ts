/**
 * Build BundleWeightReport from parsed stats (M-050).
 */

import type {
  BundleBuildLabel,
  BundleHighlight,
  BundlePackageRollup,
  BundleWeightReport,
  BundleWeightThresholds,
} from "@prism/shared";
import type { ParsedBundleStats } from "./bundle-parsers.js";

export const BUNDLE_WEIGHT_CALLOUT =
  "Bundle Weight uses real bundler stats from a local Analyze run (project script or Prism-managed). Sizes are never invented from the import graph.";

export const DEFAULT_BUNDLE_THRESHOLDS: BundleWeightThresholds = {
  heavyChunkBytes: 250_000,
  heavyModuleBytes: 100_000,
};

export type BuildBundleWeightReportInput = {
  readonly parsed: ParsedBundleStats;
  readonly source: BundleWeightReport["source"];
  readonly build?: Partial<BundleBuildLabel>;
  readonly thresholds?: Partial<BundleWeightThresholds>;
  readonly collectedAt?: string;
  readonly unsupportedReason?: string;
};

function packageRollupsFromChunks(
  chunks: ParsedBundleStats["chunks"],
  totalRaw: number,
): BundlePackageRollup[] {
  const map = new Map<
    string,
    { raw: number; gzip: number; brotli: number; count: number }
  >();
  for (const ch of chunks) {
    for (const m of ch.modules) {
      const name = m.packageName ?? "(app)";
      const cur = map.get(name) ?? { raw: 0, gzip: 0, brotli: 0, count: 0 };
      cur.raw += m.bytes.raw;
      cur.gzip += m.bytes.gzip ?? 0;
      cur.brotli += m.bytes.brotli ?? 0;
      cur.count += 1;
      map.set(name, cur);
    }
  }
  const total = totalRaw || 1;
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      bytes: {
        raw: v.raw,
        ...(v.gzip > 0 ? { gzip: v.gzip } : {}),
        ...(v.brotli > 0 ? { brotli: v.brotli } : {}),
      },
      percentOfTotal: Math.round((v.raw / total) * 1000) / 10,
      moduleCount: v.count,
    }))
    .sort((a, b) => b.bytes.raw - a.bytes.raw)
    .slice(0, 30);
}

function buildHighlights(
  chunks: ParsedBundleStats["chunks"],
  thresholds: BundleWeightThresholds,
): BundleHighlight[] {
  const out: BundleHighlight[] = [];
  for (const ch of chunks) {
    if (ch.bytes.raw >= thresholds.heavyChunkBytes) {
      out.push({
        id: `chunk-heavy:${ch.id}`,
        severity: "heavy",
        title: `Heavy chunk: ${ch.name}`,
        detail: `${formatBytes(ch.bytes.raw)} raw (${ch.percentOfTotal}% of total)`,
        chunkId: ch.id,
      });
    }
    for (const m of ch.modules) {
      if (m.bytes.raw >= thresholds.heavyModuleBytes) {
        out.push({
          id: `module-heavy:${ch.id}:${m.id}`,
          severity:
            m.bytes.raw >= thresholds.heavyChunkBytes ? "heavy" : "warn",
          title: `Heavy module: ${shortName(m.name)}`,
          detail: `${formatBytes(m.bytes.raw)} in ${ch.name}${
            m.packageName ? ` · ${m.packageName}` : ""
          }`,
          chunkId: ch.id,
          moduleId: m.id,
        });
      }
    }
  }
  return out.slice(0, 40);
}

function shortName(name: string): string {
  const norm = name.replace(/\\/g, "/");
  const parts = norm.split("/");
  return parts.length > 3 ? parts.slice(-3).join("/") : norm;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildBundleWeightReport(
  input: BuildBundleWeightReportInput,
): BundleWeightReport {
  const thresholds: BundleWeightThresholds = {
    ...DEFAULT_BUNDLE_THRESHOLDS,
    ...input.thresholds,
  };
  const chunks = [...input.parsed.chunks];
  const totalRaw = chunks.reduce((s, c) => s + c.bytes.raw, 0);
  const totalGzip = chunks.every((c) => c.bytes.gzip !== undefined)
    ? chunks.reduce((s, c) => s + (c.bytes.gzip ?? 0), 0)
    : undefined;
  const totalBrotli = chunks.every((c) => c.bytes.brotli !== undefined)
    ? chunks.reduce((s, c) => s + (c.bytes.brotli ?? 0), 0)
    : undefined;
  const initialRaw = chunks
    .filter((c) => c.loadType === "initial")
    .reduce((s, c) => s + c.bytes.raw, 0);
  const asyncRaw = chunks
    .filter((c) => c.loadType === "async")
    .reduce((s, c) => s + c.bytes.raw, 0);
  const largest = chunks[0];
  const collectedAt = input.collectedAt ?? new Date().toISOString();
  const build: BundleBuildLabel = {
    bundler: input.build?.bundler ?? input.parsed.bundler,
    mode: input.build?.mode ?? input.parsed.mode,
    timestamp: input.build?.timestamp ?? collectedAt,
    ...(input.build?.packageName === undefined
      ? {}
      : { packageName: input.build.packageName }),
    ...(input.build?.packageId === undefined
      ? {}
      : { packageId: input.build.packageId }),
    ...(input.build?.scriptName === undefined
      ? {}
      : { scriptName: input.build.scriptName }),
  };

  return {
    collectedAt,
    source: input.source,
    callout: BUNDLE_WEIGHT_CALLOUT,
    build,
    overview: {
      totalRaw,
      ...(totalGzip === undefined ? {} : { totalGzip }),
      ...(totalBrotli === undefined ? {} : { totalBrotli }),
      chunkCount: chunks.length,
      initialRaw,
      asyncRaw,
      ...(largest
        ? { largestChunkName: largest.name, largestChunkRaw: largest.bytes.raw }
        : {}),
    },
    chunks,
    packageRollups: packageRollupsFromChunks(chunks, totalRaw),
    highlights: buildHighlights(chunks, thresholds),
    thresholds,
    ...(input.unsupportedReason === undefined
      ? {}
      : { unsupportedReason: input.unsupportedReason }),
  };
}

export function emptyUnsupportedBundleReport(
  reason: string,
  build?: Partial<BundleBuildLabel>,
): BundleWeightReport {
  const collectedAt = new Date().toISOString();
  return {
    collectedAt,
    source: "ingest",
    callout: BUNDLE_WEIGHT_CALLOUT,
    build: {
      bundler: build?.bundler ?? "unknown",
      mode: build?.mode ?? "unknown",
      timestamp: collectedAt,
      ...(build?.packageName === undefined
        ? {}
        : { packageName: build.packageName }),
      ...(build?.packageId === undefined ? {} : { packageId: build.packageId }),
    },
    overview: {
      totalRaw: 0,
      chunkCount: 0,
      initialRaw: 0,
      asyncRaw: 0,
    },
    chunks: [],
    packageRollups: [],
    highlights: [],
    thresholds: DEFAULT_BUNDLE_THRESHOLDS,
    unsupportedReason: reason,
  };
}
