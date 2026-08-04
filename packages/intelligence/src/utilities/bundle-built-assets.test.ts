import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBuiltOutputAssets } from "./bundle-built-assets.js";
import { buildBundleWeightReport } from "./bundle-weight.js";

describe("parseBuiltOutputAssets", () => {
  it("reads vite dist assets as production chunks with gzip", () => {
    const root = join(
      process.cwd(),
      "fixtures-tmp-bundle-assets-" + String(Date.now()),
    );
    const assets = join(root, "dist", "assets");
    mkdirSync(assets, { recursive: true });
    const vendorBody = "y".repeat(5000);
    writeFileSync(join(assets, "index-abc123.js"), "x".repeat(1200));
    writeFileSync(join(assets, "vendor-def456.js"), vendorBody);
    writeFileSync(join(assets, "style-ghi.css"), "z".repeat(800));

    const parsed = parseBuiltOutputAssets(root, "vite");
    expect(parsed).not.toBeNull();
    expect(parsed!.chunks.length).toBe(3);
    expect(parsed!.chunks[0]!.bytes.raw).toBe(5000);
    expect(parsed!.chunks[0]!.bytes.gzip).toBe(gzipSync(vendorBody).byteLength);
    expect(parsed!.mode).toBe("production");

    const report = buildBundleWeightReport({
      parsed: parsed!,
      source: "prism-managed",
    });
    expect(report.overview.totalGzip).toBeDefined();
    expect(report.overview.totalGzip!).toBeGreaterThan(0);
    expect(report.overview.totalGzip!).toBeLessThan(report.overview.totalRaw);
  });
});
