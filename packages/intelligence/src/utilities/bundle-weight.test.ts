import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BundleWeightReportSchema, parseDto } from "@repo-prism/shared";
import { detectBundleAnalyzeCapability } from "./bundle-detect.js";
import {
  parseBundleStatsJson,
  parseEsbuildMetafile,
  parseRollupVisualizer,
  parseWebpackStats,
} from "./bundle-parsers.js";
import { buildBundleWeightReport, formatBytes } from "./bundle-weight.js";
import { createIngestStore } from "./ingest-store.js";
import {
  getBundleWeightReport,
  INGEST_KIND_BUNDLE_STATS,
} from "./bundle-weight-from-artifact.js";
import { UTILITY_JOB_BUNDLE_STATS, createUtilityJobService } from "./jobs.js";
import { createConsentStore } from "./consent.js";

const WEBPACK_FIXTURE = {
  mode: "production",
  chunks: [
    {
      id: 0,
      names: ["main"],
      files: ["main.js"],
      size: 120_000,
      gzipSize: 40_000,
      initial: true,
      entry: true,
      modules: [
        { id: 1, name: "./src/index.ts", size: 20_000 },
        {
          id: 2,
          name: "./node_modules/lodash/lodash.js",
          size: 90_000,
        },
      ],
    },
    {
      id: 1,
      names: ["vendors"],
      files: ["vendors.js"],
      size: 300_000,
      gzipSize: 90_000,
      async: true,
      modules: [
        {
          id: 3,
          name: "./node_modules/react/index.js",
          size: 200_000,
        },
        {
          id: 4,
          name: "./node_modules/react-dom/index.js",
          size: 100_000,
        },
      ],
    },
  ],
};

const ESBUILD_FIXTURE = {
  outputs: {
    "dist/app.js": {
      bytes: 50_000,
      entryPoint: "src/main.ts",
      inputs: {
        "src/main.ts": { bytesInOutput: 5_000 },
        "node_modules/foo/index.js": { bytesInOutput: 45_000 },
      },
    },
    "dist/chunk-async.js": {
      bytes: 10_000,
      inputs: {
        "src/lazy.ts": { bytesInOutput: 10_000 },
      },
    },
  },
};

const ROLLUP_VIS_FIXTURE = {
  version: 2,
  nodeParts: {
    a: { renderedLength: 12_000, gzipLength: 4_000 },
    b: { renderedLength: 8_000, gzipLength: 2_500 },
  },
  nodeMetas: {
    a: { id: "node_modules/big-lib/index.js", chunkName: "vendor" },
    b: { id: "src/app.ts", chunkName: "main" },
  },
};

describe("bundle parsers", () => {
  it("parses webpack stats with modules + gzip", () => {
    const parsed = parseWebpackStats(WEBPACK_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed!.bundler).toBe("webpack");
    expect(parsed!.mode).toBe("production");
    expect(parsed!.chunks.length).toBe(2);
    expect(parsed!.chunks[0]!.name).toBe("vendors");
    expect(parsed!.chunks[0]!.bytes.raw).toBe(300_000);
    expect(parsed!.chunks[0]!.bytes.gzip).toBe(90_000);
    expect(parsed!.chunks[0]!.modules[0]!.packageName).toBe("react");
  });

  it("parses esbuild metafile", () => {
    const parsed = parseEsbuildMetafile(ESBUILD_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed!.bundler).toBe("esbuild");
    expect(parsed!.chunks.some((c) => c.name === "app.js")).toBe(true);
    const app = parsed!.chunks.find((c) => c.name === "app.js")!;
    expect(app.modules.some((m) => m.packageName === "foo")).toBe(true);
  });

  it("parses rollup-plugin-visualizer nodeParts", () => {
    const parsed = parseRollupVisualizer(ROLLUP_VIS_FIXTURE);
    expect(parsed).not.toBeNull();
    expect(parsed!.chunks.length).toBeGreaterThanOrEqual(1);
    const vendor = parsed!.chunks.find((c) => c.name === "vendor");
    expect(vendor?.bytes.raw).toBe(12_000);
  });

  it("rejects unknown payloads", () => {
    expect(parseBundleStatsJson({ hello: "world" })).toBeNull();
    expect(parseBundleStatsJson(null)).toBeNull();
  });
});

describe("buildBundleWeightReport", () => {
  it("builds overview, rollups, highlights, and validates Zod", () => {
    const parsed = parseWebpackStats(WEBPACK_FIXTURE)!;
    const report = buildBundleWeightReport({
      parsed,
      source: "ingest",
      thresholds: { heavyChunkBytes: 200_000, heavyModuleBytes: 80_000 },
    });
    expect(report.overview.totalRaw).toBe(420_000);
    expect(report.overview.chunkCount).toBe(2);
    expect(report.overview.largestChunkName).toBe("vendors");
    expect(report.packageRollups.some((p) => p.name === "react")).toBe(true);
    expect(report.highlights.some((h) => h.severity === "heavy")).toBe(true);
    expect(formatBytes(1024)).toContain("KB");
    const dto = parseDto(BundleWeightReportSchema, report);
    expect(dto.ok).toBe(true);
  });
});

describe("detectBundleAnalyzeCapability", () => {
  it("detects analyze script and next bundler", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-bundle-detect-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "demo-web",
        scripts: { analyze: "ANALYZE=true next build" },
        dependencies: { next: "14.0.0" },
        devDependencies: { "@next/bundle-analyzer": "14.0.0" },
      }),
      "utf8",
    );
    writeFileSync(
      join(root, "next.config.mjs"),
      "export default {};\n",
      "utf8",
    );
    const cap = detectBundleAnalyzeCapability(root);
    expect(cap.supported).toBe(true);
    expect(cap.preferredStrategy).toBe("project-script");
    expect(cap.scripts[0]?.scriptName).toBe("analyze");
    expect(cap.bundlers).toContain("next");
  });

  it("prefers prism-managed for vite without analyze script", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-bundle-vite-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "vite-app",
        scripts: { build: "vite build" },
        devDependencies: { vite: "5.0.0" },
      }),
      "utf8",
    );
    writeFileSync(join(root, "vite.config.ts"), "export default {};\n", "utf8");
    const cap = detectBundleAnalyzeCapability(root);
    expect(cap.supported).toBe(true);
    expect(cap.preferredStrategy).toBe("prism-managed");
  });

  it("reports unsupported for empty node package", () => {
    const root = mkdtempSync(join(tmpdir(), "prism-bundle-none-"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ name: "lib-only", scripts: { test: "echo ok" } }),
      "utf8",
    );
    const cap = detectBundleAnalyzeCapability(root);
    expect(cap.supported).toBe(false);
    expect(cap.preferredStrategy).toBe("none");
    expect(cap.reason).toBeTruthy();
  });
});

describe("bundle-stats ingest + job (mode=ingest)", () => {
  it("writes artifact and loads BundleWeightReport", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-bundle-job-"));
    mkdirSync(join(root, ".prism"), { recursive: true });
    const statsPath = join(root, "stats.json");
    writeFileSync(statsPath, JSON.stringify(WEBPACK_FIXTURE), "utf8");

    const consent = createConsentStore({ workspaceRoot: root });
    const ingest = createIngestStore({ workspaceRoot: root });
    const jobs = createUtilityJobService({
      ingest,
      consent,
      workspaceRoot: root,
    });

    await consent.set("run.local-build", true);
    const job = await jobs.start({
      kind: UTILITY_JOB_BUNDLE_STATS,
      bundleAnalyze: { mode: "ingest", reportPath: statsPath },
    });
    expect(job.ok).toBe(true);
    if (!job.ok) return;
    expect(job.value.status).toBe("succeeded");
    expect(job.value.resultArtifactId).toBeTruthy();

    const report = await getBundleWeightReport(
      ingest,
      job.value.resultArtifactId!,
    );
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value.overview.totalRaw).toBe(420_000);
    expect(report.value.source).toBe("ingest");

    const listed = await ingest.list({ kind: INGEST_KIND_BUNDLE_STATS });
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value.length).toBeGreaterThanOrEqual(1);
  });

  it("requires consent for bundle-stats", async () => {
    const root = mkdtempSync(join(tmpdir(), "prism-bundle-consent-"));
    mkdirSync(join(root, ".prism"), { recursive: true });
    const consent = createConsentStore({ workspaceRoot: root });
    const ingest = createIngestStore({ workspaceRoot: root });
    const jobs = createUtilityJobService({
      ingest,
      consent,
      workspaceRoot: root,
    });
    const blocked = await jobs.start({
      kind: UTILITY_JOB_BUNDLE_STATS,
      bundleAnalyze: { mode: "discover" },
    });
    expect(blocked.ok).toBe(false);
  });
});
