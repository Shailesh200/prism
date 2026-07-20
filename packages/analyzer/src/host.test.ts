import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PrismErrorCode } from "@prism/shared";
import { createAnalyzerHost } from "./host.js";
import { createNoopPlugin } from "./noop-plugin.js";

describe("createAnalyzerHost", () => {
  it("lists registered plugins", () => {
    const host = createAnalyzerHost({ plugins: [createNoopPlugin()] });
    expect(host.listPlugins().map((p) => p.id)).toEqual(["noop"]);
  });

  it("analyzes a .noop fixture via parse + extract", async () => {
    const dir = await mkdtemp(join(tmpdir(), "prism-analyzer-"));
    const path = join(dir, "sample.noop");
    await writeFile(path, "hello", "utf8");

    const host = createAnalyzerHost({ plugins: [createNoopPlugin()] });
    const result = await host.analyzeFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.pluginId).toBe("noop");
    expect(result.value.symbols).toEqual([]);
    expect(result.value.imports).toEqual([]);
  });

  it("returns UNSUPPORTED when no plugin matches", async () => {
    const host = createAnalyzerHost({ plugins: [createNoopPlugin()] });
    const result = await host.analyzeFile("/tmp/file.ts");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(PrismErrorCode.UNSUPPORTED);
  });
});
